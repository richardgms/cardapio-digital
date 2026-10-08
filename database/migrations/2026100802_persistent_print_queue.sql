-- Etapa 3A: fila persistente. Instala desligada; não enfileira histórico.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.store_config in share row exclusive mode;
lock table public.orders in share row exclusive mode;
lock table public.order_documents in share row exclusive mode;
do $preflight$
begin
    if to_regprocedure('public.rmenu_capture_order_document(uuid)') is null then
        raise exception 'Aplicar e verificar documentos 2F antes da fila.';
    end if;
    if exists(select 1 from public.orders o left join public.order_documents d on d.order_id=o.id
        where o.request_hash is not null and (d.order_id is null or d.document_version<>o.document_version or d.store_id<>o.store_id)) then
        raise exception 'Documento ausente ou divergente.';
    end if;
end;
$preflight$;

create table if not exists public.print_settings (
    store_id uuid primary key references public.store_config(id) on delete restrict,
    enabled boolean not null default false,
    cutoff_at timestamptz,
    updated_at timestamptz not null default clock_timestamp(),
    check(not enabled or cutoff_at is not null)
);
create table if not exists public.print_devices (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references public.store_config(id) on delete restrict,
    name text not null check(length(name) between 1 and 80),
    queue_name text not null check(length(queue_name) between 1 and 160),
    paper_width_mm integer not null check(paper_width_mm in (58,80)),
    credential_hash text not null unique check(credential_hash ~ '^[0-9a-f]{64}$'),
    revoked_at timestamptz,
    created_at timestamptz not null default clock_timestamp(),
    unique(store_id,id)
);
create table if not exists public.print_jobs (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references public.store_config(id) on delete restrict,
    order_id uuid not null references public.order_documents(order_id) on delete restrict,
    document_version integer not null check(document_version=1),
    purpose text not null check(purpose in ('initial','reprint')),
    request_key uuid not null,
    requested_by uuid,
    reason text,
    state text not null default 'pending' check(state in ('pending','leased','dispatching','spooler_submitted','uncertain','failed','cancelled')),
    device_id uuid,
    lease_token uuid,
    lease_expires_at timestamptz,
    attempts integer not null default 0 check(attempts>=0),
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    dispatched_at timestamptz,
    completed_at timestamptz,
    unique(store_id,request_key),
    foreign key(store_id,device_id) references public.print_devices(store_id,id) on delete restrict,
    check(purpose<>'reprint' or (requested_by is not null and reason is not null and requested_by=store_id and length(btrim(reason)) between 3 and 240)),
    check(state not in ('leased','dispatching') or (device_id is not null and lease_token is not null and lease_expires_at is not null)),
    check(state not in ('dispatching','spooler_submitted','uncertain') or dispatched_at is not null)
);
create unique index if not exists rmenu_print_initial_unique on public.print_jobs(store_id,order_id,purpose) where purpose='initial';
create index if not exists rmenu_print_pending on public.print_jobs(store_id,created_at,id) where state in ('pending','leased','dispatching');
create table if not exists public.print_events (
    id bigint generated always as identity primary key,
    store_id uuid not null references public.store_config(id) on delete restrict,
    job_id uuid references public.print_jobs(id) on delete restrict,
    device_id uuid,
    event text not null,
    actor_id uuid,
    reason text,
    created_at timestamptz not null default clock_timestamp()
);

