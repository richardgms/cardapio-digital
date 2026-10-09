import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseOrderReceiptDocument, renderOrderReceipt } from './order-receipt';

const id = z.string().uuid();
const jobOperation = { job_id: id, lease_token: id };
const operation = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('health') }).strict(),
    z.object({ operation: z.literal('calibration_start'), request_id: id, queue_name: z.string().trim().min(1).max(160), paper_width_mm: z.union([z.literal(58), z.literal(80)]) }).strict(),
    z.object({ operation: z.literal('calibration_dispatch'), test_id: id }).strict(),
    z.object({ operation: z.literal('calibration_finish'), test_id: id, outcome: z.enum(['spooler_submitted', 'uncertain']) }).strict(),
    z.object({ operation: z.literal('calibration_confirm'), test_id: id }).strict(),
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
    enabled: boolean; selfServiceEnabled?: boolean; rpc: PrintRpc; allow: (fingerprint: string) => boolean;
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
        if (input.operation === 'calibration_start' || input.operation === 'calibration_dispatch' || input.operation === 'calibration_finish' || input.operation === 'calibration_confirm') {
            if (!dependencies.selfServiceEnabled) return json({ error: 'calibration_not_available' }, 503);
            const args = input.operation === 'calibration_start' ? { ...auth, p_request: input.request_id, p_queue: input.queue_name, p_width: input.paper_width_mm } :
                { ...auth, p_test: input.test_id, ...(input.operation === 'calibration_finish' ? { p_outcome: input.outcome } : {}) };
            const result = await rpc('rmenu_print_' + input.operation, args);
            if (result.error) return json({ error: result.error.code === '42501' ? 'unauthorized' : 'calibration_not_confirmed' }, result.error.code === '42501' ? 401 : 409);
            if (input.operation === 'calibration_start') {
                const test = z.object({ test_id: id, state: z.enum(['requested','dispatching','spooler_submitted','uncertain','paper_confirmed']), expires_at: z.string().datetime({offset:true}), queue_name: z.string().min(1).max(160), paper_width_mm: z.union([z.literal(58),z.literal(80)]) }).strict().parse(result.data);
                if (test.queue_name !== input.queue_name || test.paper_width_mm !== input.paper_width_mm) throw new Error('invalid_response');
                const lineWidth = test.paper_width_mm === 80 ? 42 : 32;
                return json({ test, lines: ['RMENU - TESTE DE IMPRESSAO', 'SEM PEDIDO REAL', 'Teste: ' + test.test_id.slice(0,8), '-'.repeat(lineWidth), 'Texto: ç á é í ó ú ã õ', '1234567890'.repeat(5).slice(0,lineWidth), 'Confira uma via, largura e corte', 'Nao confirma pagamento.'] });
            }
            if (typeof result.data !== 'boolean') throw new Error('invalid_response');
            return json({ accepted: result.data });
        }
        const args = input.operation === 'health' ? { ...auth, p_job: '00000000-0000-0000-0000-000000000000' } : input.operation === 'claim' ? auth :
            input.operation === 'inspect' ? { ...auth, p_job: input.job_id } :
                { ...auth, p_job: input.job_id, p_lease: input.lease_token, ...(input.operation === 'finish' ? { p_outcome: input.outcome } : {}) };
        const name = { health: 'inspect', claim: 'claim', inspect: 'inspect', renew: 'renew', dispatch: 'begin_dispatch', finish: 'finish' }[input.operation];
        const result = await rpc('rmenu_print_' + name, args);
        if (result.error) return json({ error: result.error.code === '42501' ? 'unauthorized' : 'temporarily_unavailable' }, result.error.code === '42501' ? 401 : 503);
        if (input.operation === 'health') {
            // inspect authenticates internally; sentinel never fetches a credential row.
            if (result.data !== null) throw new Error('invalid_response');
            return json({ authenticated: true, protocol_version: 1, lease_seconds: 60, ...(dependencies.selfServiceEnabled ? { self_service_calibration: true } : {}) });
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
