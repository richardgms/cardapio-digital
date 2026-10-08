-- Após o deploy e aplicação explícita de 2026100804. Somente leitura.
begin transaction read only;
with checks as (
 select
  not has_table_privilege('anon','public.store_config','SELECT') and not has_any_column_privilege('anon','public.store_config','SELECT') as no_anonymous_config_read,
  exists(select 1 from pg_policies where schemaname='public' and tablename='store_config' and policyname='rmenu_config_read_guard' and permissive='RESTRICTIVE' and cmd='SELECT' and qual like '%auth.uid()%') as owner_read_barrier,
  exists(select 1 from pg_policies where schemaname='public' and tablename='store_config' and policyname='rmenu_config_owner_read' and roles=array['authenticated']::name[] and qual like '%auth.uid()%') as owner_read_allowed,
  has_table_privilege('service_role','public.store_config','SELECT') as server_read_allowed,
  not exists(select 1 from public.print_settings where enabled) as printing_disabled
)
select jsonb_build_object('checks',to_jsonb(checks),
 'all_passed',no_anonymous_config_read and owner_read_barrier and owner_read_allowed and server_read_allowed and printing_disabled,
 'automatic_printing_activated',false) as private_config_verification from checks;
commit;
