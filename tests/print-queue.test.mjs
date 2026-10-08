import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, beforeEach, test } from 'node:test';
import { createOrderDatabase, readSql } from './order-database-fixture.mjs';

// SQL real, RLS/papéis reais, sem rede, credenciais reais ou impressora.
// PGlite serializa: exclusividade entre conexões remotas continua a validar.
const migration=readSql('../database/migrations/2026100802_persistent_print_queue.sql');
let db, storeA, storeB, call, payload, existing, deviceA, deviceB, otherDevice;
let hashA='a'.repeat(64), hashB='b'.repeat(64), hashOther='c'.repeat(64);
const row=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
const rpc=async(name,args=[]) => (await row(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).result;
const enable=async(enabled=true) => rpc('rmenu_print_set_enabled',[storeA,storeA,enabled]);
const claim=(device=deviceA,hash=hashA) => rpc('rmenu_print_claim',[device,hash]);
const job=async(orderId) => row("select * from public.print_jobs where order_id=$1 and purpose='initial'",[orderId]);
const prepare=async() => { await enable(); const order=await call(); const lease=await claim(); assert.equal(lease.job.order_id,order.order_id); return {order,lease}; };
const dispatch=lease=>rpc('rmenu_print_begin_dispatch',[deviceA,hashA,lease.job.id,lease.job.lease_token]);
async function asRole(role,uid,fn){
    await db.exec('begin');
    try {await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);return await fn();}
    finally {await db.exec('rollback');}
}
async function deny(fn){
    await db.exec('savepoint fixture_denied');
    try { await assert.rejects(fn,/permission denied/); }
    finally {await db.exec('rollback to savepoint fixture_denied; release savepoint fixture_denied');}
}
before(async()=>{
    ({db,storeA,storeB,call,payload,existing}=await createOrderDatabase());
    await db.exec(migration);
    deviceA=await rpc('rmenu_print_register_device',[storeA,storeA,'Epson fictícia','Fila fictícia 80',80,hashA]);
    deviceB=await rpc('rmenu_print_register_device',[storeA,storeA,'Outra Epson','Fila fictícia 58',58,hashB]);
    otherDevice=await rpc('rmenu_print_register_device',[storeB,storeB,'Outra loja','Fila outra loja',80,hashOther]);
});
beforeEach(async()=>{await enable(false);});
after(async()=>{await db.close();});