-- Identidades e conteúdo não mudam depois de enfileirados. Histórico append-only.
create or replace function public.rmenu_print_guard() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    if tg_op='DELETE' or tg_table_name='print_events' then raise exception 'Histórico de impressão imutável.'; end if;
    if tg_table_name='print_jobs' then
        if tg_op='INSERT' then
            if not exists(select 1 from public.order_documents where order_id=new.order_id and store_id=new.store_id and document_version=new.document_version and schema_version=1) then
                raise exception 'Documento de outra loja ou versão indisponível.';
            end if;
            return new;
        end if;
        if new.id<>old.id or new.store_id<>old.store_id or new.order_id<>old.order_id
            or new.document_version<>old.document_version or new.purpose<>old.purpose or new.request_key<>old.request_key
            or new.requested_by is distinct from old.requested_by or new.reason is distinct from old.reason or new.created_at<>old.created_at then
            raise exception 'Identidade de impressão imutável.';
        end if;
        if new.attempts<old.attempts or (new.state is distinct from old.state and not (
            (old.state='pending' and new.state in ('leased','cancelled'))
            or (old.state='leased' and new.state in ('pending','dispatching','failed','cancelled'))
            or (old.state='dispatching' and new.state in ('uncertain','spooler_submitted'))
            or (old.state='uncertain' and new.state='spooler_submitted'))) then
            raise exception 'Transição de impressão inválida; envio não retorna à fila.';
        end if;
        if (new.device_id is distinct from old.device_id or new.lease_token is distinct from old.lease_token)
            and not ((old.state='pending' and new.state='leased') or (old.state='leased' and new.state='pending')) then
            raise exception 'Reserva de impressão imutável fora da alocação.';
        end if;
    elsif tg_table_name='print_devices' then
        if new.id<>old.id or new.store_id<>old.store_id or new.credential_hash<>old.credential_hash
            or new.name<>old.name or new.queue_name<>old.queue_name or new.paper_width_mm<>old.paper_width_mm
            or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
            raise exception 'Dispositivo imutável; revogar e cadastrar outro para mudar configuração.';
        end if;
    elsif tg_table_name='print_settings' then
        if new.store_id<>old.store_id or (old.cutoff_at is not null and (new.cutoff_at is null or new.cutoff_at<old.cutoff_at)) then
            raise exception 'Corte de impressão não pode retroceder.';
        end if;
    end if;
    return new;
end;
$fn$;
create or replace function public.rmenu_print_job_event() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    if tg_op='INSERT' or new.state is distinct from old.state or new.attempts<>old.attempts then
        insert into public.print_events(store_id,job_id,device_id,event,actor_id,reason)
        values(new.store_id,new.id,new.device_id,new.state,new.requested_by,new.reason);
    end if;
    return new;
end;
$fn$;

do $tables$
declare t text;
begin
    foreach t in array array['print_settings','print_devices','print_jobs','print_events'] loop
        execute format('alter table public.%I enable row level security',t);
        execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
        execute format('grant select,insert,update on public.%I to service_role',t);
        execute format('drop policy if exists rmenu_print_owner_read on public.%I',t);
        execute format('create policy rmenu_print_owner_read on public.%I for select to authenticated using(store_id=auth.uid())',t);
        execute format('drop policy if exists rmenu_print_owner_scope on public.%I',t);
        execute format('create policy rmenu_print_owner_scope on public.%I as restrictive for select to authenticated using(store_id=auth.uid())',t);
        execute format('drop policy if exists rmenu_print_no_write on public.%I',t);
        execute format('create policy rmenu_print_no_write on public.%I as restrictive for all to authenticated using(store_id=auth.uid()) with check(false)',t);
        execute format('drop policy if exists rmenu_print_no_anon on public.%I',t);
        execute format('create policy rmenu_print_no_anon on public.%I as restrictive for all to anon using(false) with check(false)',t);
        execute format('drop trigger if exists rmenu_print_guard on public.%I',t);
        execute format('create trigger rmenu_print_guard before update or delete on public.%I for each row execute function public.rmenu_print_guard()',t);
    end loop;
end;
$tables$;
revoke update on public.print_events from service_role;
grant usage,select on sequence public.print_events_id_seq to service_role;
grant select on public.print_settings,public.print_events to authenticated;
grant select(id,store_id,name,queue_name,paper_width_mm,revoked_at,created_at) on public.print_devices to authenticated;
grant select(id,store_id,order_id,document_version,purpose,request_key,requested_by,reason,state,device_id,lease_expires_at,attempts,created_at,updated_at,dispatched_at,completed_at) on public.print_jobs to authenticated;
drop trigger if exists rmenu_print_insert_guard on public.print_jobs;
create trigger rmenu_print_insert_guard before insert on public.print_jobs for each row execute function public.rmenu_print_guard();
drop trigger if exists rmenu_print_job_event on public.print_jobs;
create trigger rmenu_print_job_event after insert or update on public.print_jobs for each row execute function public.rmenu_print_job_event();
insert into public.print_settings(store_id) select id from public.store_config on conflict(store_id) do nothing;

create or replace function public.rmenu_print_enqueue_document() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    insert into public.print_jobs(store_id,order_id,document_version,purpose,request_key)
    select new.store_id,new.order_id,new.document_version,'initial',gen_random_uuid()
    from public.orders o join public.print_settings s on s.store_id=o.store_id
    where o.id=new.order_id and o.store_id=new.store_id and o.document_version=new.document_version
        and new.schema_version=1 and o.request_hash is not null and o.status<>'cancelled'
        and s.enabled and o.created_at>=s.cutoff_at
    on conflict(store_id,order_id,purpose) where purpose='initial' do nothing;
    return new;
