-- Somente leitura. Executar depois de 2026100703 e trazer persistence_verification.
-- Confere instalação/permissões; não cria pedido, uso de cupom nem impressão.
with rpc as (
    select p.oid,p.prosecdef,p.proconfig from pg_proc p
    where p.oid=to_regprocedure('public.rmenu_create_order_atomic(jsonb,text)')
), required_constraints(table_name,constraint_name) as (
    values ('coupon_usages','rmenu_coupon_usage_one_per_order'),
           ('coupons','rmenu_coupon_count_nonnegative'),
           ('coupons','rmenu_coupon_limit_nonnegative'),
           ('orders','rmenu_order_request_hash_format'),
           ('orders','rmenu_order_expected_items_positive')
), installed_constraints as (
    select r.table_name,r.constraint_name,c.convalidated,pg_get_constraintdef(c.oid,true) as definition
    from required_constraints r
    join pg_constraint c on c.conname=r.constraint_name and c.conrelid=to_regclass('public.'||r.table_name)
)
select jsonb_build_object(
    'order_columns', coalesce((
        select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable) order by column_name)
        from information_schema.columns where table_schema='public' and table_name='orders'
        and column_name in ('address_complement','request_hash','expected_item_count')
    ),'[]'::jsonb),
    'rpc_exists', exists(select 1 from rpc),
    'rpc_security_definer', (select prosecdef from rpc),
    'rpc_configuration', (select to_jsonb(proconfig) from rpc),
    'anon_rpc_execute', (select has_function_privilege('anon',oid,'EXECUTE') from rpc),
    'authenticated_rpc_execute', (select has_function_privilege('authenticated',oid,'EXECUTE') from rpc),
    'service_role_rpc_execute', (select has_function_privilege('service_role',oid,'EXECUTE') from rpc),
    'installed_constraints', coalesce((select jsonb_agg(to_jsonb(c) order by table_name,constraint_name) from installed_constraints c),'[]'::jsonb),
    'missing_constraints', coalesce((
        select jsonb_agg(r.constraint_name order by r.constraint_name) from required_constraints r
        where not exists(select 1 from installed_constraints c where c.constraint_name=r.constraint_name and c.table_name=r.table_name)
    ),'[]'::jsonb),
    'coupon_counter_not_nullable', exists(
        select 1 from information_schema.columns where table_schema='public' and table_name='coupons' and column_name='usage_count' and is_nullable='NO'
    ),
    'same_store_trigger_enabled', exists(
        select 1 from pg_trigger where tgrelid='public.coupon_usages'::regclass and tgname='rmenu_coupon_usage_same_store' and tgenabled='O'
    ),
    'original_numbering_trigger_enabled', exists(
        select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
        where t.tgrelid='public.orders'::regclass and t.tgname='trg_orders_set_number' and t.tgenabled='O' and p.proname='set_order_number'
    )
) as persistence_verification;
