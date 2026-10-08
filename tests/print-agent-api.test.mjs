import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import api from '../src/lib/print-agent-api.ts';
import devices from '../src/lib/print-device-service.ts';
import { createOrderDatabase, readSql } from './order-database-fixture.mjs';

let db, storeA, storeB, payload, call, deviceId;
const credential='a1'.repeat(32);
const sqlRpc=async(name,parameters)=>{
    try {return {data:(await db.query(`select public.${name}(${Object.keys(parameters).map((key,i)=>key+'=> $'+(i+1)).join(',')}) as result`,Object.values(parameters))).rows[0].result,error:null};}
    catch(error){return {data:null,error:{code:error.code}};}
};
const request=(body,headers={},url='https://rmenu.com.br/api/printing/agent')=>new Request(url,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+credential,'x-rmenu-device':deviceId,...headers},body:JSON.stringify(body)});
const handle=(req,overrides={})=>api.handlePrintAgentRequest(req,{enabled:true,rpc:sqlRpc,allow:()=>true,...overrides});
const op=async(body)=>{const response=await handle(request(body));return {status:response.status,body:await response.json()};};
before(async()=>{
    ({db,storeA,storeB,call,payload}=await createOrderDatabase()); await db.exec(readSql('../database/migrations/2026100802_persistent_print_queue.sql'));
    deviceId=(await sqlRpc('rmenu_print_register_device',{p_store:storeA,p_actor:storeA,p_name:'Fictício',p_queue:'Fila fictícia',p_width:80,p_hash:api.hashPrintCredential(credential)})).data;
});
after(()=>db.close());
test('módulo desligado não toca banco; transporte e headers inválidos não autenticam',async()=>{
    let calls=0; const noRpc=async()=>{calls++;throw new Error('unexpected');};
    assert.equal((await handle(request({operation:'health'}),{enabled:false,rpc:noRpc})).status,503);
    assert.equal((await handle(request({operation:'health'},{origin:'https://evil.invalid'}),{rpc:noRpc})).status,403);
    assert.equal((await handle(request({operation:'health'}, {},'http://evil.invalid/api/printing/agent'),{rpc:noRpc})).status,403);
    assert.equal((await handle(request({operation:'health'},{authorization:'Bearer invalid'}),{rpc:noRpc})).status,401);
    assert.equal((await handle(request({operation:'health'},{'x-rmenu-device':'invalid'}),{rpc:noRpc})).status,401);
    assert.equal((await handle(request({operation:'health'},{},'https://rmenu.com.br/api/printing/agent?token=bad'),{rpc:noRpc})).status,403);
    assert.equal(calls,0);
});
test('operações fixas, payload pequeno, sem store/ator/hash/rpc fornecidos pelo agente',async()=>{
    for(const body of [{operation:'delete'},{operation:'health',store_id:storeB},{operation:'health',rpc:'register_device'},{operation:'finish',job_id:randomUUID(),lease_token:randomUUID(),outcome:'printed'}]){
        assert.equal((await handle(request(body))).status,400);
    }
    assert.equal((await handle(request({operation:'health',extra:'x'.repeat(4096)}))).status,400);
    assert.equal((await handle(request({operation:'health'},{'content-type':'text/plain'}))).status,400);
});
test('health confirma credencial por SQL real sem expor hash/token e mantém cache desabilitado',async()=>{
    const response=await handle(request({operation:'health'})); assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store, private');
    assert.deepEqual(await response.json(),{authenticated:true,protocol_version:1,lease_seconds:60});
    assert.equal((await handle(request({operation:'health'},{authorization:'Bearer '+'b'.repeat(64)}))).status,401);
    assert.deepEqual((await op({operation:'claim'})).body,{job:null});
});
test('SQL + API: claim gera recibo da versão selada, lease único, dispatch e ACK idempotente',async()=>{
    await sqlRpc('rmenu_print_set_enabled',{p_store:storeA,p_actor:storeA,p_enabled:true});
    const result=await call(payload({notes:'Não usar texto do catálogo atual'}));
    const {status,body}=await op({operation:'claim'}); assert.equal(status,200);
    assert.equal(body.job.order_id,result.order_id); assert.equal(body.device.copies,1);
    assert.equal(body.job.receipt_sha256,api.hashPrintCredential(body.job.lines.join('\n')+'\n'));
    assert.ok(body.job.lines.some(line=>line.includes('Pão de açafrão')));
    assert.equal('document' in body.job,false); assert.equal(JSON.stringify(body).includes(credential),false);
    const operation={job_id:body.job.id,lease_token:body.job.lease_token};
    assert.equal((await op({...operation,operation:'renew'})).body.accepted,true);
    assert.equal((await op({...operation,operation:'dispatch'})).body.accepted,true);
    assert.equal((await op({...operation,operation:'dispatch'})).body.accepted,false);
    assert.equal((await op({...operation,operation:'finish',outcome:'spooler_submitted'})).body.accepted,true);
    assert.equal((await op({...operation,operation:'finish',outcome:'spooler_submitted'})).body.accepted,true);
    const inspected=(await op({operation:'inspect',job_id:body.job.id})).body.job;
    assert.equal(inspected.state,'spooler_submitted'); assert.equal('lease_token' in inspected,false);
});
test('retorno inválido não envia recibo parcial e não vaza SQL/exceção/credencial',async()=>{
    const errorRpc=async()=>({data:null,error:{code:'XX001',message:credential}});
    const response=await handle(request({operation:'health'}),{rpc:errorRpc});
    assert.equal(response.status,503); assert.equal((await response.text()).includes(credential),false);
    const fixture=JSON.parse(fs.readFileSync(new URL('../printing/fixtures/receipt-test-v1.json',import.meta.url),'utf8'));
    const lease={job:{id:randomUUID(),order_id:randomUUID(),purpose:'initial',lease_token:randomUUID(),lease_expires_at:new Date(Date.now()+60000).toISOString(),document:fixture},device:{id:deviceId,queue_name:'Fila',paper_width_mm:80,copies:1}};
    let failed=0;
    const mock=async(name,args)=>{if(name.endsWith('finish')){assert.equal(args.p_outcome,'failed');failed++;return {data:true,error:null};}return {data:lease,error:null};};
    assert.equal((await handle(request({operation:'claim'}),{rpc:mock})).status,422); assert.equal(failed,1);
});
test('corpo sem EOF expira sem executar SQL',async()=>{
    let calls=0;
    const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"operation":"health"}'));}});
    const req=new Request('https://rmenu.com.br/api/printing/agent',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+credential,'x-rmenu-device':deviceId},body:stream,duplex:'half'});
    assert.equal((await handle(req,{rpc:async()=>{calls++;return {data:null,error:null};}})).status,400);
    assert.equal(calls,0);
});
test('reimpressão leva indicação no recibo e revogação interrompe operações do PC',async()=>{
    const order=await call();
    const initial=(await op({operation:'claim'})).body.job;
    await op({operation:'dispatch',job_id:initial.id,lease_token:initial.lease_token});
    await op({operation:'finish',job_id:initial.id,lease_token:initial.lease_token,outcome:'spooler_submitted'});
    await sqlRpc('rmenu_print_request_reprint',{p_store:storeA,p_actor:storeA,p_order:order.order_id,p_key:randomUUID(),p_reason:'Conferência fictícia'});
    const reprint=(await op({operation:'claim'})).body.job;
    assert.equal(reprint.purpose,'reprint'); assert.ok(reprint.lines[0].includes('REIMPRESSÃO'));
    await sqlRpc('rmenu_print_revoke_device',{p_store:storeA,p_actor:storeA,p_device:deviceId});
    assert.equal((await op({operation:'health'})).status,401);
    assert.equal((await op({operation:'dispatch',job_id:reprint.id,lease_token:reprint.lease_token})).status,401);
});
test('cadastro valida sessão/loja e configura 58 mm com segredo aleatório entregue uma vez',async()=>{
    const input={store_id:storeA,name:'Outra fila',queue_name:'Térmica fictícia',paper_width_mm:58};
    assert.equal((await devices.registerPrintDevice(input,{enabled:true,getOwnerId:async()=>storeB,rpc:sqlRpc})).ok,false);
    assert.equal((await devices.registerPrintDevice({...input,paper_width_mm:79},{enabled:true,getOwnerId:async()=>storeA,rpc:sqlRpc})).ok,false);
    const created=await devices.registerPrintDevice(input,{enabled:true,getOwnerId:async()=>storeA,rpc:sqlRpc});
    assert.equal(created.ok,true); assert.match(created.credential,/^[0-9a-f]{64}$/);
    const saved=(await db.query('select credential_hash,paper_width_mm from public.print_devices where id=$1',[created.device_id])).rows[0];
    assert.equal(saved.credential_hash,api.hashPrintCredential(created.credential)); assert.notEqual(saved.credential_hash,created.credential); assert.equal(saved.paper_width_mm,58);
});
test('endpoint de instalação não aceita terceiros, userinfo, tokens na URL ou HTTP remoto',()=>{
    assert.equal(devices.isPrintAgentEndpointAllowed('https://rmenu.com.br/api/printing/agent'),true);
    assert.equal(devices.isPrintAgentEndpointAllowed('http://teste1.localhost:3010/api/printing/agent'),true);
    for(const url of ['https://rmenu.com.br.evil.invalid/api/printing/agent','https://rmenu.com.br@evil.invalid/api/printing/agent','http://rmenu.com.br/api/printing/agent','https://rmenu.com.br/api/printing/agent?token=secret']) assert.equal(devices.isPrintAgentEndpointAllowed(url),false);
});
test('limite tem tamanho máximo, expira por minuto e não impede cliente existente pela saturação',()=>{
    let now=0; const allow=api.createPrintRequestLimiter(()=>now,2);
    for(let i=0;i<90;i++) assert.equal(allow('a'),true); assert.equal(allow('a'),false);
    assert.equal(allow('b'),true); assert.equal(allow('c'),false); assert.equal(allow('b'),true);
    now=60000; assert.equal(allow('c'),true);
});
