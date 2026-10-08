import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashPrintCredential, type PrintRpc } from './print-agent-api';

const label = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
const registration = z.object({ store_id: z.string().uuid(), name: label(80), queue_name: label(160), paper_width_mm: z.union([z.literal(58), z.literal(80)]) }).strict();
export async function registerPrintDevice(input: unknown, dependencies: {
    enabled: boolean; getOwnerId: () => Promise<string | null>; rpc: PrintRpc;
}) {
    if (!dependencies.enabled) return { ok: false as const, error: 'Configuração de impressão ainda não liberada.' };
    const parsed = registration.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: 'Confira nome, fila e largura do papel.' };
    const owner = await dependencies.getOwnerId();
    if (!owner || owner !== parsed.data.store_id) return { ok: false as const, error: 'Acesso negado.' };
    const credential = randomBytes(32).toString('hex');
    const result = await dependencies.rpc('rmenu_print_register_device', { p_store: owner, p_actor: owner,
        p_name: parsed.data.name, p_queue: parsed.data.queue_name, p_width: parsed.data.paper_width_mm, p_hash: hashPrintCredential(credential) });
    if (result.error || !z.string().uuid().safeParse(result.data).success) return { ok: false as const, error: 'Não foi possível concluir o cadastro. Confira a lista antes de tentar novamente.' };
    return { ok: true as const, device_id: result.data as string, credential };
}

export { isPrintAgentEndpointAllowed } from './print-agent-config';
