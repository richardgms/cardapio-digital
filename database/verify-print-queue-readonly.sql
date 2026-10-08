-- Verificação da instalação desligada. Somente contagens/metadados, sem PII/tokens.
with tables as (
    select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('print_settings','print_devices','print_jobs','print_events')
), functions as (
    select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'rmenu_print_%'
), checks as (
    select 'tables_and_rls' as name,count(*)=4 and bool_and(relrowsecurity) as passed from tables
    union all select 'rpc_permissions',count(*)=14 and bool_and(not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE') and has_function_privilege('service_role',oid,'EXECUTE')) from functions
    union all select 'rpc_search_path_and_definer',count(*)=14 and bool_and(proconfig @> array['search_path=""'] and prosecdef=(proname='rmenu_print_cancel_order')) from functions
    union all select 'private_credentials',not has_column_privilege('authenticated','public.print_devices','credential_hash','SELECT') and not has_column_privilege('authenticated','public.print_jobs','lease_token','SELECT')
    union all select 'no_client_writes',not exists(select 1 from tables t join pg_attribute a on a.attrelid=t.oid
        cross join (values('anon'),('authenticated')) roles(role) where a.attnum>0 and not a.attisdropped
        and (has_column_privilege(roles.role,t.oid,a.attnum,'INSERT') or has_column_privilege(roles.role,t.oid,a.attnum,'UPDATE') or has_table_privilege(roles.role,t.oid,'DELETE') or has_table_privilege(roles.role,t.oid,'TRUNCATE') or has_table_privilege(roles.role,t.oid,'TRIGGER')))
    union all select 'initial_unique',exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.rmenu_print_initial_unique') and i.indisunique and i.indisvalid
        and pg_get_indexdef(i.indexrelid) like '%(store_id, order_id, purpose)%' and pg_get_expr(i.indpred,i.indrelid) like '%initial%')
    union all select 'queue_triggers',count(*)=8 and bool_and(tgenabled='O') from pg_trigger where not tgisinternal and
        ((tgrelid in (select oid from tables) and tgname in ('rmenu_print_guard','rmenu_print_insert_guard','rmenu_print_job_event'))
        or (tgrelid='public.orders'::regclass and tgname='rmenu_print_cancel_order') or (tgrelid='public.order_documents'::regclass and tgname='rmenu_print_enqueue_document'))
    union all select 'owner_read_and_write_barriers',count(*)=16 from pg_policy where polrelid in (select oid from tables) and polname in ('rmenu_print_owner_read','rmenu_print_owner_scope','rmenu_print_no_write','rmenu_print_no_anon')
    union all select 'installation_disabled',not exists(select 1 from public.print_settings where enabled)
    union all select 'documents_match_jobs',not exists(select 1 from public.print_jobs j join public.order_documents d on d.order_id=j.order_id where d.store_id<>j.store_id or d.document_version<>j.document_version)
    union all select 'no_duplicated_initial',not exists(select 1 from public.print_jobs where purpose='initial' group by store_id,order_id,purpose having count(*)>1)
)
select jsonb_build_object('all_passed',bool_and(coalesce(passed,false)),'checks',jsonb_object_agg(name,coalesce(passed,false)),
    'enabled_stores',(select count(*) from public.print_settings where enabled),
    'jobs',(select count(*) from public.print_jobs),
    'devices',(select count(*) from public.print_devices),
    'automatic_printing_activated',exists(select 1 from public.print_settings where enabled)) as print_queue_verification from checks;
