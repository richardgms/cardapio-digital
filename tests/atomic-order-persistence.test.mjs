import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { before, after, test } from 'node:test';
import checkoutService from '../src/lib/order-checkout-service.ts';

// PostgreSQL local, schema reduzido compatível com o inventário e triggers reais.
// Não usa .env, banco remoto, WhatsApp ou impressora. Não simula duas conexões.
const runtimeRequire = createRequire(new URL('../docs/sql-test-runtime/package.json', import.meta.url));
const { PGlite } = await import(pathToFileURL(runtimeRequire.resolve('@electric-sql/pglite')).href);
const migration = fs.readFileSync(new URL('../database/migrations/2026100703_atomic_order_persistence.sql', import.meta.url), 'utf8');
const reference = JSON.parse(fs.readFileSync(new URL('../database/reference/order-logic-20261007.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const verification = fs.readFileSync(new URL('../database/verify-atomic-order-persistence-readonly.sql', import.meta.url), 'utf8');
const db = new PGlite();
const storeA = randomUUID();
const storeB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const zoneA = randomUUID();
const zoneB = randomUUID();

function checkoutDatabaseAdapter() {
    return {
        from(table) {
            assert.ok(['orders','store_config'].includes(table));
            let projection; const filters = [];
            const q = {
                select(fields) { projection=fields; return q; },
                eq(field,value) { assert.ok(['id','store_id','idempotency_key'].includes(field)); filters.push([field,value]); return q; },
                async single() { return q.maybeSingle(); },
                async maybeSingle() {
                    const where = filters.map(([field],i) => `o.${field}=$${i+1}`).join(' and ');
                    const nested = table==='orders' && projection.includes('order_items')
                        ? " || jsonb_build_object('order_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb))" : '';
                    const result = await db.query(`select to_jsonb(o)${nested} as row from public.${table} o where ${where}`,filters.map(f=>f[1]));
                    return {data:result.rows[0]?.row??null,error:null};
                },
            };
            return q;
        },
        async rpc(name,args) {
            try {
                let result;
                if(name==='rmenu_order_catalog_state') {
                    result=await db.query('select public.rmenu_order_catalog_state($1,$2::uuid[]) as value',[args.p_store_id,args.p_product_ids]);
                } else {
                    assert.equal(name,'rmenu_submit_order');
                    result=await db.query('select public.rmenu_submit_order($1::jsonb,$2,$3::jsonb) as value',[JSON.stringify(args.p_payload),args.p_request_hash,JSON.stringify(args.p_catalog_state)]);
                }
                return {data:result.rows[0].value,error:null};
            } catch(error) { return {data:null,error:{code:error.code,message:error.message}}; }
        },
    };
}

test('checkout do servidor executa SQL real, persiste complemento/cupom e recupera a mesma tentativa', async () => {
    await asRole('service_role',async () => {
        const c=await coupon({code:'INTEGRACAO',discount_value:2,usage_limit:1});
        const value={store_id:storeA,idempotency_key:randomUUID(),customer_name:'Cliente Integração',customer_phone:'(11) 99999-9999',
            delivery_type:'delivery',delivery_zone_id:zoneA,delivery_address:'Rua A, 10',address_complement:'Apto 12',
            payment_method:'pix',coupon_code:c.code,total:17,items:[{client_item_id:randomUUID(),product_id:productA,quantity:1}]};
        const baseline=await counts(); const adapter=checkoutDatabaseAdapter();
        const first=await checkoutService.submitCheckout(adapter,value);
        assert.equal(first.success,true,first.error);
        assert.match(first.message,/Apto 12/); assert.match(first.message,/Desconto \(INTEGRACAO\)/); assert.match(first.message,/17,00/);
        const persisted=await counts(); assert.equal(persisted.orders,baseline.orders+1); assert.equal(persisted.items,baseline.items+1); assert.equal(persisted.usages,baseline.usages+1);
        await db.query('update public.store_config set is_open=false where id=$1',[storeA]);
        await db.query('update public.products set is_available=false,price=20 where id=$1',[productA]);
        await db.query('update public.coupons set is_active=false where id=$1',[c.id]);
        const repeated=await checkoutService.submitCheckout(adapter,value);
        assert.equal(repeated.success,true,repeated.error); assert.equal(repeated.replayed,true); assert.equal(repeated.order_id,first.order_id);
        assert.deepEqual(await counts(),persisted);
        assert.equal((await db.query('select usage_count from public.coupons where id=$1',[c.id])).rows[0].usage_count,1);
    });
});

async function catalogState(ids = [productA]) {
    return (await db.query('select public.rmenu_order_catalog_state($1,$2::uuid[]) as state',[storeA,ids])).rows[0].state;
}
async function submit(value, state, hash = fingerprint(value)) {
    return (await db.query('select public.rmenu_submit_order($1::jsonb,$2,$3::jsonb) as result',
        [JSON.stringify(value),hash,JSON.stringify(state)])).rows[0].result;
}

test('catálogo privado contém regras necessárias e exclui dados do lojista', async () => {
    await asRole('service_role', async () => {
        const g = randomUUID(); const o = randomUUID();
        await db.query('update public.store_config set admin_email=$1 where id=$2',['privado@example.invalid',storeA]);
        await db.query('insert into public.product_option_groups(id,product_id,title) values($1,$2,$3)',[g,productA,'Extras']);
        await db.query('insert into public.product_options(id,group_id,name,price) values($1,$2,$3,2)',[o,g,'Queijo']);
        const state = await catalogState([productB,productA]);
        assert.equal(state.products.length,1);
        assert.equal(state.products[0].option_groups[0].options[0].id,o);
        assert.equal(state.products[0].option_groups[0].options[0].price,2);
        assert.equal('admin_email' in state.store,false);
        assert.equal('whatsapp' in state.store,false);
    });
});

test('submissão com catálogo atual persiste atomicamente sem confirmar WhatsApp', async () => {
    await asRole('service_role', async () => {
        const state = await catalogState(); const value = payload(); const result = await submit(value,state);
        const saved = (await db.query('select handoff_status,expected_item_count from public.orders where id=$1',[result.order_id])).rows[0];
        assert.equal(saved.handoff_status,'pending_handoff');
        assert.equal(saved.expected_item_count,1);
        assert.equal(result.replayed,false);
    });
});

test('mudança de preço, promoção, disponibilidade ou mínimo rejeita snapshot obsoleto sem escrita', async () => {
    for (const sql of [
        'update public.products set price=15 where id=$1',
        'update public.products set promo_price=10 where id=$1',
        'update public.products set is_available=false where id=$1',
        'update public.store_config set minimum_order=20 where id=$1',
    ]) {
        await asRole('service_role', async () => {
            const state = await catalogState(); const baseline = await counts();
            await db.query(sql,[sql.includes('store_config')?storeA:productA]);
            await assert.rejects(submit(payload(),state),/cardápio mudou/);
            // Fora de um savepoint o erro aborta a transação; rollback da asRole
            // também prova que nenhuma escrita do pedido escapa.
            await db.exec('rollback');
            assert.deepEqual(await counts(),baseline);
        });
    }
});

test('grupo, opção, regra e período novos também invalidam a leitura anterior', async () => {
    for (const target of ['group','option','rule','period']) {
        await asRole('service_role', async () => {
            const g = randomUUID(); const o = randomUUID(); const h = randomUUID();
            await db.query('insert into public.product_option_groups(id,product_id,title) values($1,$2,$3)',[g,productA,'Tamanho']);
            await db.query('insert into public.product_options(id,group_id,name,price) values($1,$2,$3,20)',[o,g,'Grande']);
            await db.query('insert into public.business_hours(id,store_config_id,day_of_week) values($1,$2,1)',[h,storeA]);
            const state = await catalogState();
            if(target==='group') await db.query('insert into public.product_option_groups(id,product_id,title) values($1,$2,$3)',[randomUUID(),productA,'Extras']);
            if(target==='option') await db.query('insert into public.product_options(id,group_id,name,price) values($1,$2,$3,2)',[randomUUID(),g,'Média']);
            if(target==='rule') await db.query('insert into public.group_size_rules(id,group_id,source_group_id,size_option_id,max_select) values($1,$2,$2,$3,1)',[randomUUID(),g,o]);
            if(target==='period') await db.query("insert into public.business_hour_periods(id,business_hour_id,open_time,close_time) values($1,$2,'08:00','18:00')",[randomUUID(),h]);
            await assert.rejects(submit(payload(),state),/cardápio mudou/);
        });
    }
});

test('produto de outra loja é rejeitado mesmo com projeção correspondente', async () => {
    await asRole('service_role', async () => {
        const value = payload(); value.items[0].product_id = productB;
        await assert.rejects(submit(value,await catalogState([productB])),/ou de outra loja/);
    });
});

test('pedido novo exige loja aberta; replay completo continua após fechamento e alteração do catálogo', async () => {
    await asRole('service_role', async () => {
        const value = payload(); const hash = fingerprint(value);
        const first = await submit(value,await catalogState(),hash);
        await db.query('update public.store_config set is_open=false where id=$1',[storeA]);
        await db.query('update public.products set price=20,is_available=false where id=$1',[productA]);
        const repeated = await submit(value,null,hash);
        assert.equal(repeated.order_id,first.order_id); assert.equal(repeated.replayed,true);
        await assert.rejects(submit(payload(),await catalogState()),/loja está fechada/);
    });
});

test('replay via submissão também bloqueia hash conflitante e itens incompletos', async () => {
    await asRole('service_role', async () => {
        const value = payload(); await submit(value,await catalogState());
        await assert.rejects(submit(value,null,'a'.repeat(64)),/outro conteúdo/);
    });
    await asRole('service_role', async () => {
        const value = payload(); const result = await submit(value,await catalogState());
        await db.query('delete from public.order_items where order_id=$1',[result.order_id]);
        await assert.rejects(submit(value,null),/incompleto/);
    });
});

test('horário determinístico usa São Paulo, fechamento exclusivo e período que atravessa meia-noite', async () => {
    const period = (day,open,close) => ({day_of_week:day,is_open:true,periods:[{open_time:open,close_time:close}]});
    const state = {store:{auto_schedule_enabled:true,is_open:false},hours:[period(1,'08:00:00','18:00:00')]};
    async function open(at,s=state) {
        return (await db.query('select public.rmenu_order_store_open($1::jsonb,$2::timestamptz) as open',[JSON.stringify(s),at])).rows[0].open;
    }
    assert.equal(await open('2026-10-05T10:59:59Z'),false); // 07:59:59 segunda
    assert.equal(await open('2026-10-05T11:00:00Z'),true);
    assert.equal(await open('2026-10-05T21:00:00Z'),false);
    state.hours = [period(1,'22:00:00','02:00:00')];
    assert.equal(await open('2026-10-06T01:00:00Z'),true); // segunda 22h
    assert.equal(await open('2026-10-06T04:59:59Z'),true); // terça 01:59:59
    assert.equal(await open('2026-10-06T05:00:00Z'),false);
    state.hours = [period(6,'22:00:00','02:00:00')];
    assert.equal(await open('2026-10-11T04:00:00Z'),true); // virada sábado/domingo
    state.hours = [period(1,'00:00:00','00:00:00')];
    assert.equal(await open('2026-10-05T15:00:00Z'),false);
    state.hours = [];
    assert.equal(await open('2026-10-05T15:00:00Z'),false);
    assert.equal(await open('2026-10-05T15:00:00Z',{store:{auto_schedule_enabled:false,is_open:true},hours:[]}),true);
    assert.equal(await open('2026-10-05T15:00:00Z',{store:null,hours:[]}),false);
});

test('funções do catálogo são privadas/invoker e migração é reaplicável', async () => {
    const migration4 = fs.readFileSync(new URL('../database/migrations/2026100704_guard_order_catalog.sql',import.meta.url),'utf8');
    const beforeState = await catalogState(); const beforeCounts = await counts();
    await db.exec(migration4);
    assert.deepEqual(await catalogState(),beforeState); assert.deepEqual(await counts(),beforeCounts);
    const sql = fs.readFileSync(new URL('../database/verify-order-catalog-readonly.sql',import.meta.url),'utf8');
    const result = (await db.query(sql)).rows[0].catalog_verification;
    assert.deepEqual(result.missing_functions,[]);
    assert.equal(result.functions.length,3);
    for(const fn of result.functions) {
        assert.equal(fn.exists,true); assert.equal(fn.security_definer,false);
        assert.deepEqual(fn.configuration,['search_path=""']);
        assert.equal(fn.anon_execute,false); assert.equal(fn.authenticated_execute,false); assert.equal(fn.service_role_execute,true);
    }
    for(const role of ['anon','authenticated']) {
        await asRole(role,async () => { await assert.rejects(catalogState(),/permission denied/); });
        await asRole(role,async () => { await assert.rejects(submit(payload(),beforeState),/permission denied/); });
    }
});

function payload(overrides = {}) {
    return {
        store_id: storeA, idempotency_key: randomUUID(), customer_name: 'Cliente Teste', customer_phone: '11999999999',
        delivery_type: 'pickup', payment_method: 'pix', total: 14,
        items: [{ product_id: productA, product_name: 'Produto A', quantity: 1, unit_price: 14, item_total: 14, selected_options: [], is_half_half: false }],
        ...overrides,
    };
}

function fingerprint(value) {
    // Somente fixture: no app, normalizar intenção separadamente do snapshot calculado.
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function call(value, hash = fingerprint(value)) {
    return (await db.query('select public.rmenu_create_order_atomic($1::jsonb,$2) as result', [JSON.stringify(value), hash])).rows[0].result;
}

async function asRole(role, callback) {
    await db.exec('begin');
    try {
        await db.exec(`set local role ${role}`);
        return await callback();
    } finally {
        await db.exec('rollback');
    }
}

async function coupon(overrides = {}) {
    const value = { id: randomUUID(), store_id: storeA, code: 'TESTE', discount_type: 'fixed', discount_value: 2, usage_limit: 1, ...overrides };
    const fields = Object.keys(value);
    await db.query(`insert into public.coupons(${fields.join(',')}) values (${fields.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(value));
    return value;
}

async function counts() {
    return (await db.query(`select
        (select count(*)::int from public.orders) as orders,
        (select count(*)::int from public.order_items) as items,
        (select count(*)::int from public.coupon_usages) as usages`)).rows[0];
}

test('snapshot meio a meio persiste dois sabores da loja e rejeita sabor de outra loja', async () => {
    await asRole('service_role', async () => {
        const secondFlavor = randomUUID();
        await db.query('update public.products set allows_half_half=true where id=$1', [productA]);
        await db.query('insert into public.products(id,store_id,allows_half_half) values($1,$2,true)', [secondFlavor, storeA]);
        const value = payload();
        value.items[0].is_half_half = true;
        value.items[0].half_half_items = [
            { product_id: productA, product_name: 'Sabor A', selected_options: [] },
            { product_id: secondFlavor, product_name: 'Sabor C', selected_options: [] },
        ];
        const first = await call(value);
        const saved = (await db.query('select is_half_half,half_half_items from public.order_items where order_id=$1', [first.order_id])).rows[0];
        assert.equal(saved.is_half_half, true);
        assert.deepEqual(saved.half_half_items, value.items[0].half_half_items);
        const bad = structuredClone(value);
        bad.idempotency_key = randomUUID();
        bad.items[0].half_half_items[1].product_id = productB;
        await db.exec('savepoint foreign_flavor');
        await assert.rejects(() => call(bad), error => error.code === '22023' && error.message.includes('Sabor'));
        await db.exec('rollback to savepoint foreign_flavor');
        assert.deepEqual(await counts(), { orders: 1, items: 1, usages: 0 });
    });
});

test('mesa exige modo habilitado e pagamento precisa estar disponível', async () => {
    await assert.rejects(() => asRole('service_role', () => call(payload({ delivery_type: 'table', customer_phone: '', table_number: 2 }))), error => error.code === '22023' && error.message.includes('Mesa'));
    await asRole('service_role', async () => {
        await db.query('update public.store_config set table_mode_available=true,table_mode_enabled=true where id=$1', [storeA]);
        const first = await call(payload({ delivery_type: 'table', customer_phone: '', table_number: 2 }));
        const saved = (await db.query('select table_number,customer_phone,delivery_fee from public.orders where id=$1', [first.order_id])).rows[0];
        assert.equal(saved.table_number, 2);
        assert.equal(saved.customer_phone, '');
        assert.equal(Number(saved.delivery_fee), 0);
    });
    await assert.rejects(() => asRole('service_role', async () => {
        await db.query('update public.store_config set accept_pix=false where id=$1', [storeA]);
        await call(payload());
    }), error => error.code === '22023' && error.message.includes('pagamento'));
});

test('migração preserva pedido legado e seus itens sem atribuir hash ou mudar número', async () => {
    const legacy = (await db.query(`insert into public.orders(store_id,customer_name,customer_phone,delivery_type,payment_method,subtotal,total,idempotency_key)
        values($1,'Cliente Legado','11911111111','pickup','pix',14,14,$2) returning id`, [storeA, randomUUID()])).rows[0];
    await db.query(`insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,item_total) values($1,$2,'Produto anterior',1,14,14)`, [legacy.id, productA]);
    try {
        const beforeOrder = (await db.query('select * from public.orders where id=$1', [legacy.id])).rows[0];
        const beforeItems = (await db.query('select * from public.order_items where order_id=$1', [legacy.id])).rows;
        await db.exec(migration);
        assert.deepEqual((await db.query('select * from public.orders where id=$1', [legacy.id])).rows[0], beforeOrder);
        assert.deepEqual((await db.query('select * from public.order_items where order_id=$1', [legacy.id])).rows, beforeItems);
        assert.equal(beforeOrder.request_hash, null);
        assert.equal(beforeOrder.expected_item_count, null);
    } finally {
        await db.query('delete from public.orders where id=$1', [legacy.id]);
    }
});

test('falha depois do DDL desfaz migração inteira e restaura schema anterior', async () => {
    await db.exec('begin');
    try {
        await db.exec('alter table public.orders drop column request_hash cascade; alter function public.update_coupons_updated_at() rename to fixture_missing_function');
        await assert.rejects(() => db.exec(migration), error => error.code === '42883');
    } finally {
        await db.exec('rollback');
    }
    const result = (await db.exec(verification))[0].rows[0].persistence_verification;
    assert.equal(result.order_columns.length, 3);
    assert.deepEqual(result.missing_constraints, []);
    assert.equal((await db.query("select to_regprocedure('public.update_coupons_updated_at()') is not null as restored")).rows[0].restored, true);
});

test('histórico duplicado interrompe preflight sem excluir usos ou recalcular contadores', async () => {
    await db.exec('begin');
    try {
        const c = await coupon();
        const value = payload({ coupon_code: 'TESTE', total: 12 });
        const first = await call(value);
        await db.exec('alter table public.coupon_usages drop constraint rmenu_coupon_usage_one_per_order');
        await db.query('insert into public.coupon_usages(coupon_id,order_id,customer_phone,discount_applied) values ($1,$2,$3,2)', [c.id, first.order_id, '11999999999']);
        await assert.rejects(() => db.exec(migration), error => error.code === 'P0001' && error.message.includes('múltiplos'));
    } finally {
        await db.exec('rollback');
    }
    assert.deepEqual(await counts(), { orders: 0, items: 0, usages: 0 });
});

test('verificação de instalação confirma colunas, constraints e permissões do RPC', async () => {
    const result = (await db.exec(verification))[0].rows[0].persistence_verification;
    assert.equal(result.order_columns.length, 3);
    assert.equal(result.rpc_exists, true);
    assert.equal(result.rpc_security_definer, false);
    assert.equal(result.anon_rpc_execute, false);
    assert.equal(result.authenticated_rpc_execute, false);
    assert.equal(result.service_role_rpc_execute, true);
    assert.equal(result.installed_constraints.length, 5);
    assert.ok(result.installed_constraints.every(c => c.convalidated));
    assert.deepEqual(result.missing_constraints, []);
    assert.equal(result.coupon_counter_not_nullable, true);
    assert.equal(result.same_store_trigger_enabled, true);
    assert.equal(result.original_numbering_trigger_enabled, true);
});

before(async () => {
    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.store_config(id uuid primary key, name text, minimum_order numeric default 0,
            accept_pix boolean default true, accept_card boolean default true, accept_cash boolean default true,
            table_mode_available boolean default false, table_mode_enabled boolean default false, table_count integer default 10);
        create table public.products(id uuid primary key, store_id uuid references public.store_config(id),
            is_available boolean default true, allows_half_half boolean default false);
        create table public.delivery_zones(id uuid primary key, store_id uuid references public.store_config(id), name text, price numeric not null, is_active boolean default true);
        create table public.orders(id uuid primary key default gen_random_uuid(), store_id uuid not null references public.store_config(id),
            order_number integer not null default 0, customer_name text not null, customer_phone text not null,
            delivery_type text not null check(delivery_type in ('delivery','pickup','table')), table_number integer,
            delivery_zone_id uuid references public.delivery_zones(id), delivery_zone_name text, delivery_address text,
            payment_method text not null check(payment_method in ('pix','card','cash')), change_for numeric,
            subtotal numeric not null, delivery_fee numeric not null default 0, discount_value numeric default 0, coupon_code text,
            total numeric not null, status text not null default 'pending', handoff_status text default 'unknown', idempotency_key text, notes text,
            created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(store_id,order_number),
            check(delivery_type<>'delivery' or delivery_address is not null), check(delivery_type<>'table' or table_number is not null));
        create unique index orders_store_id_idempotency_unique on public.orders(store_id,idempotency_key) where idempotency_key is not null;
        create table public.order_items(id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
            product_id uuid references public.products(id) on delete set null, product_name text not null, quantity integer not null check(quantity>0),
            unit_price numeric not null, selected_options jsonb not null default '[]', observations text, is_half_half boolean not null default false,
            half_half_items jsonb, item_total numeric not null, created_at timestamptz not null default now());
        create table public.coupons(id uuid primary key default gen_random_uuid(), store_id uuid not null references public.store_config(id),
            code text not null, discount_type text not null check(discount_type in ('fixed','percentage','free_delivery')), discount_value numeric not null,
            min_order_value numeric default 0, max_discount_value numeric, valid_from timestamptz not null default now(), valid_until timestamptz,
            usage_limit integer, usage_count integer default 0, is_active boolean default true, applies_to text default 'all',
            updated_at timestamptz default now(), unique(store_id,code));
        create table public.coupon_usages(id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupons(id) on delete cascade,
            order_id uuid not null references public.orders(id) on delete cascade, customer_phone text not null, discount_applied numeric not null);
    `);
    for (const table of ['store_config', 'products', 'delivery_zones', 'orders', 'order_items', 'coupons', 'coupon_usages']) {
        await db.exec(`alter table public.${table} enable row level security; grant all on public.${table} to service_role; grant select on public.${table} to anon,authenticated;`);
    }
    for (const fn of reference.functions) await db.exec(fn.definition);
    for (const trigger of reference.triggers) await db.exec(`${trigger.definition};`);
    await db.query('insert into public.store_config(id,name) values ($1,$2),($3,$4)', [storeA, 'A', storeB, 'B']);
    await db.query('insert into public.products(id,store_id) values ($1,$2),($3,$4)', [productA, storeA, productB, storeB]);
    await db.query('insert into public.delivery_zones(id,store_id,name,price) values ($1,$2,$3,5),($4,$5,$6,8)', [zoneA, storeA, 'Zona A', zoneB, storeB, 'Zona B']);
    await db.exec(migration);
    await db.exec(`
        alter table public.store_config add column is_open boolean default true,
            add column auto_schedule_enabled boolean default false, add column admin_email text,
            add column whatsapp text default '11999990000', add column pix_key text;
        alter table public.products add column category_id uuid, add column name text default 'Produto',
            add column price numeric default 14, add column promo_price numeric;
        create table public.product_option_groups(id uuid primary key,product_id uuid references public.products(id),
            title text,pricing_mode text default 'addon',is_required boolean default false,max_select integer default 0,sort_order integer default 0);
        create table public.product_options(id uuid primary key,group_id uuid references public.product_option_groups(id),
            name text,price numeric,is_available boolean default true);
        create table public.group_size_rules(id uuid primary key,group_id uuid references public.product_option_groups(id),
            source_group_id uuid references public.product_option_groups(id),size_option_id uuid references public.product_options(id),max_select integer);
        create table public.business_hours(id uuid primary key,store_config_id uuid references public.store_config(id),
            day_of_week integer,is_open boolean default true);
        create table public.business_hour_periods(id uuid primary key,business_hour_id uuid references public.business_hours(id),open_time time,close_time time);
    `);
    for (const table of ['product_option_groups','product_options','group_size_rules','business_hours','business_hour_periods']) {
        await db.exec(`alter table public.${table} enable row level security; grant all on public.${table} to service_role;`);
    }
    await db.exec(fs.readFileSync(new URL('../database/migrations/2026100704_guard_order_catalog.sql', import.meta.url), 'utf8'));
});

after(async () => db.close());

test('RPC é invoker, search_path vazio, disponível ao servidor e bloqueado aos clientes', async () => {
    const config = (await db.query("select prosecdef,proconfig from pg_proc where oid='public.rmenu_create_order_atomic(jsonb,text)'::regprocedure")).rows[0];
    assert.equal(config.prosecdef, false);
    assert.deepEqual(config.proconfig, ['search_path=""']);
    for (const role of ['anon', 'authenticated']) {
        await assert.rejects(() => asRole(role, () => call(payload())), error => error.code === '42501');
    }
    await asRole('service_role', async () => assert.ok((await call(payload())).order_id));
});

test('pedido e itens são gravados juntos; WhatsApp permanece pending_handoff', async () => {
    await asRole('service_role', async () => {
        const result = await call(payload());
        assert.equal(result.replayed, false);
        assert.deepEqual(await counts(), { orders: 1, items: 1, usages: 0 });
        const order = (await db.query('select * from public.orders where id=$1', [result.order_id])).rows[0];
        assert.equal(order.status, 'pending');
        assert.equal(order.handoff_status, 'pending_handoff');
        assert.equal(order.expected_item_count, 1);
    });
});

test('falha no segundo item desfaz pedido, primeiro item e uso de cupom', async () => {
    const original = await counts();
    await assert.rejects(() => asRole('service_role', async () => {
        await coupon();
        const value = payload({ total: 26, coupon_code: 'TESTE' });
        value.items.push({ ...value.items[0], product_id: productB });
        await call(value);
    }), error => error.code === '22023' && error.message.includes('outra loja'));
    assert.deepEqual(await counts(), original);
});

test('falha no registro de uso desfaz pedido e itens sem consumir cupom', async () => {
    await db.exec(`create function public.fixture_reject_usage() returns trigger language plpgsql as $$begin raise exception 'fixture failure'; end;$$;
        create trigger fixture_reject_usage before insert on public.coupon_usages for each row execute function public.fixture_reject_usage();`);
    try {
        await assert.rejects(() => asRole('service_role', async () => {
            await coupon();
            await call(payload({ total: 12, coupon_code: 'TESTE' }));
        }), error => error.message.includes('fixture failure'));
        assert.deepEqual(await counts(), { orders: 0, items: 0, usages: 0 });
    } finally {
        await db.exec('drop trigger fixture_reject_usage on public.coupon_usages; drop function public.fixture_reject_usage()');
    }
});

test('mesma intenção retorna pedido completo sem duplicar itens, cupom ou número', async () => {
    await asRole('service_role', async () => {
        const value = payload({ total: 12, coupon_code: 'TESTE' });
        const c = await coupon();
        const first = await call(value);
        // Um replay legítimo não depende de o cupom ainda estar disponível.
        await db.query('update public.coupons set is_active=false where id=$1', [c.id]);
        const next = await call(value);
        assert.equal(next.order_id, first.order_id);
        assert.equal(next.order_number, first.order_number);
        assert.equal(next.replayed, true);
        assert.deepEqual(await counts(), { orders: 1, items: 1, usages: 1 });
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [c.id])).rows[0].usage_count, 1);
    });
});

