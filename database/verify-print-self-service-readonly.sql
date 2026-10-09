-- Somente leitura. Não confirma testes, não ativa lojas e não enfileira pedidos.
with functions as (
 select oid,proconfig,prosecdef,proname from pg_proc
 where pronamespace='public'::regnamespace and proname in (
 'rmenu_print_auth_device','rmenu_print_device_calibrated','rmenu_print_self_service_status',
 'rmenu_print_calibration_start','rmenu_print_calibration_dispatch','rmenu_print_calibration_finish',
 'rmenu_print_calibration_confirm','rmenu_print_self_service_enable','rmenu_print_claim','rmenu_print_begin_dispatch')
),checks as (
 select 'private_table_and_rls' as name,coalesce((select relrowsecurity and relforcerowsecurity
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')
 and has_table_privilege('service_role',oid,'SELECT') and has_table_privilege('service_role',oid,'INSERT')
 and has_table_privilege('service_role',oid,'UPDATE') and has_table_privilege('service_role',oid,'DELETE')
 from pg_class where oid=to_regclass('public.print_device_checks')),false) as passed
 union all select 'private_rpcs',count(*)=10 and bool_and(not has_function_privilege('anon',oid,'EXECUTE')
 and not has_function_privilege('authenticated',oid,'EXECUTE') and has_function_privilege('service_role',oid,'EXECUTE')) from functions
 union all select 'invoker_and_search_path',count(*)=10 and bool_and(not prosecdef and proconfig@>array['search_path=""']) from functions
 union all select 'managed_default',exists(select 1 from information_schema.columns where table_schema='public'
 and table_name='print_settings' and column_name='activation_mode' and column_default like '%managed%' and is_nullable='NO')
 union all select 'claim_and_dispatch_barriers',count(*)=2 and bool_and(pg_get_functiondef(oid) like '%rmenu_print_device_calibrated%')
 from functions where proname in ('rmenu_print_claim','rmenu_print_begin_dispatch')
 union all select 'owner_and_connection_barrier',count(*)=1 and bool_and(pg_get_functiondef(oid) like '%p_actor<>p_store%'
 and pg_get_functiondef(oid) like '%rmenu_print_self_service_status%') from functions where proname='rmenu_print_self_service_enable'
)
select jsonb_build_object('all_passed',bool_and(passed),'checks',jsonb_object_agg(name,passed),
'activation_performed_by_this_query',false,'physical_paper_confirmed_by_this_query',false) as print_self_service_verification from checks;
