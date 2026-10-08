import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const readSql = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^\uFEFF/, '');
export async function createOrderDatabase(database = null) {
    const read = readSql;
    const migration = read('../database/migrations/2026100801_order_documents_and_numbers.sql');
    const reference = JSON.parse(read('../database/reference/order-logic-20261007.json'));
    let db = database;
    if (!db) {
        const runtimeRequire = createRequire(new URL('../docs/sql-test-runtime/package.json', import.meta.url));
        const { PGlite } = await import(pathToFileURL(runtimeRequire.resolve('@electric-sql/pglite')).href);
        db = new PGlite();
    }
    const storeA = randomUUID(), storeB = randomUUID(), productA = randomUUID(), zoneA = randomUUID();
    let legacy, existing;
    const row = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
    const payload = (overrides={}) => ({store_id:storeA,idempotency_key:randomUUID(),customer_name:'Cliente fictício',customer_phone:'11999999999',
        delivery_type:'pickup',payment_method:'pix',total:14,items:[{product_id:productA,product_name:'Pão de açafrão',quantity:1,unit_price:14,item_total:14,
        selected_options:[{group:'Molho',option:'Limão',price:0}],observations:'Sem cebola',is_half_half:false}],...overrides});
    const call = async (value=payload()) => (await row('select public.rmenu_create_order_atomic($1::jsonb,$2) as result',
        [JSON.stringify(value),createHash('sha256').update(JSON.stringify(value)).digest('hex')])).result;

    await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        grant usage on schema auth to anon,authenticated,service_role;
        create table public.store_config(id uuid primary key,name text,minimum_order numeric default 0,
            accept_pix boolean default true,accept_card boolean default true,accept_cash boolean default true,
            table_mode_available boolean default false,table_mode_enabled boolean default false,table_count integer default 10);
        create table public.products(id uuid primary key,store_id uuid references public.store_config(id),is_available boolean default true,allows_half_half boolean default false);
        create table public.delivery_zones(id uuid primary key,store_id uuid references public.store_config(id),name text,price numeric not null,is_active boolean default true);
        create table public.orders(id uuid primary key default gen_random_uuid(),store_id uuid not null references public.store_config(id) on delete cascade,
            order_number integer not null default 0,customer_name text not null,customer_phone text not null,delivery_type text not null,table_number integer,
            delivery_zone_id uuid references public.delivery_zones(id) on delete set null,delivery_zone_name text,delivery_address text,
            payment_method text not null,change_for numeric,subtotal numeric not null,delivery_fee numeric not null default 0,discount_value numeric default 0,
            coupon_code text,total numeric not null,status text not null default 'pending',handoff_status text default 'unknown',idempotency_key text,notes text,
            created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(store_id,order_number));
        create unique index orders_store_id_idempotency_unique on public.orders(store_id,idempotency_key) where idempotency_key is not null;
        create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
            product_id uuid references public.products(id) on delete set null,product_name text not null,quantity integer not null check(quantity>0),
            unit_price numeric not null,selected_options jsonb not null default '[]',observations text,is_half_half boolean not null default false,
            half_half_items jsonb,item_total numeric not null,created_at timestamptz not null default now());
        create table public.coupons(id uuid primary key default gen_random_uuid(),store_id uuid not null references public.store_config(id),code text not null,
            discount_type text not null,discount_value numeric not null,min_order_value numeric default 0,max_discount_value numeric,valid_from timestamptz not null default now(),
            valid_until timestamptz,usage_limit integer,usage_count integer default 0,is_active boolean default true,applies_to text default 'all',updated_at timestamptz default now(),unique(store_id,code));
        create table public.coupon_usages(id uuid primary key default gen_random_uuid(),coupon_id uuid not null references public.coupons(id) on delete cascade,
            order_id uuid not null references public.orders(id) on delete cascade,customer_phone text not null,discount_applied numeric not null);
    `);
    for (const table of ['store_config','products','delivery_zones','orders','order_items','coupons','coupon_usages']) {
        await db.exec(`alter table public.${table} enable row level security; grant all on public.${table} to service_role; grant select on public.${table} to anon,authenticated;`);
    }
    await db.exec(`grant insert,update,delete on public.orders,public.order_items to authenticated;
        grant update(customer_name) on public.orders to public;
        create policy owner_access on public.orders for all to authenticated using(store_id=auth.uid()) with check(store_id=auth.uid());
        create policy owner_access on public.order_items for all to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.store_id=auth.uid()));`);
    for (const fn of reference.functions) await db.exec(fn.definition);
    for (const trigger of reference.triggers) await db.exec(`${trigger.definition};`);
    await db.query('insert into public.store_config(id,name) values($1,$2),($3,$4)', [storeA,'Loja fictícia A',storeB,'Loja fictícia B']);
    await db.query('insert into public.products(id,store_id) values($1,$2)', [productA,storeA]);
    await db.query("insert into public.delivery_zones(id,store_id,name,price) values($1,$2,'São João',5)", [zoneA,storeA]);
    await db.exec(read('../database/migrations/2026100703_atomic_order_persistence.sql'));
    // Pré-requisito verificado por assinatura; esta suíte testa persistência, sem repetir catálogo.
    await db.exec('create function public.rmenu_submit_order(jsonb,text,jsonb) returns jsonb language sql as $$select null::jsonb$$;');
    legacy = await row("insert into public.orders(store_id,customer_name,customer_phone,delivery_type,payment_method,subtotal,total) values($1,'Legado','11999999999','pickup','pix',0,0) returning *", [storeA]);
    existing = await call();
    await db.exec(migration);

    return {db,storeA,storeB,productA,zoneA,legacy,existing,row,payload,call};
}

