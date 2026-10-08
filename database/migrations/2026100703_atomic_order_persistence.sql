-- Etapa 2C: instalar persistência atômica restrita ao servidor.
-- Ainda NÃO conecta a aplicação atual a esta função e não cria fila de impressão.
-- p_payload deve conter snapshots de itens já validados/calculados pelo servidor.
-- p_request_hash é SHA-256 da intenção normalizada, calculado pelo servidor.
-- Não aceitar snapshots ou hash enviados pelo cliente sem validação.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
    if exists (select 1 from public.coupon_usages group by order_id having count(*) > 1) then
        raise exception 'Há pedidos com múltiplos usos de cupom; revisar histórico antes da migração.';
    end if;
    if exists (
        select 1 from public.coupon_usages u join public.orders o on o.id=u.order_id
        join public.coupons c on c.id=u.coupon_id where o.store_id is distinct from c.store_id
    ) then
        raise exception 'Há usos de cupom entre lojas; revisar histórico antes da migração.';
    end if;
    if exists (select 1 from public.coupons where usage_count is null or usage_count < 0 or usage_limit < 0) then
        raise exception 'Há contadores/limites de cupom inválidos; revisar antes da migração.';
    end if;
    if exists (
        select 1 from public.coupons c left join (
            select coupon_id,count(*) as total from public.coupon_usages group by coupon_id
        ) u on u.coupon_id=c.id where c.usage_count is distinct from coalesce(u.total,0)
    ) then
        raise exception 'Contadores de cupom divergem do histórico; não serão recalculados automaticamente.';
    end if;
end;
$preflight$;

alter table public.orders add column if not exists address_complement text;
alter table public.orders add column if not exists request_hash text;
alter table public.orders add column if not exists expected_item_count integer;
alter table public.coupons alter column usage_count set default 0;
alter table public.coupons alter column usage_count set not null;
do $constraints$
begin
    if not exists (select 1 from pg_constraint where conrelid='public.coupon_usages'::regclass and conname='rmenu_coupon_usage_one_per_order') then
        alter table public.coupon_usages add constraint rmenu_coupon_usage_one_per_order unique(order_id);
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.coupons'::regclass and conname='rmenu_coupon_count_nonnegative') then
        alter table public.coupons add constraint rmenu_coupon_count_nonnegative check(usage_count >= 0);
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.coupons'::regclass and conname='rmenu_coupon_limit_nonnegative') then
        alter table public.coupons add constraint rmenu_coupon_limit_nonnegative check(usage_limit is null or usage_limit >= 0);
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='rmenu_order_request_hash_format') then
        alter table public.orders add constraint rmenu_order_request_hash_format check(request_hash is null or request_hash ~ '^[0-9a-f]{64}$');
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass and conname='rmenu_order_expected_items_positive') then
        alter table public.orders add constraint rmenu_order_expected_items_positive check(expected_item_count is null or expected_item_count > 0);
    end if;
end;
$constraints$;

create or replace function public.rmenu_check_coupon_usage_store() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
    if not exists (
        select 1 from public.orders o join public.coupons c on c.store_id=o.store_id
        where o.id=new.order_id and c.id=new.coupon_id
    ) then
        raise exception 'Pedido e cupom precisam pertencer à mesma loja.' using errcode='23514';
    end if;
    return new;
end;
$function$;
drop trigger if exists rmenu_coupon_usage_same_store on public.coupon_usages;
create trigger rmenu_coupon_usage_same_store before insert or update of order_id,coupon_id
on public.coupon_usages for each row execute function public.rmenu_check_coupon_usage_store();
revoke all on function public.rmenu_check_coupon_usage_store() from public,anon,authenticated;
grant execute on function public.rmenu_check_coupon_usage_store() to service_role;

-- Mantém a contagem exclusivamente no trigger, sem incremento duplo no RPC.
create or replace function public.increment_coupon_usage() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
    update public.coupons set usage_count=coalesce(usage_count,0)+1 where id=new.coupon_id;
    return new;
end;
$function$;
alter function public.update_coupons_updated_at() set search_path = '';