test('mesma chave com hash diferente rejeita conflito', async () => {
    await assert.rejects(() => asRole('service_role', async () => {
        const value = payload();
        await call(value);
        await call(value, 'a'.repeat(64));
    }), error => error.code === '22023' && error.message.includes('outro conteúdo'));
});

for (const state of ['cancelled', 'incomplete', 'legacy']) {
    test(`replay de pedido ${state} é rejeitado`, async () => {
        await assert.rejects(() => asRole('service_role', async () => {
            const value = payload();
            const first = await call(value);
            if (state === 'cancelled') await db.query("update public.orders set status='cancelled' where id=$1", [first.order_id]);
            if (state === 'incomplete') await db.query('delete from public.order_items where order_id=$1', [first.order_id]);
            if (state === 'legacy') await db.query('update public.orders set request_hash=null where id=$1', [first.order_id]);
            await call(value);
        }), error => error.code === '22023');
    });
}

test('complemento persiste e frete/nome da zona vêm do banco', async () => {
    await asRole('service_role', async () => {
        const first = await call(payload({ delivery_type: 'delivery', delivery_zone_id: zoneA,
            delivery_address: ' Rua Teste, 10 ', address_complement: ' Apto 2 ', delivery_fee: 0, delivery_zone_name: 'Injetado', total: 19 }));
        const order = (await db.query('select delivery_address,address_complement,delivery_fee,delivery_zone_name from public.orders where id=$1', [first.order_id])).rows[0];
        assert.deepEqual({ ...order, delivery_fee: Number(order.delivery_fee) }, { delivery_address: 'Rua Teste, 10', address_complement: 'Apto 2', delivery_fee: 5, delivery_zone_name: 'Zona A' });
    });
    await assert.rejects(() => asRole('service_role', () => call(payload({ delivery_type: 'delivery', delivery_zone_id: zoneB, delivery_address: 'Rua Teste', total: 22 }))), error => error.code === '22023');
});

