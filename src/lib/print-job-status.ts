export type PrintJobState = 'pending' | 'leased' | 'dispatching' | 'spooler_submitted' | 'uncertain' | 'failed' | 'cancelled';
export interface PrintJobView {
    id: string; purpose: 'initial' | 'reprint'; state: PrintJobState;
    reason: string | null; requested_by: string | null;
    created_at: string; lease_expires_at: string | null; dispatched_at: string | null; completed_at: string | null;
}
export const ORDER_DETAIL_WITH_PRINTING = '*, items:order_items(*), document:order_documents(jobs:print_jobs(id,purpose,state,reason,requested_by,created_at,lease_expires_at,dispatched_at,completed_at))';
export function printJobLabel(job: PrintJobView, now = Date.now()) {
    if (job.state === 'dispatching' && job.lease_expires_at && Date.parse(job.lease_expires_at) <= now) return 'Resultado incerto; conferir papel e fila';
    return { pending: 'Na fila', leased: 'Reservado pelo agente', dispatching: 'Envio iniciado',
        spooler_submitted: 'Enviado ao spooler; papel não confirmado', uncertain: 'Resultado incerto; conferir papel e fila',
        failed: 'Falha antes do envio', cancelled: 'Impressão cancelada' }[job.state];
}
