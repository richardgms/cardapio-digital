-- Execute no SQL Editor do Supabase e copie o campo inventory do resultado.
-- Somente leitura: não altera schema, dados, permissões nem dispara RPCs.
-- Não retorna nomes, telefones, endereços ou corpos de funções.
-- Retorna um único JSON; arrays vazios significam ausência de resultados.
begin transaction read only;

select jsonb_build_object(
    'schema_version', 1,
    'rls', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select n.nspname as schema_name, c.relname as table_name,
                   c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
            order by c.relname
        ) r
    ),
    'policies', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
            from pg_policies where schemaname = 'public'
            order by tablename, policyname
        ) r
    ),
    'grants', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select table_schema, table_name, grantee, privilege_type
            from information_schema.role_table_grants
            where table_schema = 'public'
              and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
            order by table_name, grantee, privilege_type
        ) r
    ),
    'columns', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select table_name, column_name, data_type, udt_name, is_nullable, column_default
            from information_schema.columns
            where table_schema = 'public'
              and table_name in ('orders', 'order_items', 'store_config', 'products',
                                 'categories', 'coupons', 'coupon_usages', 'delivery_zones')
            order by table_name, ordinal_position
        ) r
    ),
    'constraints', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select c.relname as table_name, con.conname, con.contype,
                   con.convalidated, con.condeferrable, con.condeferred,
                   pg_get_constraintdef(con.oid) as definition
            from pg_constraint con
            join pg_class c on c.oid = con.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
            order by c.relname, con.conname
        ) r
    ),
    'indexes', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select tablename, indexname, indexdef
            from pg_indexes where schemaname = 'public'
            order by tablename, indexname
        ) r
    ),
    'triggers', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select c.relname as table_name, t.tgname, t.tgenabled,
                   pg_get_triggerdef(t.oid) as trigger_definition,
                   pn.nspname as function_schema, p.proname as function_name
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_proc p on p.oid = t.tgfoid
            join pg_namespace pn on pn.oid = p.pronamespace
            where n.nspname = 'public' and not t.tgisinternal
            order by c.relname, t.tgname
        ) r
    ),
    'functions', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
                   p.prosecdef as security_definer, p.proconfig,
                   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
                   has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
            order by p.proname, arguments
        ) r
    ),
    'realtime', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select pubname, schemaname, tablename
            from pg_publication_tables where schemaname = 'public'
            order by pubname, tablename
        ) r
    ),
    'replica_identity', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select relname as table_name, relreplident as replica_identity
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('orders', 'order_items')
        ) r
    ),
    'orders_without_items', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select o.id, o.store_id, o.order_number, o.status, o.created_at
            from public.orders o
            where not exists (select 1 from public.order_items i where i.order_id = o.id)
            order by o.created_at
        ) r
    ),
    'duplicate_order_numbers', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select store_id, order_number, count(*) as occurrences
            from public.orders group by store_id, order_number having count(*) > 1
        ) r
    ),
    'duplicate_attempts', (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select store_id, count(*) as occurrences
            from public.orders where idempotency_key is not null
            group by store_id, idempotency_key having count(*) > 1
        ) r
    ),
    'items_with_product_from_other_store', (
        select count(*) from public.order_items i
        join public.orders o on o.id = i.order_id
        join public.products p on p.id = i.product_id
        where p.store_id <> o.store_id
    ),
    'orders_with_zone_from_other_store', (
        select count(*) from public.orders o
        join public.delivery_zones z on z.id = o.delivery_zone_id
        where z.store_id <> o.store_id
    ),
    'migrations_table', to_regclass('supabase_migrations.schema_migrations')::text
) as inventory;

rollback;