test('limite de cupom rejeita a próxima tentativa sem aumentar contagem', async () => {
    await asRole('service_role', async () => {
        const c = await coupon();
        await call(payload({ coupon_code: 'TESTE', total: 12 }));
        await db.exec('savepoint next_attempt');
        await assert.rejects(() => call(payload({ coupon_code: 'TESTE', total: 12 })), error => error.code === '22023');
        await db.exec('rollback to savepoint next_attempt');
        assert.deepEqual(await counts(), { orders: 1, items: 1, usages: 1 });
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [c.id])).rows[0].usage_count, 1);
    });
});

test('cupom percentual, teto e frete grátis são recalculados', async () => {
    await asRole('service_role', async () => {
        await coupon({ discount_type: 'percentage', discount_value: 50, max_discount_value: 3, usage_limit: null });
        const percentage = await call(payload({ coupon_code: 'TESTE', total: 11, discount_value: 900 }));
        assert.equal(percentage.discount_value, 3);
        await coupon({ code: 'FRETE', discount_type: 'free_delivery', discount_value: 0 });
        const free = await call(payload({ coupon_code: 'FRETE', delivery_type: 'delivery', delivery_zone_id: zoneA, delivery_address: 'Rua Teste', total: 14 }));
        assert.equal(free.delivery_fee, 5);
        assert.equal(free.discount_value, 5);
        assert.equal(free.total, 14);
    });
});

