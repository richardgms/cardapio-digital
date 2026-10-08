'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { requestOrderReprint } from '@/actions/admin/printing';
import { printJobLabel, type PrintJobView } from '@/lib/print-job-status';
import { withReadDeadline } from '@/lib/orders-refresh';

export function PrintHistory({ jobs, storeId, orderId, allowReprint, onChanged }: {
    jobs: PrintJobView[]; storeId: string; orderId: string; allowReprint: boolean; onChanged: () => void;
}) {
    const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
    const attempt = useRef<{ key: string; reason: string } | null>(null);
    async function submit() {
        if (busy || !checked || reason.trim().length < 3) return;
        attempt.current ??= { key: crypto.randomUUID(), reason: reason.trim() };
        setBusy(true); setMessage(null);
        try {
            const result = await withReadDeadline(requestOrderReprint({ store_id: storeId, order_id: orderId, request_key: attempt.current!.key, reason: attempt.current!.reason }), 15_000);
            setMessage(result.ok ? 'Reimpressão registrada. Confira o histórico abaixo.' : result.error ?? 'Não foi possível confirmar a solicitação.');
            if (result.ok) { setOpen(false); setReason(''); setChecked(false); attempt.current = null; }
        } catch { setMessage('Resultado da solicitação não confirmado. Atualize o histórico; uma nova tentativa neste formulário mantém a mesma chave.'); }
        finally { setBusy(false); onChanged(); }
    }
    return <section className="space-y-3 text-sm">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Impressão</h3>
        {jobs.length === 0 ? <p>Sem impressão registrada. Pedidos anteriores à ativação ficam fora da fila.</p> :
            <ul className="space-y-2">{[...jobs].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(job =>
                <li key={job.id} className="rounded-xl border border-border p-3">
                    <p className="font-semibold">{job.purpose === 'initial' ? 'Via inicial' : 'Reimpressão'}: {printJobLabel(job)}</p>
                    {job.reason && <p>Motivo: {job.reason}</p>}
                    {job.requested_by && <p className="text-xs text-muted-foreground">Solicitada pelo proprietário da loja</p>}
                    <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                </li>)}</ul>}
        {message && <p role="status">{message}</p>}
        {allowReprint && !open && <Button variant="outline" size="sm" onClick={() => { setOpen(true); setMessage(null); }}>Solicitar outra via</Button>}
        {allowReprint && open && <div className="space-y-3 rounded-xl border border-border p-3">
            <label className="block">Motivo da reimpressão<textarea className="mt-1 w-full rounded border bg-background p-2" minLength={3} maxLength={240} value={reason} disabled={busy || !!attempt.current} onChange={event => setReason(event.target.value)} /></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />Conferi o papel e a fila antes de pedir outra via.</label>
            <Button size="sm" disabled={busy || !checked || reason.trim().length < 3} onClick={submit}>{busy ? 'Registrando…' : 'Registrar reimpressão'}</Button>
            <Button className="ml-2" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Fechar</Button>
        </div>}
    </section>;
}
