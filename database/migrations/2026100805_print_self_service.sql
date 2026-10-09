-- Aditiva: não ativa lojas, não altera cortes ou jobs existentes.
begin;
set local lock_timeout='5s';
alter table public.print_settings add column if not exists activation_mode text not null default 'managed';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.print_settings'::regclass and conname='rmenu_print_activation_mode') then
  alter table public.print_settings add constraint rmenu_print_activation_mode check(activation_mode in ('managed','self_service'));
 end if;
end $$;
create table if not exists public.print_device_checks (
 device_id uuid primary key,
 store_id uuid not null,
 queue_name text not null,
 paper_width_mm integer not null check(paper_width_mm in (58,80)),
 last_seen_at timestamptz not null default clock_timestamp(),
 request_id uuid,
 test_id uuid unique,
 expires_at timestamptz,
 state text not null default 'not_requested' check(state in ('not_requested','requested','dispatching','spooler_submitted','uncertain','paper_confirmed')),
 confirmed_at timestamptz,
 foreign key(store_id,device_id) references public.print_devices(store_id,id) on delete restrict,
 check((state='not_requested' and request_id is null and test_id is null and expires_at is null and confirmed_at is null)
    or (state<>'not_requested' and request_id is not null and test_id is not null and expires_at is not null)),
 check((state='paper_confirmed')=(confirmed_at is not null))
);
alter table public.print_device_checks enable row level security;
alter table public.print_device_checks force row level security;
revoke all on public.print_device_checks from public,anon,authenticated;
grant all on public.print_device_checks to service_role;

create or replace function public.rmenu_print_auth_device(p_device uuid,p_hash text) returns public.print_devices
language plpgsql security invoker set search_path='' as $fn$
declare v_store uuid; v_device public.print_devices;
begin
 select store_id into v_store from public.print_devices where id=p_device;
 perform 1 from public.store_config where id=v_store for update;
 select * into v_device from public.print_devices where id=p_device and credential_hash=p_hash and revoked_at is null for update;
 if not found then raise exception 'Credencial inválida.' using errcode='42501'; end if;
 insert into public.print_device_checks(device_id,store_id,queue_name,paper_width_mm)
 values(v_device.id,v_device.store_id,v_device.queue_name,v_device.paper_width_mm)
 on conflict(device_id) do update set last_seen_at=clock_timestamp();
 return v_device;
end;
$fn$;

create or replace function public.rmenu_print_device_calibrated(p_device uuid) returns boolean
language sql security invoker set search_path='' as $fn$
 select exists(select 1 from public.print_devices d join public.print_device_checks c on c.device_id=d.id and c.store_id=d.store_id
 where d.id=p_device and d.revoked_at is null and c.state='paper_confirmed' and c.confirmed_at is not null
 and c.queue_name=d.queue_name and c.paper_width_mm=d.paper_width_mm)
$fn$;

create or replace function public.rmenu_print_self_service_status(p_store uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare v_devices jsonb; v_ready boolean;
begin
 if p_actor is null or p_actor<>p_store or not exists(select 1 from public.store_config where id=p_store) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'last_seen_at',c.last_seen_at,
 'calibration_state',coalesce(c.state,'not_requested'),'calibrated',public.rmenu_print_device_calibrated(d.id),
 'connected',coalesce(c.last_seen_at>clock_timestamp()-interval '5 minutes',false)) order by d.created_at),'[]'::jsonb),
 coalesce(bool_or(public.rmenu_print_device_calibrated(d.id) and c.last_seen_at>clock_timestamp()-interval '5 minutes'),false)
 into v_devices,v_ready from public.print_devices d left join public.print_device_checks c on c.device_id=d.id and c.store_id=d.store_id
 where d.store_id=p_store and d.revoked_at is null;
 return jsonb_build_object('ready',v_ready,'devices',v_devices);
end;
$fn$;

create or replace function public.rmenu_print_calibration_start(p_device uuid,p_hash text,p_request uuid,p_queue text,p_width integer) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare d public.print_devices; c public.print_device_checks;
begin
 d:=public.rmenu_print_auth_device(p_device,p_hash);
 if p_request is null or p_queue is distinct from d.queue_name or p_width is distinct from d.paper_width_mm then
  raise exception 'Perfil de impressão divergente.' using errcode='22023';
 end if;
 select * into strict c from public.print_device_checks where device_id=d.id for update;
 if c.state<>'not_requested' and c.request_id is distinct from p_request then raise exception 'Teste já solicitado.' using errcode='22023'; end if;
 if c.state='not_requested' then
  update public.print_device_checks set request_id=p_request,test_id=gen_random_uuid(),expires_at=clock_timestamp()+interval '24 hours',state='requested'
  where device_id=d.id returning * into c;
  insert into public.print_events(store_id,device_id,event) values(d.store_id,d.id,'calibration_requested');
 end if;
 return jsonb_build_object('test_id',c.test_id,'state',c.state,'expires_at',c.expires_at,'queue_name',d.queue_name,'paper_width_mm',d.paper_width_mm);