test('instala desligada, sem histórico; preflight e verificação não retornam PII',async()=>{
    assert.equal((await row('select count(*)::int as n from public.print_jobs')).n,0);
    assert.equal((await row('select count(*)::int as n from public.print_settings where enabled')).n,0);
    const pre=(await row(readSql('../database/preflight-print-queue-readonly.sql'))).print_queue_preflight;
    assert.equal(pre.atomic_documents_missing_or_divergent,0);
    assert.equal(pre.document_trigger_installed,true);
    const verify=(await row(readSql('../database/verify-print-queue-readonly.sql'))).print_queue_verification;
    assert.equal(verify.all_passed,true,JSON.stringify(verify));
    assert.equal(JSON.stringify(verify).includes('Cliente fictício'),false);
});
test('ativação, segundo PC e reaplicação não enfileiram histórico nem duplicam inicial',async()=>{
    await enable(); assert.equal(await job(existing.order_id),undefined);
    const value=payload(),order=await call(value); assert.ok(await job(order.order_id));
    await call(value); await db.exec(migration);
    assert.equal((await row('select count(*)::int as n from public.print_jobs where order_id=$1',[order.order_id])).n,1);
    assert.equal(await job(existing.order_id),undefined);
});
test('documento e job só aparecem no commit; falha da fila reverte pedido, itens e contador',async()=>{
    await enable(); await db.exec('begin');
    // Simula falha transacional de INSERT na fila.
    await db.exec("create function public.fixture_fail_print() returns trigger language plpgsql as $$begin raise exception 'fixture queue failure'; end$$; create trigger fixture_fail before insert on public.print_jobs for each row execute function public.fixture_fail_print(); commit;");
    const number=await row('select last_number from public.order_number_counters where store_id=$1',[storeA]);
    const count=await row('select count(*)::int as n from public.orders');
    await assert.rejects(call(),/fixture queue failure/);
    assert.deepEqual(await row('select last_number from public.order_number_counters where store_id=$1',[storeA]),number);
    assert.deepEqual(await row('select count(*)::int as n from public.orders'),count);
    await db.exec('drop trigger fixture_fail on public.print_jobs; drop function public.fixture_fail_print();');
    await db.exec('begin'); const result=await call(); assert.equal(await job(result.order_id),undefined);
    await db.exec('commit'); assert.ok(await job(result.order_id));
});
test('reserva exclusiva entre dois dispositivos; largura é por PC e credencial não vaza',async()=>{
    const {lease}=await prepare();
    assert.equal(lease.device.paper_width_mm,80); assert.equal(lease.device.copies,1);
    assert.equal(lease.job.document.snapshot.items.length,1);
    assert.equal(JSON.stringify(lease).includes(hashA),false);
    assert.equal((await claim(deviceB,hashB)).job,null);
    assert.equal(await rpc('rmenu_print_renew',[deviceB,hashB,lease.job.id,lease.job.lease_token]),false);
    assert.equal(await rpc('rmenu_print_inspect',[otherDevice,hashOther,lease.job.id]),null);
    await assert.rejects(claim(deviceA,hashOther),/Credencial inválida/);
});
test('lease vencido antes do envio é recuperado com novo token; token antigo perde autoridade',async()=>{
    const {order,lease}=await prepare();
    await db.query("update public.print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[lease.job.id]);
    assert.equal(await rpc('rmenu_print_renew',[deviceA,hashA,lease.job.id,lease.job.lease_token]),false);
    assert.equal(await dispatch(lease),false);
    const second=await claim(deviceB,hashB);
    assert.equal(second.job.id,lease.job.id); assert.notEqual(second.job.lease_token,lease.job.lease_token);
    assert.equal(second.device.paper_width_mm,58); assert.equal((await job(order.order_id)).attempts,2);
    assert.equal(await dispatch(lease),false);
});
test('renew válido, dispatch único e ACK idempotente não significam confirmação do papel',async()=>{
    const {order,lease}=await prepare();
    assert.equal(await rpc('rmenu_print_renew',[deviceA,hashA,lease.job.id,lease.job.lease_token]),true);
    assert.equal(await dispatch(lease),true); assert.equal(await dispatch(lease),false);
    assert.equal(await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'failed']),false);
    assert.equal(await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'spooler_submitted']),true);
    assert.equal(await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'spooler_submitted']),true);
    assert.equal((await job(order.order_id)).state,'spooler_submitted');
    assert.equal((await claim(deviceB,hashB)).job,null);
});
test('queda após dispatch vira incerto, não volta à fila; confirmação tardia pode registrar spooler',async()=>{
    const {order,lease}=await prepare(); assert.equal(await dispatch(lease),true);
    await db.query("update public.print_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[lease.job.id]);
    assert.equal((await claim(deviceB,hashB)).job,null);
    assert.equal((await job(order.order_id)).state,'uncertain');
    assert.equal(await dispatch(lease),false);
    assert.equal(await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'spooler_submitted']),true);
});
test('cancelamento pelo dono invalida reserva; trigger limitado mantém RLS e cupom/documento',async()=>{
    const {order,lease}=await prepare();
    await db.exec('begin; set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[storeA]);
    await db.query("update public.orders set status='cancelled' where id=$1",[order.order_id]); await db.exec('commit');
    assert.equal((await job(order.order_id)).state,'cancelled'); assert.equal(await dispatch(lease),false);
    assert.ok(await row('select order_id from public.order_documents where order_id=$1',[order.order_id]));
    assert.equal((await row("select count(*)::int as n from public.print_events where job_id=$1 and event='order_cancelled'",[lease.job.id])).n,1);
});
test('cancelamento após dispatch é incerto e nunca tenta retirar papel já enviado',async()=>{
    const {order,lease}=await prepare(); await dispatch(lease);
    await db.query("update public.orders set status='cancelled' where id=$1",[order.order_id]);
    assert.equal((await job(order.order_id)).state,'uncertain'); assert.equal((await claim(deviceB,hashB)).job,null);
});
test('desativação cancela reservas, deixa envios incertos e reativação corta pedidos do intervalo',async()=>{
    const {order,lease}=await prepare(); await dispatch(lease); await enable(false);
    assert.equal((await job(order.order_id)).state,'uncertain');
    const gap=await call(); assert.equal(await job(gap.order_id),undefined);
    const first=(await row('select cutoff_at from public.print_settings where store_id=$1',[storeA])).cutoff_at;
    await enable(); const last=(await row('select cutoff_at from public.print_settings where store_id=$1',[storeA])).cutoff_at;
    assert.ok(last>=first); assert.equal(await job(gap.order_id),undefined);
    assert.equal((await claim(deviceB,hashB)).job,null);
    await assert.rejects(db.query("update public.print_settings set cutoff_at='2000-01-01' where store_id=$1",[storeA]),/retroceder/);
});
test('reimpressão exige dono, motivo e chave; replay auditado não cria duas vias',async()=>{
    await enable(); const key=randomUUID();
    await assert.rejects(rpc('rmenu_print_request_reprint',[storeA,storeB,existing.order_id,key,'Não saiu']),/Acesso negado/);
    await assert.rejects(rpc('rmenu_print_request_reprint',[storeA,storeA,existing.order_id,key,'']),/motivo/);
    const first=await rpc('rmenu_print_request_reprint',[storeA,storeA,existing.order_id,key,'Conferido pelo operador']);
    assert.equal(await rpc('rmenu_print_request_reprint',[storeA,storeA,existing.order_id,key,'Conferido pelo operador']),first);
    await assert.rejects(rpc('rmenu_print_request_reprint',[storeA,storeA,existing.order_id,key,'Motivo diferente']),/divergente/);
    const record=await row('select * from public.print_jobs where id=$1',[first]);
    assert.equal(record.purpose,'reprint'); assert.equal(record.requested_by,storeA);
    assert.equal((await row("select count(*)::int as n from public.print_events where job_id=$1 and reason='Conferido pelo operador'",[first])).n,1);
});
test('anon e outra loja não acessam dados; dono não lê token/hash nem escreve fila/histórico',async()=>{
    const {lease}=await prepare();
    await asRole('anon',storeA,async()=>{
        await deny(()=>db.query('select * from public.print_jobs'));
        await deny(()=>claim());
    });
    await asRole('authenticated',storeB,async()=>{
        assert.equal((await db.query('select id,state from public.print_jobs where id=$1',[lease.job.id])).rows.length,0);
    });
    await asRole('authenticated',storeA,async()=>{
        assert.equal((await row('select id,state from public.print_jobs where id=$1',[lease.job.id])).state,'leased');
        await deny(()=>db.query('select credential_hash from public.print_devices'));
        await deny(()=>db.query('select lease_token from public.print_jobs'));
        await deny(()=>db.query("update public.print_jobs set state='pending' where id=$1",[lease.job.id]));
    });
    await assert.rejects(db.query('delete from public.print_events'),/imutável/);
    await assert.rejects(db.query("update public.print_events set event='fake'"),/imutável/);
});
test('grants/políticas amplas posteriores não permitem escrita ou leitura entre lojas',async()=>{
    const {lease}=await prepare();
    await db.exec('begin');
    try {
        await db.exec('grant update,insert,delete on public.print_jobs to authenticated; create policy fixture_broad on public.print_jobs for all to authenticated using(true) with check(true);');
        await db.exec('set local role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[storeA]);
        await assert.rejects(db.query("update public.print_jobs set state='pending' where id=$1",[lease.job.id]),/row-level security/);
    } finally {await db.exec('rollback');}
});
test('privilégio herdado aborta instalação e preserva fila/eventos na reaplicação',async()=>{
    await db.exec('create role fixture_print_writer; grant update on public.print_jobs to fixture_print_writer; grant fixture_print_writer to authenticated;');
    const before=(await db.query('select id,state from public.print_jobs order by id')).rows;
    await assert.rejects(db.exec(migration),/herdado/); await db.exec('rollback');
    assert.deepEqual((await db.query('select id,state from public.print_jobs order by id')).rows,before);
    await db.exec('revoke fixture_print_writer from authenticated; revoke update on public.print_jobs from fixture_print_writer; drop role fixture_print_writer;');
    await db.exec(migration);
    assert.equal((await row(readSql('../database/verify-print-queue-readonly.sql'))).print_queue_verification.all_passed,true);
});
test('service_role consegue finalizar checkout e reservar sem privilégios do administrador',async()=>{
    await enable();
    await db.exec('begin; set local role service_role');
    let order;
    try {order=await call(); await db.exec('commit');} catch(error){await db.exec('rollback');throw error;}
    assert.ok(await job(order.order_id));
    await asRole('service_role',storeA,async()=>{assert.equal((await claim()).job.order_id,order.order_id);});
});
test('credencial não autoriza gerenciamento; cliente não invoca trigger definer diretamente',async()=>{
    await asRole('authenticated',storeA,async()=>{
        await deny(()=>rpc('rmenu_print_register_device',[storeA,storeA,'Fraude','Fila',80,'f'.repeat(64)]));
        await deny(()=>rpc('rmenu_print_cancel_order'));
    });
    await assert.rejects(rpc('rmenu_print_register_device',[storeA,storeB,'Fraude','Fila',80,'f'.repeat(64)]),/Acesso negado/);
    await assert.rejects(rpc('rmenu_print_revoke_device',[storeA,storeB,deviceA]),/Acesso negado/);
});
test('envio incerto e submissão não podem retornar a pending nem pelo serviço',async()=>{
    const {order,lease}=await prepare(); await dispatch(lease);
    await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'uncertain']);
    await assert.rejects(db.query("update public.print_jobs set state='pending' where id=$1",[lease.job.id]),/Transição/);
    await assert.rejects(db.query('update public.print_jobs set lease_token=gen_random_uuid() where id=$1',[lease.job.id]),/Reserva/);
    await rpc('rmenu_print_finish',[deviceA,hashA,lease.job.id,lease.job.lease_token,'spooler_submitted']);
    await assert.rejects(db.query("update public.print_jobs set state='pending' where id=$1",[lease.job.id]),/Transição/);
    assert.equal((await job(order.order_id)).state,'spooler_submitted');
});
test('job não aceita documento de outra loja e versão/configuração ficam fixas',async()=>{
    await assert.rejects(db.query("insert into public.print_jobs(store_id,order_id,document_version,purpose,request_key) values($1,$2,1,'initial',$3)",[storeB,existing.order_id,randomUUID()]),/outra loja/);
    await assert.rejects(db.query('update public.print_devices set paper_width_mm=58 where id=$1',[deviceA]),/imutável/);
    const {lease}=await prepare();
    await assert.rejects(db.query("update public.print_jobs set purpose='reprint' where id=$1",[lease.job.id]),/Identidade/);
});
test('revogação libera só lease pré-envio; invalida token e torna dispatch incerto',async()=>{
    const {order}=await prepare();
    await rpc('rmenu_print_revoke_device',[storeA,storeA,deviceA]);
    assert.equal((await job(order.order_id)).state,'pending'); await assert.rejects(claim(),/Credencial inválida/);
    const second=await claim(deviceB,hashB);
    assert.equal(await rpc('rmenu_print_begin_dispatch',[deviceB,hashB,second.job.id,second.job.lease_token]),true);
    await rpc('rmenu_print_revoke_device',[storeA,storeA,deviceB]);
    assert.equal((await job(order.order_id)).state,'uncertain');
    // Restabelecer apenas novas credenciais; dispositivo revogado não é reativado.
    hashA='d'.repeat(64); hashB='e'.repeat(64);
    deviceA=await rpc('rmenu_print_register_device',[storeA,storeA,'Epson nova','Fila fictícia 80',80,hashA]);
    deviceB=await rpc('rmenu_print_register_device',[storeA,storeA,'Outra Epson nova','Fila fictícia 58',58,hashB]);
});