end;
$fn$;
drop trigger if exists rmenu_print_enqueue_document on public.order_documents;
create trigger rmenu_print_enqueue_document after insert on public.order_documents for each row execute function public.rmenu_print_enqueue_document();

create or replace function public.rmenu_print_cancel_order() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    if new.status='cancelled' and old.status is distinct from new.status then
        update public.print_jobs set state=case when state='dispatching' then 'uncertain' else 'cancelled' end,updated_at=clock_timestamp()
        where order_id=new.id and state in ('pending','leased','dispatching');
        insert into public.print_events(store_id,job_id,device_id,event,actor_id)
        select store_id,id,device_id,'order_cancelled',auth.uid() from public.print_jobs where order_id=new.id;
    end if;
    return new;
end;
$fn$;
-- Owner só pode UPDATE(status) e não escreve a fila: trigger exige executor privilegiado.
-- SECURITY DEFINER estritamente limitada ao pedido do trigger, sem argumentos públicos.
alter function public.rmenu_print_cancel_order() security definer;
drop trigger if exists rmenu_print_cancel_order on public.orders;
create trigger rmenu_print_cancel_order after update of status on public.orders for each row execute function public.rmenu_print_cancel_order();

create or replace function public.rmenu_print_register_device(p_store uuid,p_actor uuid,p_name text,p_queue text,p_width integer,p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid;
begin
    if p_actor is null or p_actor<>p_store then raise exception 'Acesso negado.' using errcode='42501'; end if;
    perform 1 from public.store_config where id=p_store for update;
    if not found then raise exception 'Acesso negado.' using errcode='42501'; end if;
    insert into public.print_devices(store_id,name,queue_name,paper_width_mm,credential_hash)
    values(p_store,btrim(p_name),btrim(p_queue),p_width,p_hash) returning id into v_id;
    insert into public.print_settings(store_id) values(p_store) on conflict(store_id) do nothing;
    insert into public.print_events(store_id,device_id,event,actor_id) values(p_store,v_id,'device_registered',p_actor);
    return v_id;
end;
$fn$;
create or replace function public.rmenu_print_set_enabled(p_store uuid,p_actor uuid,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare v_setting public.print_settings;
begin
    if p_actor is null or p_actor<>p_store or p_enabled is null then raise exception 'Acesso negado.' using errcode='42501'; end if;
    perform 1 from public.store_config where id=p_store for update;
    if not found then raise exception 'Acesso negado.' using errcode='42501'; end if;
    if p_enabled and not exists(select 1 from public.print_devices where store_id=p_store and revoked_at is null) then raise exception 'Cadastrar dispositivo antes de ativar.'; end if;
    insert into public.print_settings(store_id) values(p_store) on conflict(store_id) do nothing;
    select * into v_setting from public.print_settings where store_id=p_store for update;
    if v_setting.enabled=p_enabled then return jsonb_build_object('enabled',v_setting.enabled,'cutoff_at',v_setting.cutoff_at); end if;
    update public.print_settings set enabled=p_enabled,cutoff_at=case when p_enabled then clock_timestamp() else cutoff_at end,updated_at=clock_timestamp() where store_id=p_store returning * into v_setting;
    if not p_enabled then
        update public.print_jobs set state=case when state='dispatching' then 'uncertain' else 'cancelled' end,updated_at=clock_timestamp()
        where store_id=p_store and state in ('pending','leased','dispatching');
    end if;
    insert into public.print_events(store_id,event,actor_id) values(p_store,case when p_enabled then 'enabled' else 'disabled' end,p_actor);
    return jsonb_build_object('enabled',v_setting.enabled,'cutoff_at',v_setting.cutoff_at);
end;
$fn$;
create or replace function public.rmenu_print_revoke_device(p_store uuid,p_actor uuid,p_device uuid) returns boolean
language plpgsql security invoker set search_path='' as $fn$
begin
    if p_actor is null or p_actor<>p_store then raise exception 'Acesso negado.' using errcode='42501'; end if;
    perform 1 from public.store_config where id=p_store for update;
    update public.print_devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_device and store_id=p_store;
    if not found then return false; end if;
    update public.print_jobs set state='pending',device_id=null,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where store_id=p_store and device_id=p_device and state='leased';
    update public.print_jobs set state='uncertain',updated_at=clock_timestamp() where store_id=p_store and device_id=p_device and state='dispatching';
    insert into public.print_events(store_id,device_id,event,actor_id) values(p_store,p_device,'device_revoked',p_actor);
    return true;
end;
$fn$;

-- Todas as operações do agente são privadas ao servidor: token é validado por hash
-- após lock da loja e do dispositivo. PC nunca recebe service_role.
create or replace function public.rmenu_print_auth_device(p_device uuid,p_hash text) returns public.print_devices
language plpgsql security invoker set search_path='' as $fn$
declare v_store uuid; v_device public.print_devices;
begin
    select store_id into v_store from public.print_devices where id=p_device;
    perform 1 from public.store_config where id=v_store for update;
    select * into v_device from public.print_devices where id=p_device and credential_hash=p_hash and revoked_at is null for update;
    if not found then raise exception 'Credencial inválida.' using errcode='42501'; end if;
    return v_device;
end;
$fn$;
create or replace function public.rmenu_print_claim(p_device uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices; v_job public.print_jobs; v_document public.order_documents;
begin
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    update public.print_jobs set state='uncertain',updated_at=clock_timestamp()
    where store_id=v_device.store_id and state='dispatching' and lease_expires_at<=clock_timestamp();
    update public.print_jobs set state='pending',device_id=null,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where store_id=v_device.store_id and state='leased' and lease_expires_at<=clock_timestamp();
    if not exists(select 1 from public.print_settings where store_id=v_device.store_id and enabled) then return jsonb_build_object('job',null); end if;
    update public.print_jobs j set state='cancelled',updated_at=clock_timestamp()
    from public.orders o,public.print_settings s where j.store_id=v_device.store_id and j.order_id=o.id and s.store_id=j.store_id
        and j.state in ('pending','leased') and (o.status='cancelled' or o.document_version<>j.document_version or (j.purpose='initial' and o.created_at<s.cutoff_at));
    select * into v_job from public.print_jobs where store_id=v_device.store_id and state='pending'
    order by created_at,id for update skip locked limit 1;
    if not found then return jsonb_build_object('job',null); end if;
    update public.print_jobs set state='leased',device_id=p_device,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',
        attempts=attempts+1,updated_at=clock_timestamp() where id=v_job.id returning * into v_job;
    select * into strict v_document from public.order_documents where order_id=v_job.order_id and store_id=v_job.store_id and document_version=v_job.document_version;
    return jsonb_build_object('job',jsonb_build_object('id',v_job.id,'order_id',v_job.order_id,'purpose',v_job.purpose,
        'lease_token',v_job.lease_token,'lease_expires_at',v_job.lease_expires_at,'document',to_jsonb(v_document)),
        'device',jsonb_build_object('id',p_device,'queue_name',v_device.queue_name,'paper_width_mm',v_device.paper_width_mm,'copies',1));
end;
$fn$;
create or replace function public.rmenu_print_renew(p_device uuid,p_hash text,p_job uuid,p_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices;
begin
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    update public.print_jobs set lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
    where id=p_job and store_id=v_device.store_id and device_id=p_device and lease_token=p_lease and state='leased'
        and lease_expires_at>clock_timestamp() and exists(select 1 from public.print_settings where store_id=v_device.store_id and enabled);
    return found;
end;
$fn$;
create or replace function public.rmenu_print_begin_dispatch(p_device uuid,p_hash text,p_job uuid,p_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices; v_order public.orders; v_job public.print_jobs;
begin
    -- Ordem: loja -> pedido -> dispositivo -> job. Cancelamento: pedido -> job.
    -- Claim não bloqueia pedido; evita ciclo entre checkout/cancelamento/reserva.
    select * into v_device from public.print_devices where id=p_device;
    perform 1 from public.store_config where id=v_device.store_id for update;
    select o.* into v_order from public.orders o join public.print_jobs j on j.order_id=o.id
        where j.id=p_job and j.store_id=v_device.store_id for update of o;
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    select * into v_job from public.print_jobs where id=p_job and store_id=v_device.store_id for update;
    if not found or v_job.device_id is distinct from p_device or v_job.lease_token is distinct from p_lease
        or v_job.state<>'leased' or v_job.lease_expires_at<=clock_timestamp() or v_order.status='cancelled'
        or v_order.document_version<>v_job.document_version or not exists(select 1 from public.print_settings where store_id=v_device.store_id and enabled) then return false; end if;
    update public.print_jobs set state='dispatching',dispatched_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() where id=p_job;
    return true;
end;
$fn$;
create or replace function public.rmenu_print_finish(p_device uuid,p_hash text,p_job uuid,p_lease uuid,p_outcome text) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices;
begin
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    if p_outcome not in ('spooler_submitted','uncertain','failed') or p_outcome is null then raise exception 'Resultado inválido.'; end if;
    update public.print_jobs set state=p_outcome,completed_at=case when p_outcome='spooler_submitted' then clock_timestamp() else null end,updated_at=clock_timestamp()
    where id=p_job and store_id=v_device.store_id and device_id=p_device and lease_token=p_lease
        and ((p_outcome='failed' and state='leased') or (p_outcome in ('spooler_submitted','uncertain') and state in ('dispatching','uncertain')));
    if found then return true; end if;
    return exists(select 1 from public.print_jobs where id=p_job and store_id=v_device.store_id and device_id=p_device and lease_token=p_lease and state=p_outcome);
end;
$fn$;
create or replace function public.rmenu_print_inspect(p_device uuid,p_hash text,p_job uuid) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices; v_result jsonb;
begin
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    select jsonb_build_object('id',id,'state',state,'lease_expires_at',lease_expires_at,'dispatched_at',dispatched_at,'completed_at',completed_at)
        into v_result from public.print_jobs where id=p_job and store_id=v_device.store_id and device_id=p_device;
    return v_result;
end;
$fn$;
create or replace function public.rmenu_print_request_reprint(p_store uuid,p_actor uuid,p_order uuid,p_key uuid,p_reason text) returns uuid
language plpgsql security invoker set search_path='' as $fn$
declare v_document public.order_documents; v_id uuid;
begin
    if p_actor is null or p_actor<>p_store then raise exception 'Acesso negado.' using errcode='42501'; end if;
    if p_key is null or p_reason is null or length(btrim(p_reason)) not between 3 and 240 then raise exception 'Informar motivo e chave da reimpressão.'; end if;
    perform 1 from public.store_config where id=p_store for update;
    if not exists(select 1 from public.print_settings where store_id=p_store and enabled) then raise exception 'Impressão desativada.'; end if;
    perform 1 from public.orders where id=p_order and store_id=p_store and status<>'cancelled' for update;
    if not found then raise exception 'Pedido indisponível.'; end if;
    select * into strict v_document from public.order_documents where order_id=p_order and store_id=p_store;
    insert into public.print_jobs(store_id,order_id,document_version,purpose,request_key,requested_by,reason)
    values(p_store,p_order,v_document.document_version,'reprint',p_key,p_actor,btrim(p_reason))
    on conflict(store_id,request_key) do nothing returning id into v_id;
    if v_id is null then
        select id into v_id from public.print_jobs where store_id=p_store and request_key=p_key and purpose='reprint' and order_id=p_order and reason=btrim(p_reason);
        if v_id is null then raise exception 'Chave de reimpressão divergente.'; end if;
    end if;
    return v_id;
end;
$fn$;

-- Nenhuma RPC acessível pelo cliente Supabase. Definer só no trigger limitado.
do $permissions$
declare fn record;
begin
    for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'rmenu_print_%' loop
        execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
        execute format('grant execute on function %s to service_role',fn.signature);
    end loop;
    if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rmenu_print_%'
        and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))) then
        raise exception 'Privilégio herdado indevido nas funções de impressão.';
    end if;
    if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
        cross join (values('anon'),('authenticated')) as roles(role)
        where n.nspname='public' and c.relname in ('print_settings','print_devices','print_jobs','print_events') and a.attnum>0 and not a.attisdropped
        and (has_column_privilege(roles.role,c.oid,a.attnum,'INSERT') or has_column_privilege(roles.role,c.oid,a.attnum,'UPDATE')
            or has_table_privilege(roles.role,c.oid,'DELETE') or has_table_privilege(roles.role,c.oid,'TRUNCATE') or has_table_privilege(roles.role,c.oid,'TRIGGER'))) then
        raise exception 'Privilégio herdado de escrita na fila; migração revertida.';
    end if;
    if has_column_privilege('authenticated','public.print_devices','credential_hash','SELECT')
        or has_column_privilege('authenticated','public.print_jobs','lease_token','SELECT') then
        raise exception 'Privilégio herdado de leitura de credenciais; migração revertida.';
    end if;
end;
$permissions$;
commit;
