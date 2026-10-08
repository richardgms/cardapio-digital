import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseOrderReceiptDocument, renderOrderReceipt } from './order-receipt';

const id = z.string().uuid();
const jobOperation = { job_id: id, lease_token: id };
const operation = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('health') }).strict(),
    z.object({ operation: z.literal('claim') }).strict(),
    z.object({ operation: z.literal('inspect'), job_id: id }).strict(),
    z.object({ operation: z.literal('renew'), ...jobOperation }).strict(),
    z.object({ operation: z.literal('dispatch'), ...jobOperation }).strict(),
    z.object({ operation: z.literal('finish'), ...jobOperation, outcome: z.enum(['spooler_submitted', 'uncertain', 'failed']) }).strict(),
]);
const claimSchema = z.object({
    job: z.object({ id, order_id: id, purpose: z.enum(['initial', 'reprint']), lease_token: id,
        lease_expires_at: z.string().datetime({ offset: true }), document: z.unknown() }).strict(),
    device: z.object({ id, queue_name: z.string().min(1).max(160), paper_width_mm: z.union([z.literal(58), z.literal(80)]), copies: z.literal(1) }).strict(),
}).strict();
export type PrintRpc = (name: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

// Bounded per-process protection; SQL lease/dispatch remain the global authority.
// No raw token/IP or secrets in this map or errors. Platform rate limits are additional.
export function createPrintRequestLimiter(now = Date.now, capacity = 2_000) {
    const attempts = new Map<string, { minute: number; count: number }>();
    return (fingerprint: string) => {
        const minute = Math.floor(now() / 60_000);
        const previous = attempts.get(fingerprint);
        if (previous?.minute === minute) { previous.count++; return previous.count <= 90; }
        for (const [key, entry] of attempts) if (entry.minute < minute) attempts.delete(key);
        if (attempts.size >= capacity) return false;
        attempts.set(fingerprint, { minute, count: 1 });
        return true;
    };
}
export const hashPrintCredential = (credential: string) => createHash('sha256').update(credential).digest('hex');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private',
    'pragma': 'no-cache', 'x-content-type-options': 'nosniff',
} });

async function readSmallJson(request: Request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('invalid_request');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('invalid_request');
    const chunks: Uint8Array[] = []; let size = 0, timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 3_000);
    try {
        for (;;) {
            const { done, value } = await reader.read(); if (timedOut) throw new Error('invalid_request'); if (done) break;
            size += value.length; if (size > 4096) { await reader.cancel(); throw new Error('invalid_request'); }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } finally { clearTimeout(deadline); reader.releaseLock(); }
}

export async function handlePrintAgentRequest(request: Request, dependencies: {
    enabled: boolean; rpc: PrintRpc; allow: (fingerprint: string) => boolean;
}) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!dependencies.enabled) return json({ error: 'printing_module_disabled' }, 503);
    const url = new URL(request.url);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost');
    if ((url.protocol !== 'https:' && !loopback) || request.headers.has('origin') || url.search) return json({ error: 'invalid_transport' }, 403);
    const deviceId = request.headers.get('x-rmenu-device');
    const authorization = request.headers.get('authorization');
    if (!deviceId || !id.safeParse(deviceId).success || !authorization?.match(/^Bearer [0-9a-f]{64}$/)) return json({ error: 'unauthorized' }, 401);
    const tokenHash = hashPrintCredential(authorization.slice(7));
    if (!dependencies.allow(hashPrintCredential(deviceId + ':' + tokenHash))) return json({ error: 'rate_limited' }, 429);
    let input: z.infer<typeof operation>;
    try { input = operation.parse(await readSmallJson(request)); } catch { return json({ error: 'invalid_request' }, 400); }
    const auth = { p_device: deviceId, p_hash: tokenHash };
    const rpc = dependencies.rpc;
    try {
        const args = input.operation === 'health' ? { ...auth, p_job: '00000000-0000-0000-0000-000000000000' } : input.operation === 'claim' ? auth :
            input.operation === 'inspect' ? { ...auth, p_job: input.job_id } :
                { ...auth, p_job: input.job_id, p_lease: input.lease_token, ...(input.operation === 'finish' ? { p_outcome: input.outcome } : {}) };
        const name = { health: 'inspect', claim: 'claim', inspect: 'inspect', renew: 'renew', dispatch: 'begin_dispatch', finish: 'finish' }[input.operation];
        const result = await rpc('rmenu_print_' + name, args);
        if (result.error) return json({ error: result.error.code === '42501' ? 'unauthorized' : 'temporarily_unavailable' }, result.error.code === '42501' ? 401 : 503);
        if (input.operation === 'health') {
            // inspect authenticates internally; sentinel never fetches a credential row.
            if (result.data !== null) throw new Error('invalid_response');
            return json({ authenticated: true, protocol_version: 1, lease_seconds: 60 });
        }
        if (input.operation === 'inspect') {
            if (result.data === null) return json({ job: null });
            const inspected = z.object({ id, state: z.enum(['pending', 'leased', 'dispatching', 'spooler_submitted', 'uncertain', 'failed', 'cancelled']),
                lease_expires_at: z.string().datetime({ offset: true }).nullable(), dispatched_at: z.string().datetime({ offset: true }).nullable(), completed_at: z.string().datetime({ offset: true }).nullable() }).strict().parse(result.data);
            return json({ job: inspected });
        }
        if (input.operation !== 'claim') {
            if (typeof result.data !== 'boolean') throw new Error('invalid_response');
            return json({ accepted: result.data });
        }
        if (z.object({ job: z.null() }).strict().safeParse(result.data).success) return json({ job: null });
        const claimed = claimSchema.parse(result.data);
        if (claimed.device.id !== deviceId) throw new Error('invalid_response');
        try {
            const document = parseOrderReceiptDocument(claimed.job.document);
            if (document.order_id !== claimed.job.order_id) throw new Error('invalid_document');
            const prefix = claimed.job.purpose === 'reprint' ? 'REIMPRESSÃO - VIA ADICIONAL\n' : '';
            const receipt = prefix + renderOrderReceipt(document, claimed.device.paper_width_mm === 80 ? 42 : 32);
            const lines = receipt.trimEnd().split('\n');
            if (lines.length > 400 || Buffer.byteLength(receipt) > 64_000) throw new Error('receipt_too_large');
            return json({ protocol_version: 1, job: { id: claimed.job.id, order_id: claimed.job.order_id, purpose: claimed.job.purpose,
                document_version: document.document_version, lease_token: claimed.job.lease_token, lease_expires_at: claimed.job.lease_expires_at,
                receipt_sha256: hashPrintCredential(receipt), lines }, device: claimed.device });
        } catch {
            // Failure is BEFORE dispatch; never pass a partial/invalid receipt to the PC.
            await rpc('rmenu_print_finish', { ...auth, p_job: claimed.job.id, p_lease: claimed.job.lease_token, p_outcome: 'failed' });
            return json({ error: 'receipt_unavailable' }, 422);
        }
    } catch { return json({ error: 'temporarily_unavailable' }, 503); }
}
