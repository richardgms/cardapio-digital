import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { before, after, test } from 'node:test';

// PostgreSQL em memória, com dados fictícios; não lê .env nem conecta ao Supabase.
// Instalação isolada documentada em database/README.md.
const runtimeRequire = createRequire(new URL('../docs/sql-test-runtime/package.json', import.meta.url));
const { PGlite } = await import(pathToFileURL(runtimeRequire.resolve('@electric-sql/pglite')).href);
const migration = fs.readFileSync(new URL('../database/migrations/2026100701_harden_store_writes.sql', import.meta.url), 'utf8');
const verification = fs.readFileSync(new URL('../database/verify-store-writes-readonly.sql', import.meta.url), 'utf8');
const liveIsolationVerification = fs.readFileSync(new URL('../database/verify-store-isolation-rollback.sql', import.meta.url), 'utf8');
const db = new PGlite();
const storeA = '00000001-1111-4111-8111-111111111111';
const storeB = '00000002-1111-4111-8111-111111111111';
const storeC = '00000003-1111-4111-8111-111111111111';
const tables = ['store_config', 'categories', 'delivery_zones', 'products', 'business_hours',
    'business_hour_periods', 'product_option_groups', 'product_options', 'group_size_rules'];
const schemas = {
    store_config: 'id uuid primary key, name text, admin_email text',
    categories: 'id uuid primary key, store_id uuid references store_config(id), name text',
    delivery_zones: 'id uuid primary key, store_id uuid references store_config(id), name text',
    products: 'id uuid primary key, store_id uuid references store_config(id), category_id uuid references categories(id), name text, description text, price numeric not null default 1, is_available boolean default false',
    business_hours: 'id uuid primary key, store_config_id uuid references store_config(id), day_of_week int, is_open boolean',
    business_hour_periods: 'id uuid primary key, business_hour_id uuid references business_hours(id), open_time text, close_time text',
    product_option_groups: 'id uuid primary key, product_id uuid references products(id), name text',
    product_options: 'id uuid primary key, group_id uuid references product_option_groups(id), name text',
    group_size_rules: 'id uuid primary key, group_id uuid references product_option_groups(id), size_option_id uuid references product_options(id), source_group_id uuid references product_option_groups(id), max_select int',
};

function id(table, store) {
    if (table === 'store_config') return store === 'A' ? storeA : storeB;
    return `${String(10 + tables.indexOf(table) * 2 + (store === 'B' ? 1 : 0)).padStart(8, '0')}-1111-4111-8111-111111111111`;
}

function row(table, store) {
    const storeId = store === 'A' ? storeA : storeB;
    const base = { id: id(table, store) };
    if (table === 'store_config') return { ...base, name: `Loja ${store}`, admin_email: `${store}@example.invalid` };
    if (['categories', 'delivery_zones', 'products'].includes(table)) {
        return { ...base, store_id: storeId, name: `Item ${store}`, ...(table === 'products' ? { category_id: id('categories', store) } : {}) };
    }
    if (table === 'business_hours') return { ...base, store_config_id: storeId, day_of_week: 1, is_open: true };
    if (table === 'business_hour_periods') return { ...base, business_hour_id: id('business_hours', store), open_time: '08:00', close_time: '18:00' };
    if (table === 'product_option_groups') return { ...base, product_id: id('products', store), name: `Grupo ${store}` };
    if (table === 'product_options') return { ...base, group_id: id('product_option_groups', store), name: `Opção ${store}` };
    return { ...base, group_id: id('product_option_groups', store), size_option_id: id('product_options', store), source_group_id: id('product_option_groups', store), max_select: 2 };
}

async function insert(table, value) {
    const keys = Object.keys(value);
    return db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(value));
}

