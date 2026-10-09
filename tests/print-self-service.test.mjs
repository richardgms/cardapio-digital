import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import api from '../src/lib/print-agent-api.ts';
import readiness from '../src/lib/print-self-service.ts';
import {createOrderDatabase,readSql} from './order-database-fixture.mjs';

let db,storeA,storeB,deviceA,deviceB,call;
const credential='ce'.repeat(32);
const hash=api.hashPrintCredential(credential);
const rpc=async(name,args)=>{
 try{return {data:(await db.query(`select public.${name}(${Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')}) as result`,Object.values(args))).rows[0].result,error:null};}
 catch(error){return {data:null,error:{code:error.code}};}
};
const invoke=async(device,body,overrides={})=>{
 const request=new Request('https://rmenu.com.br/api/printing/agent',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+credential,'x-rmenu-device':device},body:JSON.stringify(body)});
 const response=await api.handlePrintAgentRequest(request,{enabled:true,selfServiceEnabled:true,rpc,allow:()=>true,...overrides});
 return {status:response.status,body:await response.json()};
};
async function register(store,width=80){return (await rpc('rmenu_print_register_device',{p_store:store,p_actor:store,p_name:'Computador fictício',p_queue:'Fila fictícia',p_width:width,p_hash:api.hashPrintCredential(randomUUID()+randomUUID())})).data;}
const auth=device=>({p_device:device,p_hash:hash});
before(async()=>{
 ({db,storeA,storeB,call}=await createOrderDatabase());
 await db.exec(readSql('../database/migrations/2026100802_persistent_print_queue.sql'));
 deviceA=(await rpc('rmenu_print_register_device',{p_store:storeA,p_actor:storeA,p_name:'A',p_queue:'Fila fictícia',p_width:80,p_hash:hash})).data;
 await db.exec("set rmenu.public_read_contract_ready='published-consumers-2026100804'");
 await db.exec(readSql('../database/migrations/2026100804_private_store_configuration.sql'));
 await db.exec(readSql('../database/migrations/2026100805_print_self_service.sql'));
 await db.exec("set rmenu.public_read_contract_ready='published-consumers-2026100804'");
 await db.exec(readSql('../database/migrations/2026100804_private_store_configuration.sql'));
 await db.exec(readSql('../database/migrations/2026100805_print_self_service.sql'));
 deviceB=await register(storeB,58);
});
after(()=>db.close());

