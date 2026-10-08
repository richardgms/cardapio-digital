-- Verificação de 2026100803, sem mudar dados nem retornar arquivos/segredos.
begin transaction read only;
with checks as (
 select
  exists(select 1 from pg_trigger where tgrelid='public.store_config'::regclass and tgname='rmenu_config_admin_fields' and tgenabled='O' and tgfoid=to_regprocedure('public.rmenu_guard_config_admin_fields()')) as config_guard,
  exists(select 1 from pg_proc where oid=to_regprocedure('public.rmenu_guard_config_admin_fields()') and not prosecdef and proconfig @> array['search_path=""'] and not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE')) as private_invoker,
  not exists(select 1 from (values('anon'),('authenticated')) r(name) where has_table_privilege(r.name,'public.admin_impersonation_logs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r.name,'public.admin_impersonation_logs','SELECT,INSERT,UPDATE,REFERENCES')) as no_client_log_grants,
  exists(select 1 from pg_policies where schemaname='public' and tablename='admin_impersonation_logs' and policyname='rmenu_logs_client_guard' and permissive='RESTRICTIVE' and cmd='ALL' and qual='false' and with_check='false') as log_barrier,
  (select count(*)=6 from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('rmenu_images_insert','rmenu_images_update','rmenu_images_delete','rmenu_images_insert_guard','rmenu_images_update_guard','rmenu_images_delete_guard')) as storage_policies,
  (select count(*)=3 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'rmenu_images_%_guard' and permissive='RESTRICTIVE') as storage_barriers,
  not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('ALL','INSERT','UPDATE','DELETE') and policyname not in ('rmenu_images_insert','rmenu_images_update','rmenu_images_delete','rmenu_images_insert_guard','rmenu_images_update_guard','rmenu_images_delete_guard')) as no_legacy_storage_writes,
  (select public from storage.buckets where id='images') as public_images_preserved,
  has_table_privilege('anon','public.store_config','SELECT') as legacy_public_read_preserved,
  not exists(select 1 from public.print_settings where enabled) as printing_disabled
)
select jsonb_build_object('checks',to_jsonb(checks),
 'all_passed',config_guard and private_invoker and no_client_log_grants and log_barrier and storage_policies and storage_barriers and no_legacy_storage_writes and public_images_preserved and legacy_public_read_preserved and printing_disabled,
 'automatic_printing_activated',false,
 'public_read_contract_pending',true) as config_image_verification from checks;
commit;
