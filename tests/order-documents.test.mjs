import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createOrderDatabase } from './order-database-fixture.mjs';
import { before, after, test } from 'node:test';
import receipt from '../src/lib/order-receipt.ts';

// SQL real, papéis/RLS reais, dados fictícios; sem .env/rede/impressora.
// PGlite não comprova concorrência entre duas conexões PostgreSQL.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^\uFEFF/, '');
const migration = read('../database/migrations/2026100801_order_documents_and_numbers.sql');
let db, storeA, storeB, productA, zoneA, legacy, existing;

function payload(overrides = {}) {
    return { store_id: storeA, idempotency_key: randomUUID(), customer_name: 'Cliente fictício', customer_phone: '11999999999',
        delivery_type: 'pickup', payment_method: 'pix', total: 14,
        items: [{ product_id: productA, product_name: 'Pão de açafrão', quantity: 1, unit_price: 14, item_total: 14,
            selected_options: [{ group: 'Molho', option: 'Limão', price: 0 }], observations: 'Sem cebola', is_half_half: false }], ...overrides };
}
async function call(value = payload()) {
    const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return (await db.query('select public.rmenu_create_order_atomic($1::jsonb,$2) as result', [JSON.stringify(value), hash])).rows[0].result;
}
async function row(sql, params = []) { return (await db.query(sql, params)).rows[0]; }
async function document(id) { return row('select * from public.order_documents where order_id=$1', [id]); }

test('contrato de recibo consome documento produzido pelo SQL real', async () => {
    // O envelope JSON espelha PostgREST; o driver SQL local retorna Date no registro cru.
    const {saved}=await row('select to_jsonb(d) as saved from public.order_documents d where order_id=$1',[existing.order_id]);
    const text=receipt.renderOrderReceipt(saved);
    assert.ok(text.includes('Pão de açafrão'));
    assert.ok(text.includes('R$ 14,00'));
    assert.ok(text.includes('Forma informada: PIX'));
});
async function asRole(role, uid, callback) {
    await db.exec('begin');
    try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
        return await callback();
    } finally { await db.exec('rollback'); }
}
async function reject(sql, params = [], pattern = /imutável|selado|excluído|retroceder|permission denied|row-level security|foreign key|incompleto/) {
    await assert.rejects(db.query(sql, params), pattern);
}

test('commit como service_role sela documento com os grants mínimos', async () => {
    await db.exec('begin; set local role service_role');
    let result;
    try {
        result=await call();
        assert.equal(await document(result.order_id),undefined);
        await db.exec('commit');
    } catch(error) { await db.exec('rollback'); throw error; }
    assert.ok(await document(result.order_id));
});