create or replace function public.rmenu_create_order_atomic(p_payload jsonb,p_request_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
    store_id_value uuid;
    attempt_key text;
    store_row public.store_config%rowtype;
    existing_order public.orders%rowtype;
    coupon_row public.coupons%rowtype;
    zone_row public.delivery_zones%rowtype;
    new_order public.orders%rowtype;
    item jsonb;
    half_item jsonb;
    items jsonb;
    product_id_value uuid;
    quantity_value integer;
    price_value numeric;
    item_value numeric;
    subtotal_value numeric := 0;
    fee_value numeric := 0;
    discount_value_computed numeric := 0;
    total_value numeric;
    coupon_code_value text;
    name_value text;
    phone_value text;
    delivery_value text;
    payment_value text;
    address_value text;
    complement_value text;
    table_value integer;
    change_value numeric;
    notes_value text;
begin
    if jsonb_typeof(p_payload) is distinct from 'object'
       or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Payload/hash da tentativa inválido.' using errcode='22023';
    end if;
    store_id_value := (p_payload->>'store_id')::uuid;
    attempt_key := ((p_payload->>'idempotency_key')::uuid)::text;
    if store_id_value is null or attempt_key is null then
        raise exception 'Loja e chave da tentativa são obrigatórias.' using errcode='22023';
    end if;

    -- Serializa por loja antes de conferir tentativa e reservar cupom.
    -- Preserva o trigger e o índice únicos de numeração existentes.
    select * into store_row from public.store_config where id=store_id_value for update;
    if not found then raise exception 'Loja não encontrada.' using errcode='22023'; end if;
    select * into existing_order from public.orders
    where store_id=store_id_value and idempotency_key=attempt_key;
    if found then
        if existing_order.request_hash is null then
            raise exception 'Tentativa pertence a pedido legado; não é possível confirmar replay seguro.' using errcode='22023';
        end if;
        if existing_order.request_hash is distinct from p_request_hash then
            raise exception 'Chave da tentativa já usada para outro conteúdo.' using errcode='22023';
        end if;
        if existing_order.status='cancelled' or existing_order.expected_item_count is null
           or existing_order.expected_item_count<>(select count(*) from public.order_items where order_id=existing_order.id) then
            raise exception 'Pedido anterior cancelado ou incompleto; não será retornado como sucesso.' using errcode='22023';
        end if;
        return jsonb_build_object('order_id',existing_order.id,'order_number',existing_order.order_number,
            'subtotal',existing_order.subtotal,'delivery_fee',existing_order.delivery_fee,
            'discount_value',coalesce(existing_order.discount_value,0),'total',existing_order.total,'replayed',true);
    end if;

    items := p_payload->'items';
    if jsonb_typeof(items) is distinct from 'array' then
        raise exception 'Itens devem ser uma lista.' using errcode='22023';
    end if;
    if jsonb_array_length(items) not between 1 and 100 then
        raise exception 'Quantidade de itens inválida.' using errcode='22023';
    end if;
    name_value := btrim(p_payload->>'customer_name');
    phone_value := regexp_replace(coalesce(p_payload->>'customer_phone',''),'[^0-9]','','g');
    delivery_value := p_payload->>'delivery_type';
    payment_value := p_payload->>'payment_method';
    notes_value := nullif(btrim(p_payload->>'notes'),'');
    if name_value is null or length(name_value) not between 3 and 100
       or delivery_value is null or delivery_value not in ('delivery','pickup','table')
       or payment_value is null or payment_value not in ('pix','card','cash')
       or length(phone_value)>15 or length(notes_value)>500 then
        raise exception 'Dados do cliente/pedido inválidos.' using errcode='22023';
    end if;
    if delivery_value<>'table' and length(phone_value)<10 then
        raise exception 'Telefone obrigatório.' using errcode='22023';
    end if;
    if (payment_value='pix' and store_row.accept_pix is distinct from true)
       or (payment_value='cash' and store_row.accept_cash is distinct from true)
       or (payment_value='card' and store_row.accept_card is distinct from true) then
        raise exception 'Forma de pagamento não disponível.' using errcode='22023';
    end if;
    if delivery_value='delivery' then
        address_value := nullif(btrim(p_payload->>'delivery_address'),'');
        complement_value := nullif(btrim(p_payload->>'address_complement'),'');
        if address_value is null or length(address_value)>300 or length(complement_value)>300 then
            raise exception 'Endereço/complemento inválido.' using errcode='22023';
        end if;
        select * into zone_row from public.delivery_zones
        where id=(p_payload->>'delivery_zone_id')::uuid and store_id=store_id_value and is_active=true for share;
        if not found or zone_row.price<0 or zone_row.price::text in ('NaN','Infinity','-Infinity') then
            raise exception 'Zona de entrega indisponível.' using errcode='22023';
        end if;
        fee_value := round(zone_row.price,2);
    elsif delivery_value='table' then
        table_value := (p_payload->>'table_number')::integer;
        if table_value is null or table_value<1 or table_value>coalesce(store_row.table_count,0)
           or store_row.table_mode_enabled is distinct from true or store_row.table_mode_available is distinct from true then
            raise exception 'Mesa indisponível.' using errcode='22023';
        end if;
    end if;

    for item in select value from jsonb_array_elements(items) loop
        quantity_value := (item->>'quantity')::integer;
        price_value := (item->>'unit_price')::numeric;
        item_value := (item->>'item_total')::numeric;
        if jsonb_typeof(item) is distinct from 'object' or quantity_value is null
           or quantity_value not between 1 and 100 or price_value is null or price_value<0
           or price_value::text in ('NaN','Infinity','-Infinity') or item_value::text in ('NaN','Infinity','-Infinity')
           or price_value<>round(price_value,2) or item_value is null
           or item_value<>price_value*quantity_value
           or nullif(btrim(item->>'product_name'),'') is null or length(item->>'product_name')>200
           or jsonb_typeof(item->'selected_options') is distinct from 'array'
           or length(item->>'observations')>500 then
            raise exception 'Snapshot de item inválido.' using errcode='22023';
        end if;
        subtotal_value := subtotal_value+item_value;
    end loop;
    if subtotal_value<coalesce(store_row.minimum_order,0) then
        raise exception 'Pedido abaixo do valor mínimo da loja.' using errcode='22023';
    end if;

    coupon_code_value := nullif(upper(btrim(p_payload->>'coupon_code')),'');
    if coupon_code_value is not null then
        select * into coupon_row from public.coupons
        where store_id=store_id_value and code=coupon_code_value for update;
        if not found or coupon_row.is_active is distinct from true
           or coupon_row.valid_from>now() or (coupon_row.valid_until is not null and now()>=coupon_row.valid_until)
           or (coupon_row.usage_limit is not null and coupon_row.usage_count>=coupon_row.usage_limit)
           or subtotal_value<coalesce(coupon_row.min_order_value,0)
           or (coupon_row.applies_to='delivery' and delivery_value<>'delivery')
           or (coupon_row.applies_to='pickup' and delivery_value<>'pickup') then
            raise exception 'Cupom indisponível para este pedido.' using errcode='22023';
        end if;
        if coupon_row.applies_to='first_purchase' and (
            length(phone_value)<10 or exists (
                select 1 from public.orders where store_id=store_id_value and customer_phone=phone_value and status<>'cancelled'
            )
        ) then
            raise exception 'Cupom válido apenas para primeira compra.' using errcode='22023';
        end if;
        if coupon_row.discount_value<0 or (coupon_row.discount_type='percentage' and coupon_row.discount_value>100)
           or coupon_row.max_discount_value<0
           or coupon_row.discount_value::text in ('NaN','Infinity','-Infinity')
           or coupon_row.max_discount_value::text in ('NaN','Infinity','-Infinity') then
            raise exception 'Configuração de desconto inválida.' using errcode='22023';
        end if;
        case coupon_row.discount_type
            when 'fixed' then discount_value_computed := least(subtotal_value,coupon_row.discount_value);
            when 'percentage' then
                discount_value_computed := round(subtotal_value*coupon_row.discount_value/100,2);
                if coupon_row.max_discount_value is not null then
                    discount_value_computed := least(discount_value_computed,coupon_row.max_discount_value);
                end if;
            when 'free_delivery' then
                if delivery_value<>'delivery' then raise exception 'Frete grátis exige entrega.' using errcode='22023'; end if;
                discount_value_computed := fee_value;
            else raise exception 'Tipo de cupom inválido.' using errcode='22023';
        end case;
        discount_value_computed := round(discount_value_computed,2);
    end if;
    total_value := subtotal_value+fee_value-discount_value_computed;
    if total_value<0 or (p_payload->>'total') is null
       or ((p_payload->>'total')::numeric)::text in ('NaN','Infinity','-Infinity')
       or (p_payload->>'total')::numeric<>total_value then
        raise exception 'Valores do pedido desatualizados.' using errcode='22023';
    end if;
    if payment_value='cash' then
        change_value := nullif((p_payload->>'change_for')::numeric,0);
        if change_value<total_value or change_value::text in ('NaN','Infinity','-Infinity') then
            raise exception 'Troco inválido ou menor que o total.' using errcode='22023';
        end if;
    end if;

    insert into public.orders(store_id,idempotency_key,request_hash,expected_item_count,handoff_status,
        customer_name,customer_phone,delivery_type,table_number,delivery_zone_id,delivery_zone_name,
        delivery_address,address_complement,payment_method,change_for,subtotal,delivery_fee,discount_value,coupon_code,total,notes)
    values(store_id_value,attempt_key,p_request_hash,jsonb_array_length(items),'pending_handoff',
        name_value,phone_value,delivery_value,table_value,zone_row.id,zone_row.name,address_value,complement_value,
        payment_value,change_value,subtotal_value,fee_value,discount_value_computed,coupon_code_value,total_value,notes_value)
    returning * into new_order;

    for item in select value from jsonb_array_elements(items) loop
        product_id_value := (item->>'product_id')::uuid;
        if product_id_value is null or not exists (
            select 1 from public.products where id=product_id_value and store_id=store_id_value and is_available=true
        ) then
            raise exception 'Produto indisponível ou de outra loja.' using errcode='22023';
        end if;
        if coalesce((item->>'is_half_half')::boolean,false) then
            if jsonb_typeof(item->'half_half_items') is distinct from 'array' then
                raise exception 'Sabores inválidos.' using errcode='22023';
            end if;
            if jsonb_array_length(item->'half_half_items')<>2 then
                raise exception 'Pedido meio a meio exige dois sabores.' using errcode='22023';
            end if;
            for half_item in select value from jsonb_array_elements(item->'half_half_items') loop
                if not exists (select 1 from public.products
                    where id=(half_item->>'product_id')::uuid and store_id=store_id_value and is_available=true and allows_half_half=true) then
                    raise exception 'Sabor indisponível ou de outra loja.' using errcode='22023';
                end if;
            end loop;
        end if;
        insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,selected_options,
            observations,is_half_half,half_half_items,item_total)
        values(new_order.id,product_id_value,btrim(item->>'product_name'),(item->>'quantity')::integer,
            (item->>'unit_price')::numeric,item->'selected_options',nullif(btrim(item->>'observations'),''),
            coalesce((item->>'is_half_half')::boolean,false),
            case when coalesce((item->>'is_half_half')::boolean,false) then item->'half_half_items' else null end,
            (item->>'item_total')::numeric);
    end loop;
    if coupon_code_value is not null then
        insert into public.coupon_usages(coupon_id,order_id,customer_phone,discount_applied)
        values(coupon_row.id,new_order.id,phone_value,discount_value_computed);
    end if;
    return jsonb_build_object('order_id',new_order.id,'order_number',new_order.order_number,
        'subtotal',subtotal_value,'delivery_fee',fee_value,'discount_value',discount_value_computed,
        'total',total_value,'replayed',false);
end;
$function$;
revoke all on function public.rmenu_create_order_atomic(jsonb,text) from public,anon,authenticated;
grant execute on function public.rmenu_create_order_atomic(jsonb,text) to service_role;
commit;
