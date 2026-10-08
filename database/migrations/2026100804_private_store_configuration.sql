-- SOMENTE após publicar os consumidores com getPublicStoreBySubdomain.
-- select('*') público da versão antiga deixa de funcionar após esta migração.
begin;
set local lock_timeout='5s';
do $$
begin
  if current_setting('rmenu.public_read_contract_ready',true) is distinct from 'published-consumers-2026100804' then
    raise exception 'Etapa bloqueada: publique e valide os consumidores antes de fechar a leitura pública';
  end if;
end $$;
revoke select on public.store_config from public,anon;
do $$ declare a record; p record;
begin
  for a in select attname from pg_attribute where attrelid='public.store_config'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke select(%I) on public.store_config from public,anon',a.attname);
  end loop;
  for p in select policyname from pg_policies where schemaname='public' and tablename='store_config' and cmd='SELECT' loop
    execute format('drop policy %I on public.store_config',p.policyname);
  end loop;
end $$;
create policy rmenu_config_owner_read on public.store_config for select to authenticated
using(id=(select auth.uid()));
create policy rmenu_config_read_guard on public.store_config as restrictive for select to public
using(id=(select auth.uid()));
do $$
begin
  if has_table_privilege('anon','public.store_config','SELECT')
     or has_any_column_privilege('anon','public.store_config','SELECT') then
    raise exception 'Leitura anônima herdada inesperada; nada aplicado';
  end if;
end $$;
notify pgrst,'reload schema';
commit;
