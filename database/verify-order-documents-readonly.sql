-- Executar após 2026100801. Só metadados/contagens, sem snapshots/clientes.
with required_functions(name) as (
    values ('set_order_number()'),('rmenu_guard_order_counter()'),('rmenu_guard_order_document()'),
        ('rmenu_capture_order_document(uuid)'),('rmenu_seal_order_at_commit()'),
        ('rmenu_guard_order_snapshot()'),('rmenu_guard_order_item_snapshot()')
), functions as (
    select r.name,p.oid is not null as exists,p.prosecdef as security_definer,p.proconfig as configuration,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
    from required_functions r left join pg_proc p on p.oid=to_regprocedure('public.'||r.name)
), required_triggers(tbl,name,deferred) as (
    values ('orders','trg_orders_set_number',false),('orders','rmenu_order_seal_at_commit',true),
        ('orders','rmenu_order_snapshot_guard',false),('order_items','rmenu_order_item_snapshot_guard',false),
        ('order_number_counters','rmenu_order_counter_guard',false),('order_documents','rmenu_order_document_guard',false)
), triggers as (
    select r.tbl,r.name,coalesce(t.tgenabled='O' and t.tgdeferrable=r.deferred and t.tginitdeferred=r.deferred,false) as valid
    from required_triggers r left join pg_trigger t on t.tgrelid=to_regclass('public.'||r.tbl) and t.tgname=r.name
), unexpected_client_writes as (
    select role_name,c.relname,a.attname,privilege
    from (values('anon'),('authenticated')) roles(role_name)
    cross join (values('INSERT'),('UPDATE')) rights(privilege)
    join pg_class c on c.oid in ('public.orders'::regclass,'public.order_items'::regclass)
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where has_column_privilege(role_name,c.oid,a.attnum,privilege)
        and not(role_name='authenticated' and c.relname='orders' and a.attname='status' and privilege='UPDATE')
), data_checks as (
    select
        (select count(*) from public.orders o where request_hash is not null and not exists(select 1 from public.order_documents d where d.order_id=o.id)) as atomic_missing_documents,
        (select count(*) from public.order_documents d join public.orders o on o.id=d.order_id where o.request_hash is null) as legacy_documents,
        (select count(*) from public.order_documents d join public.orders o on o.id=d.order_id where d.store_id<>o.store_id or d.document_version<>o.document_version
            or d.snapshot->'order'->>'id' is distinct from o.id::text
            or d.snapshot->'order'->>'store_id' is distinct from o.store_id::text
            or jsonb_array_length(d.snapshot->'items') is distinct from o.expected_item_count) as mismatched_documents,
        (select count(*) from public.store_config s left join public.order_number_counters c on c.store_id=s.id
            where coalesce(c.last_number,0)<coalesce((select max(order_number) from public.orders where store_id=s.id),0)) as missing_or_regressed_counters
), checks as (
    select jsonb_build_object(
        'functions_valid',not exists(select 1 from functions where not exists or security_definer is distinct from false or not coalesce('search_path=""'=any(configuration),false) or anon_execute is distinct from false or authenticated_execute is distinct from false or service_role_execute is distinct from true),
        'triggers_valid',not exists(select 1 from triggers where not valid),
        'restrictive_guards_installed',(select count(*)=9 from pg_policies where schemaname='public' and permissive='RESTRICTIVE' and
            (tablename,policyname) in (
                ('orders','rmenu_orders_owner_read_guard'),('orders','rmenu_orders_owner_update_guard'),('orders','rmenu_orders_no_client_insert'),('orders','rmenu_orders_no_client_delete'),
                ('order_items','rmenu_items_owner_read_guard'),('order_items','rmenu_items_no_client_insert'),('order_items','rmenu_items_no_client_update'),('order_items','rmenu_items_no_client_delete'),
                ('order_documents','rmenu_documents_owner_read_guard'))),
        'version_column_valid',exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='document_version' and is_nullable='NO' and data_type='integer'),
        'document_and_counter_rls',not exists(select 1 from pg_class where oid in ('public.order_documents'::regclass,'public.order_number_counters'::regclass) and not relrowsecurity),
        'no_unexpected_client_writes',not exists(select 1 from unexpected_client_writes),
        'owner_can_update_status',has_column_privilege('authenticated','public.orders','status','UPDATE'),
        'client_cannot_delete_orders',not has_table_privilege('anon','public.orders','DELETE') and not has_table_privilege('authenticated','public.orders','DELETE'),
        'counter_private',not has_any_column_privilege('anon','public.order_number_counters','SELECT,INSERT,UPDATE,REFERENCES') and not has_any_column_privilege('authenticated','public.order_number_counters','SELECT,INSERT,UPDATE,REFERENCES'),
        'document_private',not has_any_column_privilege('anon','public.order_documents','SELECT,INSERT,UPDATE,REFERENCES') and not has_any_column_privilege('authenticated','public.order_documents','INSERT,UPDATE,REFERENCES') and not has_table_privilege('authenticated','public.order_documents','DELETE'),
        'atomic_documents_complete',(select atomic_missing_documents=0 and legacy_documents=0 and mismatched_documents=0 from data_checks),
        'counters_valid',(select missing_or_regressed_counters=0 from data_checks)
    ) as result
)
select jsonb_build_object(
    'all_passed',(select bool_and(value::text='true') from checks,jsonb_each(checks.result)),
    'checks',(select result from checks),
    'functions',(select jsonb_agg(to_jsonb(f) order by name) from functions f),
    'triggers',(select jsonb_agg(to_jsonb(t) order by tbl,name) from triggers t),
    'unexpected_client_writes',coalesce((select jsonb_agg(to_jsonb(w)) from unexpected_client_writes w),'[]'::jsonb),
    'data_checks',(select to_jsonb(d) from data_checks d),
    'automatic_printing_activated',false
) as document_verification;