test('privilégio herdado aborta postflight e desfaz DDL/políticas/dados da reaplicação', async () => {
    const before=(await db.query('select * from public.order_documents order by order_id')).rows;
    await db.exec('create role fixture_writer; grant update(customer_name) on public.orders to fixture_writer; grant fixture_writer to authenticated;');
    await assert.rejects(db.exec(migration),/herdado/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from public.order_documents order by order_id')).rows,before);
    await db.exec('revoke fixture_writer from authenticated; revoke update(customer_name) on public.orders from fixture_writer; drop role fixture_writer;');
    const verification=(await row(read('../database/verify-order-documents-readonly.sql'))).document_verification;
    assert.equal(verification.all_passed,true);
});

test('preflight e verificação somente de leitura retornam instalação válida sem dados de clientes', async () => {
    const preflight=(await row(read('../database/preflight-order-documents-readonly.sql'))).document_preflight;
    assert.equal(preflight.atomic_incomplete_or_divergent,0);
    assert.equal(preflight.invalid_numbers,0);
    const result=(await row(read('../database/verify-order-documents-readonly.sql'))).document_verification;
    assert.equal(result.all_passed,true,JSON.stringify(result));
    assert.deepEqual(result.unexpected_client_writes,[]);
    assert.equal(result.automatic_printing_activated,false);
});

before(async () => {
    ({db, storeA, storeB, productA, zoneA, legacy, existing} = await createOrderDatabase());
});
after(async () => { await db.close(); });

test('seed preserva números, sela novo fluxo e mantém legado sem documento', async () => {
    assert.equal((await row('select order_number from public.orders where id=$1',[legacy.id])).order_number,legacy.order_number);
    assert.equal(await document(legacy.id),undefined);
    const saved=await document(existing.order_id);
    assert.equal(saved.document_version,1); assert.equal(saved.schema_version,1);
    assert.equal(saved.snapshot.items.length,1); assert.equal(saved.snapshot.store_name,'Loja fictícia A');
    assert.equal(saved.snapshot.items[0].observations,'Sem cebola');
    for (const field of ['status','handoff_status','request_hash','idempotency_key','updated_at']) assert.equal(field in saved.snapshot.order,false);
});

test('documento nasce no commit do RPC, inclui endereço, opções, frete, desconto e pagamento', async () => {
    const result=await call(payload({delivery_type:'delivery',delivery_zone_id:zoneA,delivery_address:'Rua São José, 10',address_complement:'Fundos — portão azul',payment_method:'cash',change_for:50,notes:'Tocar campainha',total:19}));
    const {snapshot}=await document(result.order_id);
    assert.equal(snapshot.order.address_complement,'Fundos — portão azul'); assert.equal(snapshot.order.delivery_zone_name,'São João');
    assert.equal(snapshot.order.payment_method,'cash'); assert.equal(snapshot.order.change_for,50);
    assert.equal(snapshot.order.delivery_fee,5); assert.equal(snapshot.order.discount_value,0); assert.equal(snapshot.order.total,19);
    assert.equal(snapshot.items[0].selected_options[0].option,'Limão');
});

test('replay não duplica nem altera documento, itens ou numeração', async () => {
    const value=payload(); const first=await call(value); const before=await document(first.order_id);
    const counter=await row('select last_number from public.order_number_counters where store_id=$1',[storeA]);
    const second=await call(value);
    assert.equal(second.order_id,first.order_id); assert.equal(second.replayed,true);
    assert.deepEqual(await document(first.order_id),before);
    assert.deepEqual(await row('select last_number from public.order_number_counters where store_id=$1',[storeA]),counter);
});

test('exclusão de legado e reaplicação não reutilizam o último número', async () => {
    const last=await row("insert into public.orders(store_id,customer_name,customer_phone,delivery_type,payment_method,subtotal,total) values($1,'Legado removível','11999999999','pickup','pix',0,0) returning *",[storeB]);
    await db.query('delete from public.orders where id=$1',[last.id]);
    await db.exec(migration);
    const next=await row("insert into public.orders(store_id,customer_name,customer_phone,delivery_type,payment_method,subtotal,total,order_number) values($1,'Legado','11999999999','pickup','pix',0,0,999) returning *",[storeB]);
    assert.equal(next.order_number,last.order_number+1);
});

test('contador não pode retroceder, mudar de loja ou ser excluído', async () => {
    await reject('update public.order_number_counters set last_number=0 where store_id=$1',[storeA]);
    await reject('delete from public.order_number_counters where store_id=$1',[storeA]);
    await reject('update public.order_number_counters set store_id=$1 where store_id=$2',[randomUUID(),storeA]);
});

test('edições de cabeçalho e itens são bloqueadas mesmo com service_role', async () => {
    for (const assignment of ["customer_name='Adulterado'","total=0","request_hash=null","document_version=2","store_id=null","notes='Alterado'","address_complement='Alterado'"]) {
        await asRole('service_role',storeA,async()=>reject(`update public.orders set ${assignment} where id=$1`,[existing.order_id]));
    }
    for (const assignment of ["quantity=2","product_name='Alterado'","observations='Alterado'","selected_options='[]'::jsonb","order_id=gen_random_uuid()","item_total=0"]) {
        await asRole('service_role',storeA,async()=>reject(`update public.order_items set ${assignment} where order_id=$1`,[existing.order_id]));
    }
    await reject('delete from public.order_items where order_id=$1',[existing.order_id]);
    await reject('delete from public.orders where id=$1',[existing.order_id]);
    await reject("insert into public.order_items(order_id,product_name,quantity,unit_price,item_total) values($1,'Extra',1,1,1)",[existing.order_id]);
});

test('status e WhatsApp mudam sem mudar versão ou conteúdo; cancelamento não destrói documento', async () => {
    const before=await document(existing.order_id);
    await asRole('service_role',storeA,async()=> {
        await db.query("update public.orders set status='cancelled',handoff_status='whatsapp_opened' where id=$1",[existing.order_id]);
        assert.deepEqual(await document(existing.order_id),before);
    });
    await db.query("update public.orders set status='cancelled' where id=$1",[existing.order_id]);
    await reject("update public.orders set status='pending' where id=$1",[existing.order_id],/terminal/);
    const active=await call();
    await asRole('authenticated',storeA,async()=> {
        const updated=await db.query("update public.orders set status='preparing' where id=$1 returning id",[active.order_id]);
        assert.equal(updated.rows.length,1);
    });
});

test('dono lê documento próprio; outra loja e visitante não leem; clientes não criam nem adulteram', async () => {
    await asRole('authenticated',storeA,async()=>assert.ok(await document(existing.order_id)));
    await asRole('authenticated',storeB,async()=>assert.equal(await document(existing.order_id),undefined));
    await asRole('anon',storeA,async()=>reject('select * from public.order_documents'));
    for (const role of ['anon','authenticated']) {
        for (const sql of ['update public.orders set customer_name=customer_name','update public.orders set handoff_status=handoff_status',
            'delete from public.orders','update public.order_items set product_name=product_name','delete from public.order_items',
            'select * from public.order_number_counters',"select public.rmenu_capture_order_document('00000000-0000-0000-0000-000000000000')"]) {
            await asRole(role,storeA,async()=>reject(sql));
        }
    }
});

test('barreiras RLS resistem a novos grants e políticas amplas; outra loja não altera status', async () => {
    await db.exec('begin');
    try {
        await db.exec(`grant all on public.orders,public.order_items to anon,authenticated;
            create policy future_open_orders on public.orders for all to anon,authenticated using(true) with check(true);
            create policy future_open_items on public.order_items for all to anon,authenticated using(true) with check(true);`);
        await db.exec('set local role authenticated');
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[storeB]);
        assert.equal((await db.query("update public.orders set status='pending' where id=$1 returning id",[existing.order_id])).rows.length,0);
        assert.equal(await document(existing.order_id),undefined);
        await db.query("select set_config('request.jwt.claim.sub',$1,true)",[storeA]);
        assert.equal((await db.query('delete from public.orders')).rows.length,0);
        assert.equal((await db.query('delete from public.order_items')).rows.length,0);
        assert.equal((await db.query("update public.order_items set product_name='Adulterado' returning id")).rows.length,0);
        await assert.rejects(db.query("insert into public.order_items(order_id,product_name,quantity,unit_price,item_total) values($1,'Extra',1,1,1)",[existing.order_id]));
    } finally { await db.exec('rollback'); }
    await asRole('authenticated',storeB,async()=>assert.equal((await db.query("update public.orders set status='cancelled' where id=$1 returning id",[existing.order_id])).rows.length,0));
});

