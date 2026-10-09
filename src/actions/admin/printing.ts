'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerPrintDevice } from '@/lib/print-device-service';
import { isPrintActivationReadyForStore, isPrintSelfServiceEnabled } from '@/lib/print-activation';
import { parsePrintSelfServiceCheck } from '@/lib/print-self-service';
import type { PrintRpc } from '@/lib/print-agent-api';

async function ownerId() {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    const { data: store } = await client.from('store_config').select('id').eq('id', user.id).maybeSingle();
    return store?.id === user.id ? user.id : null;
}
const rpc: PrintRpc = async (name, parameters) => {
    const { data, error } = await createAdminClient().rpc(name, parameters).abortSignal(AbortSignal.timeout(8_000));
    return { data, error: error ? { code: error.code } : null };
};
export async function createPrintDevice(input: unknown) {
    try { return await registerPrintDevice(input, { enabled: process.env.RMENU_PRINT_AGENT_ENABLED === '1', getOwnerId: ownerId, rpc }); }
    catch { return { ok: false as const, error: 'Não foi possível concluir o cadastro. Confira a lista antes de tentar novamente.' }; }
}
export async function getPrintConfiguration() {
    const owner = await ownerId();
    if (!owner) throw new Error('Acesso negado.');
    const client = await createClient();
    const [settings, devices] = await Promise.all([
        client.from('print_settings').select('enabled,cutoff_at').eq('store_id', owner).maybeSingle(),
        client.from('print_devices').select('id,name,queue_name,paper_width_mm,revoked_at,created_at').eq('store_id', owner).order('created_at'),
    ]);
    if (settings.error || devices.error) throw new Error('Não foi possível consultar a configuração.');
    const configuration = z.object({ store_id: z.string().uuid(), enabled: z.boolean(), cutoff_at: z.string().datetime({ offset: true }).nullable(), devices: z.array(z.object({
        id: z.string().uuid(), name: z.string(), queue_name: z.string(), paper_width_mm: z.union([z.literal(58), z.literal(80)]),
        revoked_at: z.string().datetime({ offset: true }).nullable(), created_at: z.string().datetime({ offset: true }),
    })) }).parse({ store_id: owner, enabled: settings.data?.enabled ?? false, cutoff_at: settings.data?.cutoff_at ?? null, devices: devices.data ?? [] });
    const selfService = isPrintSelfServiceEnabled();
    let check = parsePrintSelfServiceCheck(null);
    if (selfService) {
        try {
            const status = await rpc('rmenu_print_self_service_status', { p_store: owner, p_actor: owner });
            check = parsePrintSelfServiceCheck(status.error ? null : status.data);
        } catch { /* Fail closed for activation; settings and disable remain available. */ }
    }
    return { ...configuration, self_service: selfService, self_service_check: check };
}
export async function setPrintEnabled(input: unknown) {
    const parsed = z.object({ store_id: z.string().uuid(), enabled: z.boolean(), calibration_confirmed: z.boolean() }).strict().safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Configuração inválida.' };
    if (parsed.data.enabled && !parsed.data.calibration_confirmed)
        return { ok: false, error: 'Ativação indisponível até concluir a validação de impressão.' };
    try {
        const owner = await ownerId();
        if (!owner || owner !== parsed.data.store_id) return { ok: false, error: 'Acesso negado.' };
        const selfService = parsed.data.enabled && isPrintSelfServiceEnabled();
        if (parsed.data.enabled && !selfService && !isPrintActivationReadyForStore(owner)) return { ok: false, error: 'Ativação ainda não liberada para esta loja.' };
        const result = selfService ? await rpc('rmenu_print_self_service_enable', { p_store: owner, p_actor: owner }) :
            await rpc('rmenu_print_set_enabled', { p_store: owner, p_actor: owner, p_enabled: parsed.data.enabled });
        if (selfService && result.error) return { ok: false, error: 'Conclua o teste no assistente, confirme o papel e mantenha o computador conectado. Depois atualize esta página.' };
        return result.error ? { ok: false, error: 'Não foi possível alterar a impressão.' } : { ok: true };
    } catch { return { ok: false, error: 'Não foi possível alterar a impressão. Recarregue para conferir o estado.' }; }
}
export async function revokePrintDevice(input: unknown) {
    const parsed = z.object({ store_id: z.string().uuid(), device_id: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Dispositivo inválido.' };
    try {
        const owner = await ownerId();
        if (!owner || owner !== parsed.data.store_id) return { ok: false, error: 'Acesso negado.' };
        const result = await rpc('rmenu_print_revoke_device', { p_store: owner, p_actor: owner, p_device: parsed.data.device_id });
        return result.error || result.data !== true ? { ok: false, error: 'Não foi possível revogar o dispositivo.' } : { ok: true };
    } catch { return { ok: false, error: 'Não foi possível revogar. Recarregue para conferir o estado.' }; }
}
export async function requestOrderReprint(input: unknown) {
    const parsed = z.object({ store_id: z.string().uuid(), order_id: z.string().uuid(), request_key: z.string().uuid(), reason: z.string().trim().min(3).max(240) }).strict().safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Informe um motivo de 3 a 240 caracteres.' };
    try {
        const owner = await ownerId();
        if (!owner || owner !== parsed.data.store_id) return { ok: false, error: 'Acesso negado.' };
        if (isPrintSelfServiceEnabled()) {
            const status = await rpc('rmenu_print_self_service_status', { p_store: owner, p_actor: owner });
            if (status.error || !parsePrintSelfServiceCheck(status.data).ready) return { ok: false, error: 'Conecte o computador com teste confirmado antes de solicitar outra via.' };
        } else if (!isPrintActivationReadyForStore(owner)) return { ok: false, error: 'Reimpressão ainda não liberada para esta loja.' };
        const result = await rpc('rmenu_print_request_reprint', { p_store: owner, p_actor: owner, p_order: parsed.data.order_id, p_key: parsed.data.request_key, p_reason: parsed.data.reason });
        return result.error || !z.string().uuid().safeParse(result.data).success ? { ok: false, error: 'Não foi possível solicitar a reimpressão. Confira o histórico antes de tentar com outra chave.' } : { ok: true };
    } catch { return { ok: false, error: 'Não foi possível confirmar a solicitação. Confira o histórico antes de tentar com outra chave.' }; }
}