async function asRole(role, userId, callback) {
    await db.exec('begin');
    try {
        // role é uma constante do teste; dados são sempre parâmetros.
        await db.exec(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
        await db.query("select set_config('request.jwt.claim.email', $1, true)", ['A@example.invalid']);
        return await callback();
    } finally {
        await db.exec('rollback');
    }
}

async function denied(callback) {
    await assert.rejects(callback, error => error.code === '42501');
}

function editableColumn(table) {
    if (table === 'business_hours') return ['is_open', false];
    if (table === 'business_hour_periods') return ['open_time', '09:00'];
    if (table === 'group_size_rules') return ['max_select', 3];
    return ['name', 'Alterado'];
}

test('verificação do isolamento para SQL Editor passa e desfaz todos os dados de teste', async () => {
    const original = (await db.query('select * from public.products order by id')).rows;
    const originalPolicies = (await db.query("select * from pg_policies where schemaname = 'public' order by tablename, policyname")).rows;
    try {
        const results = await db.exec(liveIsolationVerification);
        const result = results.find(item => item.rows?.[0]?.isolation_verification)?.rows[0].isolation_verification;
        assert.ok(result);
        assert.equal(result.all_passed, true);
        assert.equal(result.checks_count, 11);
        assert.equal(Object.keys(result.checks).length, 11);
        assert.ok(Object.values(result.checks).every(passed => passed === true));
    } finally {
        // Desfaz também uma execução que abortou antes do ROLLBACK do arquivo.
        await db.exec('rollback');
    }
    assert.deepEqual((await db.query('select * from public.products order by id')).rows, original);
    assert.deepEqual((await db.query("select * from pg_policies where schemaname = 'public' order by tablename, policyname")).rows, originalPolicies);
});

test('falha de schema após alterar políticas desfaz a migração inteira', async () => {
    await db.exec('begin');
    try {
        await db.exec('alter table public.group_size_rules drop column source_group_id cascade');
        await assert.rejects(() => db.exec(migration), error => error.code === '42703');
    } finally {
        await db.exec('rollback');
    }
    assert.equal((await db.query("select count(*)::int as total from information_schema.columns where table_schema='public' and table_name='group_size_rules' and column_name='source_group_id'")).rows[0].total, 1);
    assert.equal((await db.query("select count(*)::int as total from pg_policies where schemaname='public' and tablename='store_config' and cmd <> 'SELECT'")).rows[0].total, 4);
});


before(async () => {
    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [storeA, storeB, storeC]);
    for (const table of tables) {
        await db.exec(`create table public.${table}(${schemas[table]});
            alter table public.${table} enable row level security;
            grant all on public.${table} to anon, authenticated, service_role;
            create policy legacy_public_read on public.${table} for select to public using (true);
            create policy legacy_open_write on public.${table} for all to public using (true) with check (true);`);
        await insert(table, row(table, 'A'));
        await insert(table, row(table, 'B'));
    }
    // Reproduzir a configuração permissiva antes de testar a correção.
    const beforePatch = await asRole('anon', null, () => db.query('update public.products set name=$1 where id=$2 returning id', ['Aberto antes', id('products', 'B')]));
    assert.equal(beforePatch.rows.length, 1);
    await db.exec(migration);
});

after(async () => db.close());

test('migração é reaplicável e verifica os grants finais', async () => {
    await db.exec(migration);
    const results = await db.exec(verification);
    const result = results.find(item => item.rows?.[0]?.verification)?.rows[0].verification;
    assert.ok(result);
    assert.deepEqual(result.unexpected_anon_write_grants, []);
    assert.deepEqual(result.unexpected_authenticated_table_grants, []);
    assert.equal(result.write_policies.length, tables.length * 4);
});

