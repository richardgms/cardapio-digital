'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { createReconciler, withReadDeadline, type RefreshController } from '@/lib/orders-refresh';
import { isPrintAgentEndpointAllowed } from '@/lib/print-agent-config';
import { createPrintDevice, getPrintConfiguration, revokePrintDevice, setPrintEnabled } from '@/actions/admin/printing';

type Configuration = Awaited<ReturnType<typeof getPrintConfiguration>>;
export function PrintConfiguration({ moduleEnabled, activationReady }: { moduleEnabled: boolean; activationReady: boolean }) {
    const [configuration, setConfiguration] = useState<Configuration | null>(null), [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [calibrated, setCalibrated] = useState(false);
    const [name, setName] = useState(''), [queue, setQueue] = useState(''), [width, setWidth] = useState('');
    const owner = useRef<string | null>(null), refresh = useRef<RefreshController | null>(null);
    const client = useMemo(() => createClient(), []);
    useEffect(() => {
        let disposed = false;
        const reconciler = createReconciler<Configuration>({ load: getPrintConfiguration,
            result(value) { owner.current = value.store_id; setConfiguration(value); setError(null); setLoading(false); },
            error() { setError('Não foi possível atualizar a configuração.'); setLoading(false); }, busy() { } });
        refresh.current = reconciler;
        const visible = () => { if (document.visibilityState !== 'hidden') void reconciler.refresh(); };
        const interval = window.setInterval(visible, 15_000);
        window.addEventListener('online', visible); document.addEventListener('visibilitychange', visible);
        const { data: auth } = client.auth.onAuthStateChange(event => {
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
                owner.current = null; setConfiguration(null);
                queueMicrotask(() => { if (!disposed) void reconciler.refresh(); });
            }
        });
        void reconciler.refresh();
        return () => { disposed = true; owner.current = null; reconciler.dispose(); window.clearInterval(interval); window.removeEventListener('online', visible); document.removeEventListener('visibilitychange', visible); auth.subscription.unsubscribe(); };
    }, [client]);
    async function register() {
        if (!configuration || busy || !width) return;
        const store = configuration.store_id;
        const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.localhost');
        const endpoint = local ? 'http://127.0.0.1:3010/api/printing/agent' : new URL('/api/printing/agent', location.origin).href;
        if (!isPrintAgentEndpointAllowed(endpoint)) { setError('Abra o painel no domínio RMenu ou no ambiente local autorizado.'); return; }
        setBusy(true); setError(null);
        try {
            const result = await withReadDeadline(createPrintDevice({ store_id: store, name, queue_name: queue, paper_width_mm: Number(width) }), 15_000);
            if (owner.current !== store) return;
            if (!result.ok) { setError(result.error); return; }
            const bytes = JSON.stringify({ schema_version: 1, device_id: result.device_id, endpoint, queue_name: queue.trim(), paper_width_mm: Number(width), credential: result.credential }, null, 2);
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'rmenu-dispositivo.json'; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setName(''); setQueue(''); setWidth('');
        } catch { setError('Cadastro não confirmado. Confira a lista e revogue um cadastro incompleto antes de tentar novamente.'); }
        finally { setBusy(false); void refresh.current?.refresh(); }
    }
    async function mutate(action: () => Promise<{ ok: boolean; error?: string }>) {
        if (busy) return; setBusy(true); setError(null);
        try { const result = await withReadDeadline(action(), 15_000); if (!result.ok) setError(result.error ?? 'Operação não confirmada.'); }
        catch { setError('Operação não confirmada. Atualize para conferir o estado.'); }
        finally { setBusy(false); void refresh.current?.refresh(); }
    }
    return <div className="space-y-6">
        <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Impressão de pedidos</h1><Button variant="outline" onClick={() => void refresh.current?.refresh()} disabled={busy}>Atualizar</Button></div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {loading && <p>Carregando configuração…</p>}
        {!moduleEnabled && <p className="rounded-xl border p-4">Módulo em validação. Cadastro e envio ainda não liberados.</p>}
        <section className="space-y-3 rounded-xl border p-4" aria-labelledby="printing-setup-title">
            <h2 id="printing-setup-title" className="font-semibold">Conectar a impressora do restaurante</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>No computador conectado à impressora, abra o assistente RMenu para Windows 10 ou 11.</li>
                <li>Escolha a impressora no assistente, copie o nome e cadastre abaixo a mesma largura de papel.</li>
                <li>Abra a configuração baixada no assistente. Ele confere a conexão e pode iniciar com o Windows.</li>
                <li>No assistente, imprima uma única via de teste fictício e confira o papel antes de ativar pedidos novos.</li>
            </ol>
            <p className="text-sm text-muted-foreground">O instalador Windows está em validação para distribuição. Para macOS ou Linux, solicite uma instalação compatível. O cardápio e o painel continuam disponíveis pelo navegador.</p>
            <p className="text-sm text-muted-foreground">Depois de configurar, mantenha este computador ligado, com o usuário Windows conectado e a impressora pronta. Fechar o navegador não interrompe o agente.</p>
        </section>
        {configuration && <>
            <section className="space-y-3 rounded-xl border p-4">
                <p className="font-semibold">Impressão automática: {configuration.enabled ? 'Ativada' : 'Desligada'}</p>
                <p>Somente pedidos novos, completos e posteriores à ativação entram automaticamente. WhatsApp e pagamento têm estados separados.</p>
                {configuration.cutoff_at && <p className="text-sm">Ativação mais recente: {new Date(configuration.cutoff_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
                {configuration.enabled ? <Button variant="destructive" disabled={busy} onClick={() => mutate(() => setPrintEnabled({ store_id: configuration.store_id, enabled: false, calibration_confirmed: false }))}>Desativar impressão</Button> : <>
                    <label className="flex items-start gap-2"><input type="checkbox" checked={calibrated} disabled={!activationReady} onChange={event => setCalibrated(event.target.checked)} />Conferi fila, largura do rolo, layout, corte e uma única via neste computador.</label>
                    <Button disabled={busy || !moduleEnabled || !activationReady || !calibrated || !configuration.devices.some(device => !device.revoked_at)} onClick={() => mutate(() => setPrintEnabled({ store_id: configuration.store_id, enabled: true, calibration_confirmed: calibrated }))}>Ativar somente pedidos novos</Button>
                </>}
            </section>
            <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Dispositivos</h2>
                {configuration.devices.length === 0 && <p>Nenhum dispositivo cadastrado.</p>}
                {configuration.devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 rounded border p-3">
                    <div><p className="font-semibold">{device.name}</p><p className="text-sm">{device.queue_name} · {device.paper_width_mm} mm · {device.revoked_at ? 'Revogado' : 'Credencial ativa'}</p></div>
                    {!device.revoked_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => revokePrintDevice({ store_id: configuration.store_id, device_id: device.id }))}>Revogar</Button>}
                </div>)}
            </section>
            <form className="space-y-3 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); void register(); }}>
                <h2 className="font-semibold">Cadastrar computador e impressora</h2>
                <label className="block">Nome deste computador<input required maxLength={80} className="mt-1 w-full rounded border bg-background p-2" value={name} onChange={event => setName(event.target.value)} /></label>
                <label className="block">Impressora no Windows<input required maxLength={160} className="mt-1 w-full rounded border bg-background p-2" value={queue} onChange={event => setQueue(event.target.value)} /></label>
                <label className="block">Largura do rolo<select required className="ml-3 rounded border bg-background p-2" value={width} onChange={event => setWidth(event.target.value)}><option value="">Selecionar</option><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
                <p className="text-sm">O arquivo baixado contém uma credencial exclusiva. Importe somente no computador autorizado e guarde com segurança. Se perder o arquivo, revogue o dispositivo e cadastre outro.</p>
                <Button type="submit" disabled={busy || !moduleEnabled}>{busy ? 'Registrando…' : 'Cadastrar e baixar configuração'}</Button>
            </form>
        </>}
    </div>;
}
