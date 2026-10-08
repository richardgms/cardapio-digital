import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { before, after, test } from 'node:test';

// Somente PostgreSQL local e dados fictícios; não lê .env nem acessa Supabase.
// Os casos "diagnóstico" reproduzem riscos da lógica recebida, não uma correção.
const runtimeRequire = createRequire(new URL('../docs/sql-test-runtime/package.json', import.meta.url));
const { PGlite } = await import(pathToFileURL(runtimeRequire.resolve('@electric-sql/pglite')).href);
const migration = fs.readFileSync(new URL('../database/migrations/2026100702_revoke_unsafe_table_privileges.sql', import.meta.url), 'utf8');
const verification = fs.readFileSync(new URL('../database/verify-order-foundation-readonly.sql', import.meta.url), 'utf8');
const reference = JSON.parse(fs.readFileSync(new URL('../database/reference/order-logic-20261007.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const db = new PGlite();
const storeA = '00000001-2222-4222-8222-222222222222';
const storeB = '00000002-2222-4222-8222-222222222222';
const orderA = '00000003-2222-4222-8222-222222222222';
const orderB = '00000004-2222-4222-8222-222222222222';
const couponA = '00000005-2222-4222-8222-222222222222';
const couponB = '00000006-2222-4222-8222-222222222222';
const tables = ['admin_impersonation_logs', 'business_hour_periods', 'business_hours',
    'categories', 'coupon_usages', 'coupons', 'delivery_zones', 'group_size_rules',
    'notification_reads', 'notifications', 'order_items', 'orders',
    'product_option_groups', 'product_options', 'products', 'store_config'];
const schemas = {
    store_config: 'id uuid primary key, name text',
    orders: "id uuid primary key default gen_random_uuid(), store_id uuid not null references store_config(id), order_number integer not null default 0, status text not null default 'pending', updated_at timestamptz default now(), unique(store_id, order_number)",
    order_items: 'id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade',
    coupons: 'id uuid primary key default gen_random_uuid(), store_id uuid not null references store_config(id), usage_count integer default 0, usage_limit integer, updated_at timestamptz default now()',
    coupon_usages: 'id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, coupon_id uuid not null references coupons(id) on delete cascade, discount_applied numeric not null default 1',
};

async function asRole(role, userId, callback) {
    await db.exec('begin');
    try {
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
        return await callback();
    } finally {
        await db.exec('rollback');
    }
}

async function crudPrivileges() {
    return (await db.query(`
        select c.relname, r.role_name, p.privilege,
               has_table_privilege(r.role_name, c.oid, p.privilege) as allowed
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
        where n.nspname='public' and c.relkind='r'
        order by c.relname, r.role_name, p.privilege
    `)).rows;
}

async function catalogSnapshot() {
    return (await db.query(`
        select (select jsonb_agg(to_jsonb(p) order by tablename, policyname) from pg_policies p where schemaname='public') as policies,
               (select jsonb_agg(to_jsonb(t) order by tgname) from pg_trigger t where not tgisinternal) as triggers,
               (select jsonb_agg(pg_get_functiondef(p.oid) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') as functions
    `)).rows;
}

async function insertUsage(orderId, couponId) {
    return db.query('insert into public.coupon_usages(order_id,coupon_id) values ($1,$2) returning id', [orderId, couponId]);
}

before(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as
            $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
        grant usage on schema auth, public to anon, authenticated, service_role;`);
    // Tabelas não envolvidas nos triggers têm esquema reduzido: verificamos grants.
    for (const table of [...tables].sort((a, b) => {
        const order = ['store_config', 'orders', 'coupons', 'coupon_usages', 'order_items'];
        return (order.includes(a) ? order.indexOf(a) : 5) - (order.includes(b) ? order.indexOf(b) : 5);
    })) {
        await db.exec(`create table public.${table}(${schemas[table] ?? 'id uuid primary key default gen_random_uuid(), name text'});
            alter table public.${table} enable row level security;
            grant all on public.${table} to public, anon, authenticated, service_role;`);
        if (['orders', 'coupons'].includes(table)) {
            await db.exec(`create policy owner_access on public.${table} for all to authenticated using(store_id=auth.uid()) with check(store_id=auth.uid());`);
        } else if (table === 'coupon_usages') {
            await db.exec('create policy owner_read on public.coupon_usages for select to public using(exists(select 1 from public.orders o where o.id=order_id and o.store_id=auth.uid()));');
        } else if (table === 'order_items') {
            await db.exec('create policy owner_access on public.order_items for all to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.store_id=auth.uid()));');
        } else {
            await db.exec(`create policy public_read on public.${table} for select to public using(true);`);
        }
    }
    for (const fn of reference.functions) await db.exec(fn.definition);
    for (const trigger of reference.triggers) await db.exec(`${trigger.definition};`);
    await db.query('insert into public.store_config(id,name) values ($1,$2),($3,$4)', [storeA, 'A', storeB, 'B']);
    await db.query('insert into public.orders(id,store_id) values ($1,$2),($3,$4)', [orderA, storeA, orderB, storeB]);
    await db.query('insert into public.coupons(id,store_id,usage_limit) values ($1,$2,1),($3,$4,1)', [couponA, storeA, couponB, storeB]);
    await db.exec("insert into public.notifications(name) values ('fixture')");

    // Reproduzir em memória: RLS não bloqueia TRUNCATE concedido ao papel.
    await asRole('anon', null, async () => {
        await db.exec('truncate public.notifications');
        assert.equal((await db.query('select count(*)::int as total from public.notifications')).rows[0].total, 0);
    });
    const originalCrud = await crudPrivileges();
    const originalCatalog = await catalogSnapshot();
    await db.exec(migration);
    assert.deepEqual(await crudPrivileges(), originalCrud);
    assert.deepEqual(await catalogSnapshot(), originalCatalog);
});

after(async () => db.close());

test('grants de tabela inteira foram removidos nas 16 tabelas; dados e contadores preservados', async () => {
    const results = await db.exec(verification);
    const result = results[0].rows[0].foundation_verification;
    assert.equal(result.tables_checked, 16);
    assert.deepEqual(result.missing_tables, []);
    assert.deepEqual(result.tables_without_rls, []);
    assert.deepEqual(result.unexpected_client_table_privileges, []);
    assert.equal(result.coupon_data.coupons_count, 2);
    assert.equal(result.coupon_data.usage_rows_count, 0);
    assert.equal(result.coupon_data.counters_differing_from_recorded_usages, 0);
    assert.equal((await db.query('select count(*)::int as total from public.orders')).rows[0].total, 2);
});

test('anon e authenticated não conseguem truncar tabelas sem nem com cascade', async () => {
    for (const role of ['anon', 'authenticated']) {
        for (const table of tables) {
            for (const suffix of ['', ' cascade']) {
                await assert.rejects(() => asRole(role, storeA, () => db.exec(`truncate public.${table}${suffix}`)), error => error.code === '42501');
            }
        }
    }
});

test('remoção de TRIGGER/REFERENCES também considera privilégios concedidos a PUBLIC', async () => {
    for (const role of ['anon', 'authenticated']) {
        for (const table of tables) {
            for (const privilege of ['TRIGGER', 'REFERENCES']) {
                assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', [role, `public.${table}`, privilege])).rows[0].allowed, false);
            }
        }
    }
});

test('leitura pública e atualização de pedido próprio continuam disponíveis', async () => {
    const publicResult = await asRole('anon', null, () => db.query('select * from public.notifications'));
    assert.equal(publicResult.rows.length, 1);
    await asRole('authenticated', storeA, async () => {
        const own = await db.query("update public.orders set status='confirmed' where id=$1 returning id", [orderA]);
        assert.equal(own.rows.length, 1);
        const other = await db.query("update public.orders set status='confirmed' where id=$1 returning id", [orderB]);
        assert.equal(other.rows.length, 0);
    });
});

test('service_role mantém criação de pedido e funcionamento dos triggers', async () => {
    await asRole('service_role', null, async () => {
        const order = (await db.query('insert into public.orders(store_id) values ($1) returning id,order_number', [storeA])).rows[0];
        assert.equal(order.order_number, 2);
        await insertUsage(order.id, couponA);
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [couponA])).rows[0].usage_count, 1);
        for (const privilege of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) {
            assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed', ['service_role', 'public.orders', privilege])).rows[0].allowed, true);
        }
    });
});

test('migração reaplicável preserva novamente CRUD, políticas e funções', async () => {
    const originalCrud = await crudPrivileges();
    const originalCatalog = await catalogSnapshot();
    await db.exec(migration);
    assert.deepEqual(await crudPrivileges(), originalCrud);
    assert.deepEqual(await catalogSnapshot(), originalCatalog);
});

test('privilégio herdado de outro papel aborta e desfaz toda a migração', async () => {
    const originalCrud = await crudPrivileges();
    await db.exec('begin');
    try {
        await db.exec('create role fixture_privileged; grant truncate on public.notifications to fixture_privileged; grant fixture_privileged to anon; grant trigger on public.store_config to authenticated;');
        await assert.rejects(() => db.exec(migration), error => error.code === 'P0001' && error.message.includes('ainda herdado'));
    } finally {
        await db.exec('rollback');
    }
    assert.deepEqual(await crudPrivileges(), originalCrud);
    assert.equal((await db.query("select has_table_privilege('authenticated','public.store_config','TRIGGER') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select count(*)::int as total from pg_roles where rolname='fixture_privileged'")).rows[0].total, 0);
});

test('tabela faltando interrompe migração sem aplicação parcial', async () => {
    await db.exec('begin');
    try {
        await db.exec('alter table public.coupons rename to coupons_missing');
        await assert.rejects(() => db.exec(migration), error => error.code === 'P0001' && error.message.includes('ausente'));
    } finally {
        await db.exec('rollback');
    }
    const result = (await db.exec(verification))[0].rows[0].foundation_verification;
    assert.equal(result.tables_checked, 16);
    assert.deepEqual(result.unexpected_client_table_privileges, []);
});

test('diagnóstico: numeração atual reutiliza o último número se o pedido for excluído', async () => {
    await asRole('service_role', null, async () => {
        const first = (await db.query('insert into public.orders(store_id) values ($1) returning id,order_number', [storeA])).rows[0];
        await db.query('delete from public.orders where id=$1', [first.id]);
        const next = (await db.query('insert into public.orders(store_id) values ($1) returning order_number', [storeA])).rows[0];
        assert.equal(first.order_number, 2);
        assert.equal(next.order_number, first.order_number);
    });
});

test('diagnóstico: uso repetido para o mesmo pedido aumenta duas vezes e ultrapassa o limite', async () => {
    await asRole('service_role', null, async () => {
        await insertUsage(orderA, couponA);
        await insertUsage(orderA, couponA);
        const coupon = (await db.query('select usage_count,usage_limit from public.coupons where id=$1', [couponA])).rows[0];
        assert.equal(coupon.usage_limit, 1);
        assert.equal(coupon.usage_count, 2);
        const result = (await db.exec(verification))[0].rows[0].foundation_verification;
        assert.equal(result.coupon_data.orders_with_multiple_coupon_usages, 1);
        assert.equal(result.coupon_data.coupons_above_usage_limit, 1);
    });
});

test('diagnóstico: contador NULL permanece NULL após registrar uso', async () => {
    await asRole('service_role', null, async () => {
        await db.query('update public.coupons set usage_count=null where id=$1', [couponA]);
        await insertUsage(orderA, couponA);
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [couponA])).rows[0].usage_count, null);
    });
});

test('diagnóstico: as FKs atuais permitem ligar cupom e pedido de lojas diferentes', async () => {
    await asRole('service_role', null, async () => {
        await insertUsage(orderA, couponB);
        const result = (await db.exec(verification))[0].rows[0].foundation_verification;
        assert.equal(result.coupon_data.usages_linking_different_stores, 1);
    });
});

test('diagnóstico: excluir registro de uso não decrementa contador', async () => {
    await asRole('service_role', null, async () => {
        const usage = (await insertUsage(orderA, couponA)).rows[0];
        await db.query('delete from public.coupon_usages where id=$1', [usage.id]);
        assert.equal((await db.query('select usage_count from public.coupons where id=$1', [couponA])).rows[0].usage_count, 1);
        const result = (await db.exec(verification))[0].rows[0].foundation_verification;
        assert.equal(result.coupon_data.counters_differing_from_recorded_usages, 1);
    });
});

test('diagnóstico: cupom privado não é visível ao visitante com as políticas atuais', async () => {
    assert.equal((await asRole('anon', null, () => db.query('select * from public.coupons'))).rows.length, 0);
});

test('EXECUTE público em função de trigger não autoriza chamá-la como RPC SQL normal', async () => {
    for (const fn of reference.functions) {
        await assert.rejects(() => asRole('anon', null, () => db.query(`select public.${fn.function_name}()`)), error => error.code === '0A000');
    }
});
