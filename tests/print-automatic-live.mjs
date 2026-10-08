import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import checkout from '../src/lib/order-checkout-service.ts';

// Ensaio explícito no Supabase real: padrão somente leitura; --send envia UMA via.
// Escopo fixo teste1/Epson80/local3010. Não publica, abre WhatsApp ou muda .env.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--send'));
const send = args.includes('--send');
const execute = promisify(execFile);
const root = path.resolve('printing/.local');
const markerPath = path.join(root, 'automatic-live-80mm.json');
const reportPath = path.join(root, send ? 'automatic-live-verification.json' : 'automatic-live-preflight.json');
if (send && fs.existsSync(markerPath)) {
  console.error('Ensaio já iniciado. Preserve marcador, relatório e journal; não repetir envio.');
  process.exit(1);
}
config({ path: '.env.local', quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }) },
});
const read = async query => { const result = await query; assert.equal(result.error, null, 'Consulta do ensaio indisponível.'); return result.data; };
const windows = async (script, parameters = []) => execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...parameters], {
  timeout: 90_000, windowsHide: true, maxBuffer: 32_768,
});
const report = { at: new Date().toISOString(), store: 'teste1', live_supabase: true, physical_paper_confirmed: false, checks: {} };
let storeId, activationAttempted = false, marker;
const persist = () => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (marker) { fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2)); }
};
try {
  if (send) assert.ok(!fs.existsSync(markerPath), 'Ensaio já iniciado. Preserve o marcador e confira os registros; não repetir envio.');
  const store = await read(db.from('store_config').select('id,is_open,accept_pix').eq('subdomain', 'teste1').single());
  storeId = store.id;
  assert.ok(store.is_open && store.accept_pix, 'A loja de teste deve estar aberta e aceitar PIX.');
  const [settings, devices, jobs, orders] = await Promise.all([
    read(db.from('print_settings').select('enabled,cutoff_at').eq('store_id', storeId).single()),
    read(db.from('print_devices').select('id,queue_name,paper_width_mm').eq('store_id', storeId).is('revoked_at', null)),
    read(db.from('print_jobs').select('id,state,order_id').eq('store_id', storeId)),
    read(db.from('orders').select('id').eq('store_id', storeId)),
  ]);
  assert.equal(settings.enabled, false, 'A loja deve começar com impressão desligada.');
  assert.equal(jobs.length, 0, 'Este primeiro ensaio exige fila remota vazia, sem histórico enfileirado.');
  assert.equal(devices.length, 1, 'Este ensaio exige somente o dispositivo de teste.');
  const installed = JSON.parse((await windows('printing/windows/Get-AutomaticTestPreflight.ps1')).stdout.trim());
  assert.equal(devices[0].id, installed.device_id);
  assert.equal(devices[0].queue_name, installed.queue_name);
  assert.equal(devices[0].paper_width_mm, 80);
  const item = { client_item_id: randomUUID(), product_id: '649caaec-7d7f-48f4-96a6-ddc76aab53c1', quantity: 1, selected_options: [], half_product_ids: null, observations: 'TESTE FICTICIO - SEM PEDIDO REAL' };
  const quote = await checkout.priceIntentItems(db, storeId, [item]);
  assert.equal(quote.items[0].item_total, 14, 'Preço da fixture mudou; conferir antes de imprimir.');
  report.checks = { installed_agent_authenticated: true, printer_ready_and_empty: true, one_matching_device_80mm: true, installation_disabled: true, no_existing_jobs: true, fixture_price_14: true };
  if (send) {
    const key = randomUUID();
    const candidate = { state: 'started', at: new Date().toISOString(), idempotency_key: key, store: 'teste1' };
    fs.mkdirSync(root, { recursive: true });
    const descriptor = fs.openSync(markerPath, 'wx');
    // Só o processo que criou o arquivo pode atualizar seu próprio marcador.
    marker = candidate;
    try { fs.writeSync(descriptor, JSON.stringify(marker)); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    // Marcar antes da chamada cobre resposta perdida durante ativação.
    activationAttempted = true;
    const enabled = await read(db.rpc('rmenu_print_set_enabled', { p_store: storeId, p_actor: storeId, p_enabled: true }));
    assert.equal(enabled.enabled, true);
    const initialJobs = await read(db.from('print_jobs').select('id').eq('store_id', storeId));
    assert.equal(initialJobs.length, 0, 'Ativação não pode enfileirar histórico.');
    report.checks.activation_excluded_history = true;
    const result = await checkout.submitCheckout(db, { store_id: storeId, idempotency_key: key, customer_name: 'TESTE FICTICIO - IMPRESSAO AUTOMATICA', customer_phone: '11999999999', delivery_type: 'pickup', payment_method: 'pix', total: 14, notes: 'TESTE FICTICIO - SEM PEDIDO REAL. Conferir uma via e corte.', items: [item] });
    assert.ok(result.success, result.error ?? 'Checkout do ensaio falhou.');
    marker.order_id = result.order_id;
    report.order_id = result.order_id;
    report.order_number = result.order_number;
    const queued = await read(db.from('print_jobs').select('id,state,order_id,purpose').eq('store_id', storeId));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].order_id, result.order_id);
    assert.equal(queued[0].purpose, 'initial');
    assert.equal(queued[0].state, 'pending');
    report.job_id = queued[0].id;
    report.checks.checkout_created_one_initial_job = true;
    marker.state = 'consumer_starting'; persist();
    await windows('printing/windows/Run-Agent.ps1', ['-Send', '-Once', '-ExpectedOrderId', result.order_id]);
    const finished = await read(db.from('print_jobs').select('id,state,attempts,device_id').eq('id', report.job_id).eq('store_id', storeId).single());
    report.job = finished;
    assert.equal(finished.state, 'spooler_submitted', 'Submissão não confirmada; conferir journal e papel sem reenviar.');
    assert.equal(finished.attempts, 1);
    assert.equal(finished.device_id, installed.device_id);
    marker.state = 'spooler_submitted'; persist();
    // Reinício do mesmo agente: apenas reconcilia journals e não encontra outro job.
    await windows('printing/windows/Run-Agent.ps1', ['-Send', '-Once', '-ExpectedOrderId', result.order_id]);
    const finalJobs = await read(db.from('print_jobs').select('id,state,attempts').eq('store_id', storeId));
    assert.equal(finalJobs.length, 1);
    assert.equal(finalJobs[0].state, 'spooler_submitted');
    assert.equal(finalJobs[0].attempts, 1);
    const oldJobs = await read(db.from('print_jobs').select('order_id').eq('store_id', storeId));
    assert.ok(oldJobs.every(job => !orders.some(order => order.id === job.order_id)));
    report.checks = { ...report.checks, installed_agent_submitted_one_attempt: true, agent_restart_did_not_repeat: true, historical_orders_not_queued: true };
    report.software_passed = true;
  } else { report.preflight_passed = true; }
} catch {
  report.failed = true;
  console.error('Ensaio interrompido. Confira o relatório e o journal; não repetir envio físico.');
  process.exitCode = 1;
} finally {
  if (activationAttempted) {
    let disabled = false;
    for (let attempt = 0; attempt < 3 && !disabled; attempt++) {
      try { const result = await read(db.rpc('rmenu_print_set_enabled', { p_store: storeId, p_actor: storeId, p_enabled: false })); disabled = result.enabled === false; } catch { /* limite de três tentativas, sem novo envio */ }
    }
    report.checks.printing_disabled_after_test = disabled;
    if (!disabled) { console.error('Desligamento não confirmado: desative a impressão de teste1 no painel.'); process.exitCode = 1; }
    if (marker) marker.printing_disabled = disabled;
  }
  // Um segundo processo que perdeu CreateNew não sobrescreve a evidência do primeiro.
  if (!send || marker || !fs.existsSync(markerPath)) persist();
  console.log(JSON.stringify(report, null, 2));
}
