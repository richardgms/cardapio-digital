import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {Readable} from 'node:stream';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import api from '../src/lib/print-agent-api.ts';
import {createOrderDatabase,readSql} from './order-database-fixture.mjs';
import {startNativePostgres,assertBlockedBy} from './native-postgres-fixture.mjs';

const execute=promisify(execFile);
let cluster,server;
try{
 cluster=await startNativePostgres();
 const fixture=await createOrderDatabase(cluster.db);
 await cluster.db.exec(readSql('../database/migrations/2026100802_persistent_print_queue.sql'));
 await cluster.db.exec("set rmenu.public_read_contract_ready='published-consumers-2026100804'");
 await cluster.db.exec(readSql('../database/migrations/2026100804_private_store_configuration.sql'));
 await cluster.db.exec(readSql('../database/migrations/2026100805_print_self_service.sql'));
 assert.equal((await cluster.db.query(readSql('../database/verify-print-self-service-readonly.sql'))).rows[0].print_self_service_verification.all_passed,true);
 const call=async(client,name,args)=>(await client.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
 const connection=await cluster.connect('service_role');
 const rpc=async(name,args)=>{
  assert.match(name,/^rmenu_print_[a-z_]+$/);
  try{return {data:(await connection.query(`select public.${name}(${Object.keys(args).map((key,i)=>key+'=>$'+(i+1)).join(',')}) as result`,Object.values(args))).rows[0].result,error:null};}
  catch(error){console.error('Fixture RPC:',name,error.code,error.message);return {data:null,error:{code:error.code}};}
 };
 server=http.createServer(async(incoming,outgoing)=>{
  try{
   const request=new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`,{method:incoming.method,headers:incoming.headers,body:Readable.toWeb(incoming),duplex:'half'});
   const response=await api.handlePrintAgentRequest(request,{enabled:true,selfServiceEnabled:true,rpc,allow:()=>true});
   outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch{outgoing.writeHead(500);outgoing.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const devices=[];
 for(const [store,width] of [[fixture.storeA,80],[fixture.storeB,58]]){
  const credential=randomBytes(32).toString('hex'),hash=api.hashPrintCredential(credential);
  const device=await call(cluster.admin,'rmenu_print_register_device',[store,store,'PC fictício','Fila fictícia com acento',width,hash]);
  devices.push({device,hash,store});
  const fixturePath=path.join(cluster.runDir,device+'.json'),reportPath=path.join(cluster.runDir,device+'-report.json');
  fs.writeFileSync(fixturePath,JSON.stringify({isolated_fixture:true,device_id:device,credential,queue_name:'Fila fictícia com acento',paper_width_mm:width,endpoint:`http://127.0.0.1:${server.address().port}/api/printing/agent`}),{flag:'wx'});
  await execute('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('printing/windows/Test-SelfServiceIntegrated.ps1'),'-FixturePath',fixturePath,'-ReportPath',reportPath],{windowsHide:true,timeout:30000,maxBuffer:8192});
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  assert.equal(report.first,'spooler_submitted');assert.equal(report.second,'already_requested');assert.equal(report.state,'paper_confirmed');assert.equal(report.sends,1);assert.ok(report.max_line_width<=(width===80?42:32));assert.equal(report.physical_send,false);
  assert.equal((await call(cluster.admin,'rmenu_print_self_service_status',[store,store])).ready,true);
 }
 const a=await cluster.connect('service_role'),b=await cluster.connect('service_role');
 async function overlap(first,second){
  let pending;
  await a.query('begin');
  try{
   const initial=await first(a);
   pending=second(b).then(value=>({value}),error=>({error}));
   await assertBlockedBy(cluster.admin,b,a);
   await a.query('commit');
   return [initial,await pending];
  }finally{await a.query('rollback');if(pending)await pending;}
 }
 const enabled=await overlap(client=>call(client,'rmenu_print_self_service_enable',[fixture.storeA,fixture.storeA]),client=>call(client,'rmenu_print_self_service_enable',[fixture.storeA,fixture.storeA]));
 assert.equal(enabled[1].error,undefined);assert.equal(enabled[0].cutoff_at,enabled[1].value.cutoff_at);
 const order=await fixture.call();
 const lease=await call(a,'rmenu_print_claim',[devices[0].device,devices[0].hash]);assert.equal(lease.job.order_id,order.order_id);
 assert.equal(await call(a,'rmenu_print_begin_dispatch',[devices[0].device,devices[0].hash,lease.job.id,lease.job.lease_token]),true);
 await call(a,'rmenu_print_finish',[devices[0].device,devices[0].hash,lease.job.id,lease.job.lease_token,'spooler_submitted']);
 const revoked=await overlap(client=>call(client,'rmenu_print_revoke_device',[fixture.storeB,fixture.storeB,devices[1].device]),client=>call(client,'rmenu_print_self_service_enable',[fixture.storeB,fixture.storeB]));
 assert.equal(revoked[1].error?.code,'22023');
 const hash=randomBytes(32).toString('hex');
 const third=await call(cluster.admin,'rmenu_print_register_device',[fixture.storeA,fixture.storeA,'Segundo PC fictício','Fila fictícia',80,hash]);
 assert.equal((await call(a,'rmenu_print_claim',[third,hash])).job,null);
 const challenge=await call(a,'rmenu_print_calibration_start',[third,hash,randomUUID(),'Fila fictícia',80]);
 const dispatch=await overlap(client=>call(client,'rmenu_print_calibration_dispatch',[third,hash,challenge.test_id]),client=>call(client,'rmenu_print_calibration_dispatch',[third,hash,challenge.test_id]));
 assert.equal(dispatch[0],true);assert.equal(dispatch[1].value,false);
 fs.writeFileSync(path.join(cluster.runDir,'self-service-verification.json'),JSON.stringify({all_passed:true,native_http:true,postgres_locks_observed:true,paper_widths:[80,58],physical_send:false,production_access:false,repeated_activation_preserved_cutoff:true,revocation_blocked_activation:true,dispatch_once:true,verified_at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 console.log('PASS: HTTP real + agente Windows + PostgreSQL nativo; 80/58 mm, revogação e concorrência. Sem papel. Evidência: '+cluster.runDir);
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(cluster)await cluster.stop();
}