test('migração aditiva é reaplicável e não ativa nem muda cortes',async()=>{
 const row=(await db.query('select enabled,cutoff_at,activation_mode from print_settings where store_id=$1',[storeA])).rows[0];
 assert.deepEqual(row,{enabled:false,cutoff_at:null,activation_mode:'managed'});
 const verified=(await db.query(readSql('../database/verify-print-self-service-readonly.sql'))).rows[0].print_self_service_verification;
 assert.equal(verified.all_passed,true,JSON.stringify(verified));
 await db.exec('revoke update on public.print_device_checks from service_role');
 const incomplete=(await db.query(readSql('../database/verify-print-self-service-readonly.sql'))).rows[0].print_self_service_verification;
 assert.equal(incomplete.all_passed,false);assert.equal(incomplete.checks.private_table_and_rls,false);
 await db.exec('grant update on public.print_device_checks to service_role');
 assert.equal((await db.query('select count(*)::int as count from print_jobs')).rows[0].count,0);
});
test('visitante e dono não leem provas nem executam RPCs privadas',async()=>{
 for(const role of ['anon','authenticated']){
  const privileges=(await db.query("select has_table_privilege($1,'public.print_device_checks','SELECT') as readable,has_function_privilege($1,'public.rmenu_print_self_service_enable(uuid,uuid)','EXECUTE') as executable",[role])).rows[0];
  assert.deepEqual(privileges,{readable:false,executable:false});
 }
});
test('checkbox ou dispositivo cadastrado sozinho não liberam ativação',async()=>{
 const result=await rpc('rmenu_print_self_service_enable',{p_store:storeA,p_actor:storeA});
 assert.equal(result.error.code,'22023');
 assert.equal((await db.query('select enabled from print_settings where store_id=$1',[storeA])).rows[0].enabled,false);
});
test('calibração indisponível não toca banco; health antigo continua compatível',async()=>{
 let calls=0;
 const blocked=await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:80},{selfServiceEnabled:false,rpc:async()=>{calls++;throw new Error('unexpected');}});
 assert.equal(blocked.status,503);assert.equal(calls,0);
 const health=await invoke(deviceA,{operation:'health'});
 assert.equal(health.body.authenticated,true);assert.equal(health.body.self_service_calibration,true);
});
let started;
test('servidor deriva loja/perfil da credencial e rejeita perfil ou loja forjados',async()=>{
 assert.equal((await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Outra fila',paper_width_mm:80})).status,409);
 assert.equal((await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:58})).status,409);
 assert.equal((await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:80,store_id:storeB})).status,400);
 started=await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:80});
 assert.equal(started.status,200);assert.equal(started.body.test.state,'requested');
 assert.ok(started.body.lines.every(line=>line.length<=42));
 assert.ok(!JSON.stringify(started.body).includes(hash));
});
test('confirmação antecipada, teste de outro dispositivo e mudança de pedido não passam',async()=>{
 const test=started.body.test.test_id;
 assert.equal((await invoke(deviceA,{operation:'calibration_confirm',test_id:test})).body.accepted,false);
 assert.equal((await rpc('rmenu_print_calibration_dispatch',{p_device:deviceB,p_hash:(await db.query('select credential_hash from print_devices where id=$1',[deviceB])).rows[0].credential_hash,p_test:test})).data,false);
 assert.equal((await rpc('rmenu_print_self_service_enable',{p_store:storeB,p_actor:storeA})).error.code,'42501');
 assert.equal((await invoke(deviceA,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:80})).status,409);
});
test('dispatch é único; término e confirmação são idempotentes sem gerar jobs',async()=>{
 const test=started.body.test.test_id;
 assert.equal((await invoke(deviceA,{operation:'calibration_dispatch',test_id:test})).body.accepted,true);
 assert.equal((await invoke(deviceA,{operation:'calibration_dispatch',test_id:test})).body.accepted,false);
 for(let i=0;i<2;i++)assert.equal((await invoke(deviceA,{operation:'calibration_finish',test_id:test,outcome:'spooler_submitted'})).body.accepted,true);
 for(let i=0;i<2;i++)assert.equal((await invoke(deviceA,{operation:'calibration_confirm',test_id:test})).body.accepted,true);
 assert.equal((await db.query('select count(*)::int as count from print_jobs')).rows[0].count,0);
});
test('ativação exige conexão recente e repetição não move o corte',async()=>{
 const status=await rpc('rmenu_print_self_service_status',{p_store:storeA,p_actor:storeA});
 assert.equal(readiness.parsePrintSelfServiceCheck(status.data).ready,true);
 await db.query("update print_device_checks set last_seen_at=clock_timestamp()-interval '10 minutes' where device_id=$1",[deviceA]);
 assert.equal((await rpc('rmenu_print_self_service_enable',{p_store:storeA,p_actor:storeA})).error.code,'22023');
 await invoke(deviceA,{operation:'health'});
 const first=await rpc('rmenu_print_self_service_enable',{p_store:storeA,p_actor:storeA});
 assert.equal(first.data.enabled,true);
 const second=await rpc('rmenu_print_self_service_enable',{p_store:storeA,p_actor:storeA});
 assert.equal(first.data.cutoff_at,second.data.cutoff_at);
 assert.equal((await db.query('select activation_mode from print_settings where store_id=$1',[storeA])).rows[0].activation_mode,'self_service');
 await db.exec("set rmenu.public_read_contract_ready='published-consumers-2026100804'");
 await db.exec(readSql('../database/migrations/2026100804_private_store_configuration.sql'));
 await db.exec(readSql('../database/migrations/2026100805_print_self_service.sql'));
 const preserved=(await db.query('select enabled,cutoff_at,activation_mode from print_settings where store_id=$1',[storeA])).rows[0];
 assert.equal(preserved.enabled,true);assert.equal(new Date(preserved.cutoff_at).toISOString(),new Date(first.data.cutoff_at).toISOString());
 assert.equal((await rpc('rmenu_print_self_service_status',{p_store:storeA,p_actor:storeA})).data.ready,true);
});
test('segundo computador sem teste não reserva; perfil alterado entre reserva e envio bloqueia dispatch',async()=>{
 const second=await register(storeA,58);
 const secondHash=(await db.query('select credential_hash from print_devices where id=$1',[second])).rows[0].credential_hash;
 const order=await call();
 assert.equal((await rpc('rmenu_print_claim',{p_device:second,p_hash:secondHash})).data.job,null);
 const lease=(await rpc('rmenu_print_claim',auth(deviceA))).data;
 assert.equal(lease.job.order_id,order.order_id);
 await db.query("update print_device_checks set queue_name='Outra fila' where device_id=$1",[deviceA]);
 assert.equal((await rpc('rmenu_print_begin_dispatch',{...auth(deviceA),p_job:lease.job.id,p_lease:lease.job.lease_token})).data,false);
 await db.query("update print_device_checks set queue_name='Fila fictícia' where device_id=$1",[deviceA]);
 assert.equal((await rpc('rmenu_print_begin_dispatch',{...auth(deviceA),p_job:lease.job.id,p_lease:lease.job.lease_token})).data,true);
});

