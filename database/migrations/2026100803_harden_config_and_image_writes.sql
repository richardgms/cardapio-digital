-- Compatível com o formulário publicado: valores administrativos iguais são aceitos.
-- Leitura pública de store_config será encerrada em etapa separada, após deploy.
begin;
set local lock_timeout='5s';

do $$
begin
  if to_regclass('public.admin_impersonation_logs') is null
     or to_regclass('storage.objects') is null
     or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner_id' and atttypid='text'::regtype and not attisdropped)
     or not exists(select 1 from pg_class where oid=to_regclass('storage.objects') and relrowsecurity)
     or not exists(select 1 from pg_class where oid=to_regclass('public.store_config') and relrowsecurity)
     or not exists(select 1 from storage.buckets where id='images' and public)
     or exists(select 1 from storage.buckets where id<>'images') then
    raise exception 'Schema/buckets diferentes do preflight; nada aplicado';
  end if;
end $$;

create or replace function public.rmenu_guard_config_admin_fields()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if current_user in ('anon','authenticated') then
    if auth.uid() is null or new.id is distinct from auth.uid() then
      raise exception 'Configuração fora do usuário autenticado' using errcode='42501';
    end if;
    if tg_op='INSERT' then
      -- Upsert do formulário antigo passa primeiro pelo INSERT. Se já existe,
      -- os campos administrativos serão conferidos no trigger de UPDATE.
      if exists(select 1 from public.store_config c where c.id=new.id) then return new; end if;
      if coalesce(new.table_mode_available,false) then
        raise exception 'Recurso administrativo não pode ser concedido pelo cliente' using errcode='42501';
      end if;
      new.admin_email := coalesce(auth.jwt()->>'email','');
      new.created_at := now();
    elsif new.id is distinct from old.id
       or new.admin_email is distinct from old.admin_email
       or new.created_at is distinct from old.created_at
       or new.table_mode_available is distinct from old.table_mode_available then
      raise exception 'Campo administrativo protegido' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.rmenu_guard_config_admin_fields() from public,anon,authenticated;
grant execute on function public.rmenu_guard_config_admin_fields() to service_role;
drop trigger if exists rmenu_config_admin_fields on public.store_config;
create trigger rmenu_config_admin_fields before insert or update on public.store_config
for each row execute function public.rmenu_guard_config_admin_fields();

-- Nenhum consumidor do navegador acessa logs diretamente; proxies usam servidor.
revoke all on public.admin_impersonation_logs from public,anon,authenticated;
do $$ declare a record;
begin
  for a in select attname from pg_attribute where attrelid='public.admin_impersonation_logs'::regclass and attnum>0 and not attisdropped loop
    execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.admin_impersonation_logs from public,anon,authenticated',a.attname,a.attname,a.attname,a.attname);
  end loop;
end $$;
alter table public.admin_impersonation_logs enable row level security;
drop policy if exists rmenu_logs_client_guard on public.admin_impersonation_logs;
create policy rmenu_logs_client_guard on public.admin_impersonation_logs as restrictive
for all to anon,authenticated using(false) with check(false);

-- owner_id vem do JWT no serviço de Storage; não reutiliza e-mail da primeira loja.
-- Preserva leitura/URLs do bucket público e todos os objetos existentes.
do $$ declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('ALL','INSERT','UPDATE','DELETE') loop
    execute format('drop policy %I on storage.objects',p.policyname);
  end loop;
end $$;
create policy rmenu_images_insert on storage.objects for insert to authenticated
with check(bucket_id='images' and owner_id=(select auth.uid()::text));
create policy rmenu_images_update on storage.objects for update to authenticated
using(bucket_id='images' and owner_id=(select auth.uid()::text))
with check(bucket_id='images' and owner_id=(select auth.uid()::text));
create policy rmenu_images_delete on storage.objects for delete to authenticated
using(bucket_id='images' and owner_id=(select auth.uid()::text));
create policy rmenu_images_insert_guard on storage.objects as restrictive for insert to public
with check(bucket_id='images' and owner_id=(select auth.uid()::text));
create policy rmenu_images_update_guard on storage.objects as restrictive for update to public
using(bucket_id='images' and owner_id=(select auth.uid()::text))
with check(bucket_id='images' and owner_id=(select auth.uid()::text));
create policy rmenu_images_delete_guard on storage.objects as restrictive for delete to public
using(bucket_id='images' and owner_id=(select auth.uid()::text));

do $$ declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.admin_impersonation_logs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(r,'public.admin_impersonation_logs','SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Grant herdado inesperado nos logs; nada aplicado';
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
