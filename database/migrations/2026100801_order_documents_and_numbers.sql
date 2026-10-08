-- Etapa 2F. Não cria fila, não ativa impressão e não atribui documentos a legados.
-- Executar inteiro; checkout publicado legado continua permitido ao service_role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Mesma ordem do checkout: loja -> pedido -> itens. Impede seed com MAX obsoleto.
lock table public.store_config in share row exclusive mode;
lock table public.orders in share row exclusive mode;
lock table public.order_items in share row exclusive mode;

do $preflight$
begin
    if to_regprocedure('public.rmenu_submit_order(jsonb,text,jsonb)') is null
       or to_regprocedure('public.rmenu_create_order_atomic(jsonb,text)') is null then
        raise exception 'Aplicar e verificar etapas 2C/2D antes da 2F.';
    end if;
    if exists (select 1 from pg_class where oid in ('public.orders'::regclass,'public.order_items'::regclass) and not relrowsecurity) then
        raise exception 'RLS de pedidos/itens precisa estar habilitado.';
    end if;
    if not exists (
        select 1 from pg_trigger where tgrelid='public.orders'::regclass
        and tgname='trg_orders_set_number' and tgfoid=to_regprocedure('public.set_order_number()') and tgenabled='O'
    ) then
        raise exception 'Trigger de numeração diverge do inventário.';
    end if;
    if not exists (
        select 1 from pg_constraint where conrelid='public.orders'::regclass and contype='u'
        and convalidated and pg_get_constraintdef(oid)='UNIQUE (store_id, order_number)'
    ) then
        raise exception 'Unicidade de número por loja ausente.';
    end if;
    if exists (select 1 from public.orders where order_number<=0)
       or exists (select 1 from public.orders group by store_id,order_number having count(*)>1) then
        raise exception 'Numeração histórica inválida; investigar sem reescrever histórico.';
    end if;
    if exists (
        select 1 from public.orders o where o.request_hash is not null and (
            o.expected_item_count is null or o.expected_item_count<>(select count(*) from public.order_items where order_id=o.id)
            or o.subtotal is distinct from (select sum(item_total) from public.order_items where order_id=o.id)
            or o.total is distinct from o.subtotal+o.delivery_fee-coalesce(o.discount_value,0)
        )
    ) then
        raise exception 'Pedido do novo fluxo incompleto ou divergente; investigar antes de selar.';
    end if;
end;
$preflight$;

alter table public.orders add column if not exists document_version integer not null default 1;
do $constraints$
begin
    if not exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='rmenu_order_document_version_v1') then
        alter table public.orders add constraint rmenu_order_document_version_v1 check(document_version=1);
    end if;
end;
$constraints$;

create table if not exists public.order_number_counters (
    store_id uuid primary key references public.store_config(id) on delete restrict,
    last_number integer not null check(last_number>=0)
);
alter table public.order_number_counters enable row level security;
revoke all on public.order_number_counters from public,anon,authenticated,service_role;
grant select,insert,update on public.order_number_counters to service_role;

insert into public.order_number_counters(store_id,last_number)
select s.id,coalesce(max(o.order_number),0) from public.store_config s
left join public.orders o on o.store_id=s.id group by s.id
on conflict(store_id) do update set last_number=greatest(public.order_number_counters.last_number,excluded.last_number);

create or replace function public.rmenu_guard_order_counter() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    if tg_op='DELETE' then
        raise exception 'Contador de pedidos não pode ser excluído.' using errcode='23514';
    end if;
    if new.store_id is distinct from old.store_id or new.last_number<old.last_number then
        raise exception 'Contador de pedidos não pode retroceder ou mudar de loja.' using errcode='23514';
    end if;
    return new;
end;
$fn$;
drop trigger if exists rmenu_order_counter_guard on public.order_number_counters;
create trigger rmenu_order_counter_guard before update or delete on public.order_number_counters
for each row execute function public.rmenu_guard_order_counter();