for (const table of tables) {
    const [column, value] = editableColumn(table);
    test(`${table}: leitura pública e consulta de outra loja continuam disponíveis`, async () => {
        for (const [role, userId] of [['anon', null], ['authenticated', storeA]]) {
            const result = await asRole(role, userId, () => db.query(`select id from public.${table}`));
            assert.equal(result.rows.length, 2);
        }
    });

    test(`${table}: visitante não pode inserir, atualizar, excluir ou truncar`, async () => {
        const fresh = { ...row(table, 'A'), id: '99999999-1111-4111-8111-111111111111' };
        for (const operation of [
            () => insert(table, fresh),
            () => db.query(`update public.${table} set ${column}=$1 where id=$2`, [value, id(table, 'A')]),
            () => db.query(`delete from public.${table} where id=$1`, [id(table, 'A')]),
            () => db.exec(`truncate public.${table} cascade`),
        ]) await denied(() => asRole('anon', null, operation));
    });

    test(`${table}: dono atualiza sua loja e não altera a outra`, async () => {
        const own = await asRole('authenticated', storeA, () => db.query(`update public.${table} set ${column}=$1 where id=$2 returning id`, [value, id(table, 'A')]));
        assert.equal(own.rows.length, 1);
        const foreign = await asRole('authenticated', storeA, () => db.query(`update public.${table} set ${column}=$1 where id=$2 returning id`, [value, id(table, 'B')]));
        assert.equal(foreign.rows.length, 0);
        const foreignDelete = await asRole('authenticated', storeA, () => db.query(`delete from public.${table} where id=$1 returning id`, [id(table, 'B')]));
        assert.equal(foreignDelete.rows.length, 0);
    });

    test(`${table}: dono insere e exclui seu registro, mas não insere na outra loja`, async () => {
        if (table === 'store_config') {
            // Novo usuário autenticado pode cadastrar e remover sua própria configuração.
            await asRole('authenticated', storeC, async () => {
                assert.equal((await insert(table, { id: storeC, name: 'Loja C', admin_email: 'C@example.invalid' })).rows.length, 1);
                assert.equal((await db.query('delete from public.store_config where id=$1 returning id', [storeC])).rows.length, 1);
            });
        } else {
            const own = { ...row(table, 'A'), id: '99999999-1111-4111-8111-111111111111' };
            await asRole('authenticated', storeA, async () => {
                assert.equal((await insert(table, own)).rows.length, 1);
                assert.equal((await db.query(`delete from public.${table} where id=$1 returning id`, [own.id])).rows.length, 1);
            });
        }
        const foreign = { ...row(table, 'B'), id: '88888888-1111-4111-8111-111111111111' };
        await denied(() => asRole('authenticated', storeA, () => insert(table, foreign)));
    });

    test(`${table}: login sem UID não autoriza escrita`, async () => {
        const result = await asRole('authenticated', null, () => db.query(`update public.${table} set ${column}=$1 where id=$2 returning id`, [value, id(table, 'A')]));
        assert.equal(result.rows.length, 0);
    });
}

for (const [table, column, parentTable] of [
    ['products', 'category_id', 'categories'],
    ['business_hour_periods', 'business_hour_id', 'business_hours'],
    ['product_option_groups', 'product_id', 'products'],
    ['product_options', 'group_id', 'product_option_groups'],
    ['group_size_rules', 'group_id', 'product_option_groups'],
    ['group_size_rules', 'size_option_id', 'product_options'],
    ['group_size_rules', 'source_group_id', 'product_option_groups'],
]) {
    test(`${table}.${column}: não pode vincular um registro da outra loja`, async () => {
        await denied(() => asRole('authenticated', storeA, () => db.query(`update public.${table} set ${column}=$1 where id=$2`, [id(parentTable, 'B'), id(table, 'A')])));
    });
}

test('dono não pode mover categorias, produtos, zonas ou horários para outra loja', async () => {
    for (const table of ['categories', 'products', 'delivery_zones', 'business_hours']) {
        const column = table === 'business_hours' ? 'store_config_id' : 'store_id';
        await denied(() => asRole('authenticated', storeA, () => db.query(`update public.${table} set ${column}=$1 where id=$2`, [storeB, id(table, 'A')])));
    }
});

test('service_role continua podendo atualizar a loja pelo servidor', async () => {
    const result = await asRole('service_role', null, () => db.query('update public.store_config set name=$1 where id=$2 returning id', ['Proxy servidor', storeB]));
    assert.equal(result.rows.length, 1);
});

test('barreiras resistem à adição de uma política permissiva ampla', async () => {
    await db.exec(`create policy accidental_open_write on public.products for all to public using (true) with check (true);
        grant insert, update, delete on public.products to anon;`);
    try {
        await denied(() => asRole('anon', null, () => insert('products', { ...row('products', 'B'), id: '88888888-1111-4111-8111-111111111111' })));
        assert.equal((await asRole('anon', null, () => db.query('update public.products set name=$1 returning id', ['Bloqueado']))).rows.length, 0);
        assert.equal((await asRole('authenticated', storeA, () => db.query('update public.products set name=$1 where id=$2 returning id', ['Bloqueado', id('products', 'B')]))).rows.length, 0);
    } finally {
        await db.exec('drop policy accidental_open_write on public.products; revoke insert, update, delete on public.products from anon;');
    }
});

test('loja sem proprietário Auth impede migração e mantém estado anterior', async () => {
    await db.exec('begin');
    try {
        await insert('store_config', { id: '77777777-1111-4111-8111-111111111111', name: 'Sem proprietário' });
        await assert.rejects(() => db.exec(migration), /proprietário Auth/);
    } finally {
        await db.exec('rollback');
    }
    assert.equal((await db.query('select count(*)::int as total from public.store_config')).rows[0].total, 2);
});
