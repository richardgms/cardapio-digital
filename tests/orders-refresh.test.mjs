import assert from 'node:assert/strict';
import { test } from 'node:test';
import refresh from '../src/lib/orders-refresh.ts';
import periods from '../src/lib/orders-period.ts';

function deferred() { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; }

test('leitura sem resposta expira e o resultado tardio não substitui a próxima leitura',async()=>{
    const stalled=deferred();
    await assert.rejects(refresh.withReadDeadline(stalled.promise,5),/Tempo/);
    const current=await refresh.withReadDeadline(Promise.resolve('atual'),100);
    stalled.resolve('antigo');await Promise.resolve();assert.equal(current,'atual');
});
test('eventos repetidos coalescem; resposta ultrapassada não substitui lista reconciliada',async()=>{
    const first=deferred(),second=deferred(),values=[],busy=[];let loads=0;
    const controller=refresh.createReconciler({load:()=>(++loads===1?first:second).promise,result:value=>values.push(value),error:error=>{throw error;},busy:value=>busy.push(value)});
    const work=controller.refresh();controller.refresh();controller.refresh();
    first.resolve('antigo');await new Promise(resolve=>setImmediate(resolve));assert.equal(loads,2);assert.deepEqual(values,[]);
    second.resolve('atual');await work;assert.deepEqual(values,['atual']);assert.deepEqual(busy,[true,false]);
});
test('erro de reconciliação conserva último sucesso e recuperação continua possível',async()=>{
    const values=[],errors=[];let fail=false;
    const controller=refresh.createReconciler({load:async()=>{if(fail)throw new Error('offline');return 1;},result:value=>values.push(value),error:error=>errors.push(error.message),busy:()=>{}});
    await controller.refresh();fail=true;await controller.refresh();fail=false;await controller.refresh();
    assert.deepEqual(values,[1,1]);assert.deepEqual(errors,['offline']);
});
test('troca de loja/desmontagem impede aplicação, erro e finish da requisição anterior',async()=>{
    const pending=deferred(),events=[];
    const controller=refresh.createReconciler({load:()=>pending.promise,result:()=>events.push('result'),error:()=>events.push('error'),busy:value=>events.push(value)});
    const work=controller.refresh();controller.dispose();pending.reject(new Error('atrasado'));await work;await controller.refresh();
    assert.deepEqual(events,[true]);
});
test('detalhe B permanece aberto quando resposta de A chega depois',async()=>{
    const a=deferred(),b=deferred(),values=[],finished=[];
    const controller=refresh.createLatestLoader({load:id=>(id==='A'?a:b).promise,start:()=>{},result:(value,id)=>values.push([id,value]),error:error=>{throw error;},finish:id=>finished.push(id)});
    const first=controller.load('A'),second=controller.load('B');b.resolve('itens B');await second;a.resolve('itens A');await first;
    assert.deepEqual(values,[['B','itens B']]);assert.deepEqual(finished,['B']);
});
test('fechar detalhe invalida sucesso e erro tardios; erro antigo não apaga detalhe novo',async()=>{
    const a=deferred(),events=[];
    const controller=refresh.createLatestLoader({load:()=>a.promise,start:()=>{},result:()=>events.push('result'),error:()=>events.push('error'),finish:()=>events.push('finish')});
    const work=controller.load('A');controller.invalidate();a.reject(new Error('atrasado'));await work;
    assert.deepEqual(events,[]);
});
test('Hoje usa São Paulo na virada UTC; intervalos e páginas são explícitos',()=>{
    assert.equal(periods.ordersPeriodStart('today',new Date('2026-10-08T01:00:00Z')),'2026-10-07T03:00:00.000Z');
    assert.equal(periods.ordersPeriodStart('today',new Date('2026-10-08T03:00:00Z')),'2026-10-08T03:00:00.000Z');
    assert.equal(periods.ordersPeriodStart('7days',new Date('2026-10-08T01:00:00Z')),'2026-10-01T01:00:00.000Z');
    assert.equal(periods.ordersPeriodStart('all'),null);
    assert.deepEqual(periods.ordersPageRange(0),[0,49]);assert.deepEqual(periods.ordersPageRange(2),[100,149]);
    for(const page of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>periods.ordersPageRange(page));
});