test('58 mm usa linhas compatíveis; teste expirado não autoriza envio ou confirmação',async()=>{
 const hashB=(await db.query('select credential_hash from print_devices where id=$1',[deviceB])).rows[0].credential_hash;
 const response=await invoke(deviceB,{operation:'calibration_start',request_id:randomUUID(),queue_name:'Fila fictícia',paper_width_mm:58},{rpc:async(name,args)=>rpc(name,{...args,p_hash:hashB})});
 assert.equal(response.status,200);assert.ok(response.body.lines.every(line=>line.length<=32));
 await db.query("update print_device_checks set expires_at=clock_timestamp()-interval '1 second' where device_id=$1",[deviceB]);
 const args={p_device:deviceB,p_hash:hashB,p_test:response.body.test.test_id};
 assert.equal((await rpc('rmenu_print_calibration_dispatch',args)).data,false);
 await db.query("update print_device_checks set state='spooler_submitted' where device_id=$1",[deviceB]);
 assert.equal((await rpc('rmenu_print_calibration_confirm',args)).data,false);
});

test('loja no modo anterior continua imprimindo sem nova calibração e pode desligar',async()=>{
 await rpc('rmenu_print_set_enabled',{p_store:storeA,p_actor:storeA,p_enabled:false});
 await db.query("update print_settings set activation_mode='managed' where store_id=$1",[storeA]);
 await db.query("update print_device_checks set queue_name='Outra fila' where device_id=$1",[deviceA]);
 await rpc('rmenu_print_set_enabled',{p_store:storeA,p_actor:storeA,p_enabled:true});
 const order=await call();
 assert.equal((await rpc('rmenu_print_claim',auth(deviceA))).data.job.order_id,order.order_id);
 assert.equal((await rpc('rmenu_print_set_enabled',{p_store:storeA,p_actor:storeA,p_enabled:false})).data.enabled,false);
 await db.query("update print_device_checks set queue_name='Fila fictícia' where device_id=$1",[deviceA]);
});

test('perfil divergente e revogação invalidam prontidão, sem expor provas de outra loja',async()=>{
 await db.query("update print_device_checks set queue_name='Outra fila' where device_id=$1",[deviceA]);
 assert.equal((await rpc('rmenu_print_self_service_status',{p_store:storeA,p_actor:storeA})).data.ready,false);
 await db.query("update print_device_checks set queue_name='Fila fictícia' where device_id=$1",[deviceA]);
 await rpc('rmenu_print_revoke_device',{p_store:storeA,p_actor:storeA,p_device:deviceA});
 assert.equal((await invoke(deviceA,{operation:'health'})).status,401);
 assert.equal((await rpc('rmenu_print_self_service_status',{p_store:storeA,p_actor:storeA})).data.ready,false);
 assert.ok((await rpc('rmenu_print_self_service_status',{p_store:storeB,p_actor:storeB})).data.devices.every(device=>device.id!==deviceA));
});
test('resumo permissivo ou malformado não libera painel',()=>{
 assert.equal(readiness.parsePrintSelfServiceCheck({ready:true,devices:[]}).ready,false);
 assert.equal(readiness.parsePrintSelfServiceCheck({ready:true,devices:[{id:deviceB,calibrated:true,connected:true,private:'secret'}]}).ready,false);
});