test('cupom expirado, mínimo, tipo de entrega e primeira compra são verificados', async () => {
    for (const c of [
        { valid_until: '2020-01-01T00:00:00Z' },
        { min_order_value: 20 },
        { applies_to: 'delivery' },
        { applies_to: 'first_purchase' },
    ]) {
        await assert.rejects(() => asRole('service_role', async () => {
            await coupon(c);
            if (c.applies_to === 'first_purchase') await call(payload());
            await call(payload({ coupon_code: 'TESTE', total: 12 }));
        }), error => error.code === '22023');
    }
});

test('unicidade de uso e vínculo entre lojas também protegem escrita fora do RPC', async () => {
    await asRole('service_role', async () => {
        const c = await coupon();
        const first = await call(payload({ coupon_code: 'TESTE', total: 12 }));
        const insert = couponId => db.query('insert into public.coupon_usages(coupon_id,order_id,customer_phone,discount_applied) values ($1,$2,$3,2)', [couponId, first.order_id, '11999999999']);
        await db.exec('savepoint duplicate_usage');
        await assert.rejects(() => insert(c.id), error => error.code === '23505');
        await db.exec('rollback to savepoint duplicate_usage');
        const otherCoupon = await coupon({ store_id: storeB, code: 'OUTRO' });
        await db.exec('savepoint foreign_usage');
        await assert.rejects(() => insert(otherCoupon.id), error => error.code === '23514');
        await db.exec('rollback to savepoint foreign_usage');
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [c.id])).rows[0].usage_count, 1);
    });
});

test('números não finitos e valor total divergente são rejeitados', async () => {
    for (const bad of ['NaN', 'Infinity', '-Infinity']) {
        await assert.rejects(() => asRole('service_role', async () => {
            const value = payload({ total: bad });
            value.items[0].unit_price = bad;
            value.items[0].item_total = bad;
            await call(value);
        }), error => error.code === '22023');
    }
    await assert.rejects(() => asRole('service_role', () => call(payload({ total: 1 }))), error => error.code === '22023');
});

test('migração é reaplicável sem alterar pedidos e itens existentes', async () => {
    const beforeCounts = await counts();
    await db.exec(migration);
    assert.deepEqual(await counts(), beforeCounts);
});