test('documento privado não pode ser alterado ou removido nem pelo administrador comum', async () => {
    await reject("update public.order_documents set snapshot='{}'::jsonb where order_id=$1",[existing.order_id]);
    await reject('delete from public.order_documents where order_id=$1',[existing.order_id]);
});

test('falha no fechamento da transação desfaz pedido, itens, documento e contador', async () => {
    const counters=(await db.query('select * from public.order_number_counters order by store_id')).rows;
    const counts=await row('select (select count(*) from public.orders) as orders,(select count(*) from public.order_documents) as docs');
    await db.exec('begin');
    const created=await call();
    assert.equal(await document(created.order_id),undefined);
    // Simula integração privilegiada que deixa uma linha a mais no mesmo commit.
    await db.query("insert into public.order_items(order_id,product_name,quantity,unit_price,item_total) values($1,'Extra',1,1,1)",[created.order_id]);
    await assert.rejects(db.exec('commit'),/incompleto|divergente/);
    await db.exec('rollback');
    assert.deepEqual(await row('select (select count(*) from public.orders) as orders,(select count(*) from public.order_documents) as docs'),counts);
    assert.deepEqual((await db.query('select * from public.order_number_counters order by store_id')).rows,counters);
});

test('exclusão de produto e zona preserva documento completo e campos históricos', async () => {
    await db.exec('begin');
    try {
        const result=await call(payload({delivery_type:'delivery',delivery_zone_id:zoneA,delivery_address:'Rua Teste',total:19}));
        await db.exec('set constraints all immediate');
        const before=await document(result.order_id);
        await db.query('delete from public.products where id=$1',[productA]);
        await db.query('delete from public.delivery_zones where id=$1',[zoneA]);
        assert.equal((await row('select product_id from public.order_items where order_id=$1',[result.order_id])).product_id,null);
        assert.equal((await row('select delivery_zone_id from public.orders where id=$1',[result.order_id])).delivery_zone_id,null);
        assert.deepEqual(await document(result.order_id),before);
        assert.equal(before.snapshot.items[0].product_id,productA);
        assert.equal(before.snapshot.order.delivery_zone_id,zoneA);
    } finally { await db.exec('rollback'); }
});

test('reaplicação preserva documentos, grants restritos e trigger adiado', async () => {
    const docs=(await db.query('select * from public.order_documents order by order_id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from public.order_documents order by order_id')).rows,docs);
    const trigger=await row("select tgdeferrable,tginitdeferred,tgenabled from pg_trigger where tgname='rmenu_order_seal_at_commit'");
    assert.deepEqual(trigger,{tgdeferrable:true,tginitdeferred:true,tgenabled:'O'});
    for (const name of ['rmenu_capture_order_document(uuid)','rmenu_seal_order_at_commit()','set_order_number()']) {
        const fn=await row('select prosecdef,proconfig,has_function_privilege(\'anon\',oid,\'EXECUTE\') as anon,has_function_privilege(\'authenticated\',oid,\'EXECUTE\') as client from pg_proc where oid=to_regprocedure($1)',['public.'+name]);
        assert.equal(fn.prosecdef,false); assert.ok(fn.proconfig.includes('search_path=""')); assert.equal(fn.anon,false); assert.equal(fn.client,false);
    }
});

test('preflight aborta diante de numeração divergente sem modificar schema/histórico', async () => {
    await db.exec('begin; alter table public.orders drop constraint orders_store_id_order_number_key; commit;');
    await assert.rejects(db.exec(migration),/Unicidade/);
    await db.exec('rollback');
    assert.ok(await document(existing.order_id));
    await db.exec('alter table public.orders add constraint orders_store_id_order_number_key unique(store_id,order_number)');
});
