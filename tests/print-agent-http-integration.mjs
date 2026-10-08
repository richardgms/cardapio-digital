import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import api from '../src/lib/print-agent-api.ts';
import { createOrderDatabase, readSql } from './order-database-fixture.mjs';
import { startNativePostgres } from './native-postgres-fixture.mjs';

// Integração isolada: PostgreSQL -> API real por HTTP -> AgentCore -> GDI.
// Padrão apenas preview: callback de spooler simulado, sem envio físico.
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--send'));
const physical = args.includes('--send');
const execute = promisify(execFile);
let cluster, server, marker;
try {
    cluster = await startNativePostgres();
    const fixture = await createOrderDatabase(cluster.db);
    await cluster.db.exec(readSql('../database/migrations/2026100802_persistent_print_queue.sql'));
    await cluster.admin.query("update store_config set name='TESTE FICTICIO - SEM PEDIDO REAL' where id=$1", [fixture.storeA]);
    const credential = randomBytes(32).toString('hex');
    const queue = 'EPSON TM-T20X Receipt';
    const rpcAdmin = async (name, values) => (await cluster.admin.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`, values)).rows[0].result;
    const deviceId = await rpcAdmin('rmenu_print_register_device', [fixture.storeA, fixture.storeA, 'Ensaio isolado', queue, 80, api.hashPrintCredential(credential)]);
    await rpcAdmin('rmenu_print_set_enabled', [fixture.storeA, fixture.storeA, true]);
    const order = await fixture.call(fixture.payload({customer_name:'CLIENTE FICTICIO - ENSAIO INTEGRADO',notes:'TESTE LOCAL ISOLADO. SEM PEDIDO REAL. Conferir uma via e corte.'}));
    const job = (await cluster.admin.query('select id from print_jobs where order_id=$1', [order.order_id])).rows[0];
    const connection = await cluster.connect('service_role');
    const rpc = async (name, parameters) => {
        assert.match(name, /^rmenu_print_(inspect|claim|renew|begin_dispatch|finish)$/);
        const keys = Object.keys(parameters);
        keys.forEach(key => assert.match(key, /^p_[a-z_]+$/));
        try { return {data:(await connection.query(`select public.${name}(${keys.map((key,i)=>key+'=>$'+(i+1)).join(',')}) as result`,Object.values(parameters))).rows[0].result,error:null}; }
        catch(error){return {data:null,error:{code:error.code}};}
    };
    server = http.createServer(async (incoming, outgoing) => {
        try {
            const url = `http://127.0.0.1:${server.address().port}${incoming.url}`;
            const request = new Request(url, {method:incoming.method, headers:incoming.headers,
                ...(incoming.method === 'POST' ? {body:Readable.toWeb(incoming),duplex:'half'} : {})});
            const response = await api.handlePrintAgentRequest(request, {enabled:true,rpc,allow:()=>true});
            outgoing.writeHead(response.status,Object.fromEntries(response.headers));
            outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch { outgoing.writeHead(500); outgoing.end(); }
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const fixturePath = path.join(cluster.runDir, 'agent-fixture.json');
    fs.writeFileSync(fixturePath,JSON.stringify({isolated_fixture:true,device_id:deviceId,credential,
        endpoint:`http://127.0.0.1:${server.address().port}/api/printing/agent`,queue_name:queue,order_id:order.order_id,job_id:job.id}),{flag:'wx'});
    if (physical) {
        // Conservador: uma intenção global por ensaio, inclusive após falhas.
        // Nunca apagar para repetir. Outra via exige decisão humana e ensaio próprio.
        marker = path.resolve('printing/.local/integrated-physical-80mm.json');
        const fd = fs.openSync(marker,'wx');
        try {fs.writeFileSync(fd,JSON.stringify({state:'intent',job_id:job.id,at:new Date().toISOString()})+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    }
    const runWindows = async (reportPath, send = false) => {
        const parameters = ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('printing/windows/Test-IntegratedReceipt.ps1'),'-FixturePath',fixturePath,'-ReportPath',reportPath];
        if (send) parameters.push('-PhysicalSend');
        await execute('powershell.exe',parameters,{windowsHide:true,timeout:45000,maxBuffer:16384});
        return JSON.parse(fs.readFileSync(reportPath,'utf8').replace(/^\uFEFF/,''));
    };
    const first = await runWindows(path.join(cluster.runDir,'agent-first.json'),physical);
    assert.equal(first.health_confirmed,true);
    assert.equal(first.job_received,true);
    assert.equal(first.preview_generated,true);
    assert.equal(first.outcome,'acknowledged');
    assert.equal(first.journal_acknowledged,true);
    // Reiniciar o consumidor não pode receber novamente o job já finalizado.
    const second = await runWindows(path.join(cluster.runDir,'agent-second.json'));
    assert.equal(second.health_confirmed,true);
    assert.equal(second.job_received,false);
    const databaseState = (await cluster.admin.query('select state,attempts from print_jobs where id=$1',[job.id])).rows[0];
    assert.equal(databaseState.state,'spooler_submitted');
    assert.equal(databaseState.attempts,1);
    const count = (await cluster.admin.query('select count(*)::int as n from print_jobs where order_id=$1',[order.order_id])).rows[0].n;
    assert.equal(count,1);
    const report = {all_passed:true,mode:physical?'physical':'preview_with_simulated_spooler',
        real_http_api:true,real_native_postgres:true,windows_agent_core:true,gdi_preview:true,
        journal_and_ack:true,restart_did_not_claim_again:true,physical_dispatch_requested:physical,
        physical_paper_confirmed:false,production_database_accessed:false,installed_agent_configuration_changed:false,
        server_version:cluster.version,first,second,databaseState,verified_at:new Date().toISOString()};
    fs.writeFileSync(path.join(cluster.runDir,'integration-verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    if(marker)fs.writeFileSync(marker,JSON.stringify({state:'spooler_submitted',job_id:job.id,at:new Date().toISOString(),paper_confirmed:false})+'\n');
    console.log((physical ? 'Envio fictício submetido; confirmação do papel pendente.' : 'Ensaio integrado sem papel aprovado.')+' Evidência: '+cluster.runDir);
} finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(cluster)await cluster.stop();
}