end;
$fn$;

create or replace function public.rmenu_print_calibration_dispatch(p_device uuid,p_hash text,p_test uuid) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare d public.print_devices; changed integer;
begin
 d:=public.rmenu_print_auth_device(p_device,p_hash);
 update public.print_device_checks set state='dispatching' where device_id=d.id and store_id=d.store_id and test_id=p_test
 and state='requested' and expires_at>clock_timestamp() and queue_name=d.queue_name and paper_width_mm=d.paper_width_mm;
 get diagnostics changed=row_count;
 if changed=1 then insert into public.print_events(store_id,device_id,event) values(d.store_id,d.id,'calibration_dispatching'); end if;
 return changed=1;
end;
$fn$;

create or replace function public.rmenu_print_calibration_finish(p_device uuid,p_hash text,p_test uuid,p_outcome text) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare d public.print_devices; c public.print_device_checks;
begin
 d:=public.rmenu_print_auth_device(p_device,p_hash);
 if p_outcome is null or p_outcome not in ('spooler_submitted','uncertain') then return false; end if;
 select * into c from public.print_device_checks where device_id=d.id and store_id=d.store_id and test_id=p_test for update;
 if not found then return false; end if;
 if c.state=p_outcome or c.state='paper_confirmed' then return true; end if;
 if c.state<>'dispatching' then return false; end if;
 update public.print_device_checks set state=p_outcome where device_id=d.id;
 insert into public.print_events(store_id,device_id,event) values(d.store_id,d.id,'calibration_'||p_outcome);
 return true;
end;
$fn$;

create or replace function public.rmenu_print_calibration_confirm(p_device uuid,p_hash text,p_test uuid) returns boolean
language plpgsql security invoker set search_path='' as $fn$
declare d public.print_devices; c public.print_device_checks;
begin
 d:=public.rmenu_print_auth_device(p_device,p_hash);
 select * into c from public.print_device_checks where device_id=d.id and store_id=d.store_id and test_id=p_test for update;
 if not found or c.queue_name is distinct from d.queue_name or c.paper_width_mm is distinct from d.paper_width_mm then return false; end if;
 if c.state='paper_confirmed' then return true; end if;
 if c.state not in ('spooler_submitted','uncertain') or c.expires_at<=clock_timestamp() then return false; end if;
 update public.print_device_checks set state='paper_confirmed',confirmed_at=clock_timestamp() where device_id=d.id;
 insert into public.print_events(store_id,device_id,event,reason) values(d.store_id,d.id,'calibration_paper_confirmed','Conferência declarada pela pessoa no assistente; não é confirmação física automática.');
 return true;
end;
$fn$;

create or replace function public.rmenu_print_self_service_enable(p_store uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
begin
 if p_actor is null or p_actor<>p_store then raise exception 'Acesso negado.' using errcode='42501'; end if;
 perform 1 from public.store_config where id=p_store for update;
 if not found then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if not (public.rmenu_print_self_service_status(p_store,p_actor)->>'ready')::boolean then
  raise exception 'Teste confirmado e conexão recente são necessários.' using errcode='22023';
 end if;
 insert into public.print_settings(store_id) values(p_store) on conflict(store_id) do nothing;
 update public.print_settings set activation_mode='self_service' where store_id=p_store;
 return public.rmenu_print_set_enabled(p_store,p_actor,true);
end;
$fn$;

-- CLAIM e DISPATCH abaixo conservarão os corpos anteriores e acrescentarão
-- a barreira de calibração para lojas que escolherem self_service.

create or replace function public.rmenu_print_claim(p_device uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare v_device public.print_devices; v_job public.print_jobs; v_document public.order_documents;
begin
    v_device:=public.rmenu_print_auth_device(p_device,p_hash);
    if exists(select 1 from public.print_settings where store_id=v_device.store_id and activation_mode='self_service')
        and not public.rmenu_print_device_calibrated(p_device) then return jsonb_build_object('job',null); end if;
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
    if exists(select 1 from public.print_settings where store_id=v_device.store_id and activation_mode='self_service')
        and not public.rmenu_print_device_calibrated(p_device) then return false; end if;
    select * into v_job from public.print_jobs where id=p_job and store_id=v_device.store_id for update;
    if not found or v_job.device_id is distinct from p_device or v_job.lease_token is distinct from p_lease
        or v_job.state<>'leased' or v_job.lease_expires_at<=clock_timestamp() or v_order.status='cancelled'
        or v_order.document_version<>v_job.document_version or not exists(select 1 from public.print_settings where store_id=v_device.store_id and enabled) then return false; end if;
    update public.print_jobs set state='dispatching',dispatched_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() where id=p_job;
    return true;
end;
$fn$;
-- Funções privadas: somente o servidor autenticado as utiliza.
do $permissions$
declare fn record;
begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'rmenu_print_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end;
$permissions$;
notify pgrst,'reload schema';
commit;