create or replace function public.set_order_number() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    perform 1 from public.store_config where id=new.store_id for update;
    if not found then raise exception 'Loja inexistente.' using errcode='23503'; end if;
    insert into public.order_number_counters(store_id,last_number) values(new.store_id,1)
    on conflict(store_id) do update set last_number=public.order_number_counters.last_number+1
    returning last_number into new.order_number;
    return new;
end;
$fn$;

create table if not exists public.order_documents (
    order_id uuid primary key references public.orders(id) on delete restrict,
    store_id uuid not null references public.store_config(id) on delete restrict,
    document_version integer not null check(document_version=1),
    schema_version integer not null check(schema_version=1),
    snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
    sealed_at timestamptz not null default clock_timestamp()
);
alter table public.order_documents enable row level security;
revoke all on public.order_documents from public,anon,authenticated,service_role;
grant select on public.order_documents to authenticated;
grant select,insert on public.order_documents to service_role;
-- Grants de coluna antigos também não podem expor as duas tabelas privadas.
do $private_column_grants$
declare col record;
begin
    for col in select attrelid::regclass as tbl,attname from pg_attribute
        where attrelid in ('public.order_documents'::regclass,'public.order_number_counters'::regclass) and attnum>0 and not attisdropped loop
        execute format('revoke select(%I),insert(%I),update(%I),references(%I) on %s from public,anon,authenticated',col.attname,col.attname,col.attname,col.attname,col.tbl);
    end loop;
end;
$private_column_grants$;
grant select on public.order_documents to authenticated;
drop policy if exists rmenu_order_document_owner_read on public.order_documents;
create policy rmenu_order_document_owner_read on public.order_documents for select to authenticated using(store_id=auth.uid());

create or replace function public.rmenu_guard_order_document() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    raise exception 'Documento salvo é imutável; correção exige fluxo versionado e auditado.' using errcode='23514';
end;
$fn$;
drop trigger if exists rmenu_order_document_guard on public.order_documents;
create trigger rmenu_order_document_guard before update or delete on public.order_documents
for each row execute function public.rmenu_guard_order_document();

create or replace function public.rmenu_capture_order_document(p_order_id uuid) returns void
language plpgsql security invoker set search_path='' as $fn$
declare
    saved public.orders%rowtype;
    items_snapshot jsonb;
    item_count bigint;
    items_total numeric;
    store_name text;
begin
    select * into saved from public.orders where id=p_order_id for update;
    if not found then raise exception 'Pedido inexistente.' using errcode='23503'; end if;
    if saved.request_hash is null then
        raise exception 'Pedido legado não recebe documento automático.' using errcode='23514';
    end if;
    if exists(select 1 from public.order_documents where order_id=saved.id) then return; end if;
    select count(*),sum(item_total),jsonb_agg(to_jsonb(i) order by i.created_at,i.id)
    into item_count,items_total,items_snapshot from public.order_items i where order_id=saved.id;
    if saved.expected_item_count is null or item_count<>saved.expected_item_count
       or saved.subtotal is distinct from items_total
       or saved.total is distinct from saved.subtotal+saved.delivery_fee-coalesce(saved.discount_value,0)
       or exists(select 1 from public.order_items where order_id=saved.id and (
           item_total is distinct from quantity*unit_price or unit_price<0 or item_total<0
           or unit_price::text in ('NaN','Infinity','-Infinity')
           or item_total::text in ('NaN','Infinity','-Infinity')
           or jsonb_typeof(selected_options) is distinct from 'array'
       )) then
        raise exception 'Snapshot incompleto ou divergente; transação será desfeita.' using errcode='23514';
    end if;
    select name into store_name from public.store_config where id=saved.store_id;
    insert into public.order_documents(order_id,store_id,document_version,schema_version,snapshot)
    values(saved.id,saved.store_id,saved.document_version,1,jsonb_build_object(
        'schema_version',1,'document_version',saved.document_version,'store_name',store_name,
        -- Estados operacionais e de WhatsApp não pertencem ao conteúdo da comanda.
        'order',to_jsonb(saved)-array['status','handoff_status','updated_at','request_hash','idempotency_key'],
        'items',items_snapshot
    ));
