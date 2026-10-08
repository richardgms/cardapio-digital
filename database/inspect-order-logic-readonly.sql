-- Executar no SQL Editor e trazer o campo order_logic.
-- Somente leitura de metadados/código: não executa as funções ou triggers,
-- não altera permissões e não lê dados de clientes ou pedidos.
-- O inventário anterior não continha os corpos das funções.

with target_triggers as (
    select t.oid, t.tgname, t.tgenabled, t.tgfoid,
           n.nspname as table_schema, c.relname as table_name,
           pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public'
      and c.relname in ('orders', 'order_items', 'coupons', 'coupon_usages')
), function_definitions as (
    select p.oid, n.nspname as function_schema, p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments,
           pg_get_userbyid(p.proowner) as owner,
           p.prosecdef as security_definer, p.proconfig as configuration,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f' and (
        p.oid in (select tgfoid from target_triggers)
        or (n.nspname = 'public' and p.proname in (
            'set_order_number', 'set_updated_at', 'increment_coupon_usage', 'update_coupons_updated_at'
        ))
    )
)
select jsonb_build_object(
    'function_count', (select count(*) from function_definitions),
    'trigger_count', (select count(*) from target_triggers),
    'functions', coalesce((
        select jsonb_agg(to_jsonb(f) - 'oid' order by function_schema, function_name, arguments)
        from function_definitions f
    ), '[]'::jsonb),
    'triggers', coalesce((
        select jsonb_agg(to_jsonb(t) - 'oid' - 'tgfoid' order by table_schema, table_name, tgname)
        from target_triggers t
    ), '[]'::jsonb)
) as order_logic;
