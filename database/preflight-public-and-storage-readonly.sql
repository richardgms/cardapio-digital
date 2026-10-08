-- Revisão antes da ativação: somente metadados e contagens.
-- Não altera dados/schema/permissões, não chama RPCs e não ativa impressão.
-- Não retorna clientes, arquivos, tokens, hashes ou valores de store_config.
-- Literais das políticas são ocultados; preserve o resultado completo.
begin transaction read only;

select jsonb_build_object(
  'schema_version', 1,
  'relations', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select n.nspname as schema_name, c.relname as relation_name,
             c.relkind, c.relrowsecurity as rls, c.reloptions,
             pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where (n.nspname='public' and
             (c.relname='store_config' or c.relname ~ '(admin|role)' or c.relkind in ('v','m')))
         or (n.nspname='storage' and c.relname in ('objects','buckets'))
      order by n.nspname, c.relname
    ) t
  ),
  'effective_column_permissions', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select c.relname as relation_name, a.attname as column_name,
             format_type(a.atttypid,a.atttypmod) as data_type,
             r.role_name,
             has_column_privilege(r.role_name,c.oid,a.attnum,'SELECT') as can_select,
             has_column_privilege(r.role_name,c.oid,a.attnum,'INSERT') as can_insert,
             has_column_privilege(r.role_name,c.oid,a.attnum,'UPDATE') as can_update
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      cross join (values ('anon'),('authenticated')) r(role_name)
      where n.nspname='public' and c.relkind in ('r','p','v','m')
        and (c.relname='store_config' or c.relname='print_devices' or c.relname ~ '(admin|role)')
      order by c.relname,a.attnum,r.role_name
    ) t
  ),
  'policies', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select schemaname,tablename,policyname,permissive,roles,cmd,
             regexp_replace(coalesce(qual,''), $$'([^']|'')*'$$, $$'<literal>'$$, 'g') as using_redacted,
             regexp_replace(coalesce(with_check,''), $$'([^']|'')*'$$, $$'<literal>'$$, 'g') as check_redacted
      from pg_policies
      where (schemaname='public' and (tablename='store_config' or tablename ~ '(admin|role)'))
         or (schemaname='storage' and tablename in ('objects','buckets'))
      order by schemaname,tablename,policyname
    ) t
  ),
  'storage_effective_permissions', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select c.relname as relation_name,r.role_name,
             has_table_privilege(r.role_name,c.oid,'SELECT') as can_select,
             has_table_privilege(r.role_name,c.oid,'INSERT') as can_insert,
             has_table_privilege(r.role_name,c.oid,'UPDATE') as can_update,
             has_table_privilege(r.role_name,c.oid,'DELETE') as can_delete
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join (values ('anon'),('authenticated')) r(role_name)
      where n.nspname='storage' and c.relname in ('objects','buckets')
      order by c.relname,r.role_name
    ) t
  ),
  'buckets', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (select id,public from storage.buckets order by id) t
  ),
  'public_function_permissions', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select p.proname as function_name,pg_get_function_identity_arguments(p.oid) as arguments,
             p.prosecdef as security_definer,p.proconfig,
             has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
             has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
      order by p.proname,arguments
    ) t
  ),
  'printing_state', jsonb_build_object(
    'enabled_stores', (select count(*) from public.print_settings where enabled),
    'active_devices', (select count(*) from public.print_devices where revoked_at is null),
    'jobs', (select count(*) from public.print_jobs)
  )
) as public_storage_preflight;

commit;