end;
$fn$;

create or replace function public.rmenu_seal_order_at_commit() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    perform public.rmenu_capture_order_document(new.id);
    return null;
end;
$fn$;
drop trigger if exists rmenu_order_seal_at_commit on public.orders;
create constraint trigger rmenu_order_seal_at_commit after insert on public.orders
deferrable initially deferred for each row when (new.request_hash is not null)
execute function public.rmenu_seal_order_at_commit();

-- Selar só o novo fluxo já íntegro. Isso NÃO o torna elegível para fila/histórico.
do $seal_existing$
declare saved_id uuid;
begin
    for saved_id in select id from public.orders where request_hash is not null order by store_id,id loop
        perform public.rmenu_capture_order_document(saved_id);
    end loop;
end;
$seal_existing$;

create or replace function public.rmenu_guard_order_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
    if (to_jsonb(new)-array['status','handoff_status','updated_at','delivery_zone_id'])
       is distinct from (to_jsonb(old)-array['status','handoff_status','updated_at','delivery_zone_id'])
       or (new.delivery_zone_id is distinct from old.delivery_zone_id and new.delivery_zone_id is not null) then
        raise exception 'Conteúdo do pedido é imutável; correção exige fluxo versionado e auditado.' using errcode='23514';
    end if;
    if old.status='cancelled' and new.status is distinct from old.status then
        raise exception 'Cancelamento é terminal; não reabrir pedido para imprimir.' using errcode='23514';
    end if;
    if current_user in ('anon','authenticated') and new.handoff_status is distinct from old.handoff_status then
        raise exception 'Sinal de WhatsApp só pode ser registrado pelo servidor.' using errcode='23514';
    end if;
    -- Permite ON DELETE SET NULL da zona. Nome/frete/endereço permanecem no snapshot.
    return new;
end;
$fn$;
drop trigger if exists rmenu_order_snapshot_guard on public.orders;
create trigger rmenu_order_snapshot_guard before update on public.orders
for each row execute function public.rmenu_guard_order_snapshot();

create or replace function public.rmenu_guard_order_item_snapshot() returns trigger
language plpgsql security invoker set search_path='' as $fn$
declare parent public.orders%rowtype;
begin
    if tg_op='UPDATE' then
        -- Mantém remoção do catálogo via FK; documento conserva ID/nome/preço original.
        if (to_jsonb(new)-'product_id') is distinct from (to_jsonb(old)-'product_id')
           or (new.product_id is distinct from old.product_id and new.product_id is not null) then
            raise exception 'Snapshot do item é imutável.' using errcode='23514';
        end if;
        return new;
    end if;
    if tg_op='DELETE' then
        if exists(select 1 from public.orders where id=old.order_id) then
            raise exception 'Item salvo não pode ser excluído isoladamente.' using errcode='23514';
        end if;
        return old; -- Só cascade de pedido legado removido pelo servidor.
    end if;
    select * into parent from public.orders where id=new.order_id for update;
    if not found then raise exception 'Pedido inexistente.' using errcode='23503'; end if;
    if exists(select 1 from public.order_documents where order_id=parent.id) then
        raise exception 'Pedido selado não aceita novos itens.' using errcode='23514';
    end if;
    return new;
end;
$fn$;
drop trigger if exists rmenu_order_item_snapshot_guard on public.order_items;
create trigger rmenu_order_item_snapshot_guard before insert or update or delete on public.order_items
for each row execute function public.rmenu_guard_order_item_snapshot();

-- Remover grants de tabela E de coluna (revogar só tabela não basta).
revoke insert,update,delete on public.orders,public.order_items from public,anon,authenticated;
do $column_grants$
declare col record;
begin
    for col in select attrelid::regclass as tbl,attname from pg_attribute
        where attrelid in ('public.orders'::regclass,'public.order_items'::regclass) and attnum>0 and not attisdropped loop
        execute format('revoke insert(%I),update(%I) on %s from public,anon,authenticated',col.attname,col.attname,col.tbl);
    end loop;
