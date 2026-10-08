-- Antes de 2026100803. Somente leitura; não retorna arquivos/configurações/segredos.
begin transaction read only;
with checks as (
 select
  exists(select 1 from pg_attribute where attrelid=to_regclass('storage.objects') and attname='owner_id' and atttypid='text'::regtype and not attisdropped) as storage_owner_id_text,
  exists(select 1 from pg_class where oid=to_regclass('storage.objects') and relrowsecurity) as storage_rls,
  exists(select 1 from pg_class where oid=to_regclass('public.store_config') and relrowsecurity) as config_rls,
  exists(select 1 from pg_class where oid=to_regclass('public.admin_impersonation_logs')) as logs_present,
  (select count(*)=1 and bool_and(id='images' and public) from storage.buckets) as expected_bucket,
  to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null as auth_helpers,
  not exists(select 1 from public.print_settings where enabled) as printing_disabled
)
select jsonb_build_object('checks',to_jsonb(checks),
 'ready',storage_owner_id_text and storage_rls and config_rls and logs_present and expected_bucket and auth_helpers and printing_disabled,
 'activation_performed',false) as config_image_preflight from checks;
commit;