end;
$column_grants$;
grant update(status) on public.orders to authenticated;

-- Barreiras restritivas mantêm escopo mesmo após grant/policy ampla.
drop policy if exists rmenu_orders_owner_read_guard on public.orders;
create policy rmenu_orders_owner_read_guard on public.orders as restrictive for select to anon,authenticated using(store_id=auth.uid());
drop policy if exists rmenu_orders_owner_update_guard on public.orders;
create policy rmenu_orders_owner_update_guard on public.orders as restrictive for update to anon,authenticated using(store_id=auth.uid()) with check(store_id=auth.uid());
drop policy if exists rmenu_items_owner_read_guard on public.order_items;
create policy rmenu_items_owner_read_guard on public.order_items as restrictive for select to anon,authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.store_id=auth.uid()));
drop policy if exists rmenu_documents_owner_read_guard on public.order_documents;
create policy rmenu_documents_owner_read_guard on public.order_documents as restrictive for select to anon,authenticated using(store_id=auth.uid());
drop policy if exists rmenu_orders_no_client_insert on public.orders;
create policy rmenu_orders_no_client_insert on public.orders as restrictive for insert to anon,authenticated with check(false);
drop policy if exists rmenu_orders_no_client_delete on public.orders;
create policy rmenu_orders_no_client_delete on public.orders as restrictive for delete to anon,authenticated using(false);
drop policy if exists rmenu_items_no_client_insert on public.order_items;
create policy rmenu_items_no_client_insert on public.order_items as restrictive for insert to anon,authenticated with check(false);
drop policy if exists rmenu_items_no_client_update on public.order_items;
create policy rmenu_items_no_client_update on public.order_items as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists rmenu_items_no_client_delete on public.order_items;
create policy rmenu_items_no_client_delete on public.order_items as restrictive for delete to anon,authenticated using(false);

revoke all on function public.set_order_number(),public.rmenu_guard_order_counter(),public.rmenu_guard_order_document(),
    public.rmenu_capture_order_document(uuid),public.rmenu_seal_order_at_commit(),public.rmenu_guard_order_snapshot(),
    public.rmenu_guard_order_item_snapshot() from public,anon,authenticated;
grant execute on function public.set_order_number(),public.rmenu_guard_order_counter(),public.rmenu_guard_order_document(),
    public.rmenu_capture_order_document(uuid),public.rmenu_seal_order_at_commit(),public.rmenu_guard_order_snapshot(),
    public.rmenu_guard_order_item_snapshot() to service_role;
-- Não aceitar privilégios perigosos herdados de outros papéis.
do $postflight$
declare role_name text;
begin
    foreach role_name in array array['anon','authenticated'] loop
        if exists(
            select 1 from pg_attribute a where a.attrelid in ('public.orders'::regclass,'public.order_items'::regclass)
            and a.attnum>0 and not a.attisdropped and (
                has_column_privilege(role_name,a.attrelid,a.attnum,'INSERT')
                or (has_column_privilege(role_name,a.attrelid,a.attnum,'UPDATE')
                    and not(role_name='authenticated' and a.attrelid='public.orders'::regclass and a.attname='status'))
            )
        ) or has_table_privilege(role_name,'public.orders','DELETE')
          or has_table_privilege(role_name,'public.order_items','DELETE')
          or has_any_column_privilege(role_name,'public.order_number_counters','SELECT,INSERT,UPDATE,REFERENCES')
          or has_any_column_privilege(role_name,'public.order_documents','INSERT,UPDATE,REFERENCES')
          or has_table_privilege(role_name,'public.order_documents','DELETE')
          or (role_name='anon' and has_any_column_privilege(role_name,'public.order_documents','SELECT')) then
            raise exception 'Privilégio de cliente inesperado/herdado: %. Revisar sem abrir acesso.',role_name;
        end if;
    end loop;
end;
$postflight$;
commit;
