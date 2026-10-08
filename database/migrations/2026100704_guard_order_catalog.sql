-- Etapa 2D: catálogo consistente entre cálculo no servidor e gravação.
-- Não ativa o checkout nem a impressão. Aplicar depois de 2026100703.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
    if to_regprocedure('public.rmenu_create_order_atomic(jsonb,text)') is null then
        raise exception 'Aplicar a etapa 2C antes desta migração.';
    end if;
end;
$preflight$;

-- Projeção privada, sem endereço do lojista, telefone ou admin_email.
-- Ler a projeção inteira no servidor, precificar e devolver SEM modificá-la.
create or replace function public.rmenu_order_catalog_state(p_store_id uuid, p_product_ids uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $function$
    select jsonb_build_object(
        'store', (select jsonb_build_object(
            'id',s.id,'is_open',s.is_open,'auto_schedule_enabled',s.auto_schedule_enabled,
            'minimum_order',s.minimum_order,'accept_pix',s.accept_pix,'accept_card',s.accept_card,'accept_cash',s.accept_cash,
            'table_mode_available',s.table_mode_available,'table_mode_enabled',s.table_mode_enabled,'table_count',s.table_count
        ) from public.store_config s where s.id=p_store_id),
        'products',coalesce((select jsonb_agg(jsonb_build_object(
            'id',p.id,'store_id',p.store_id,'category_id',p.category_id,'name',p.name,
            'price',p.price,'promo_price',p.promo_price,'is_available',p.is_available,'allows_half_half',p.allows_half_half,
            'option_groups',coalesce((select jsonb_agg(jsonb_build_object(
                'id',g.id,'product_id',g.product_id,'title',g.title,'is_required',g.is_required,
                'max_select',g.max_select,'pricing_mode',g.pricing_mode,'sort_order',g.sort_order,
                'options',coalesce((select jsonb_agg(jsonb_build_object(
                    'id',o.id,'group_id',o.group_id,'name',o.name,'price',o.price,'is_available',o.is_available
                ) order by o.id) from public.product_options o where o.group_id=g.id),'[]'::jsonb),
                'size_rules',coalesce((select jsonb_agg(jsonb_build_object(
                    'id',r.id,'group_id',r.group_id,'source_group_id',r.source_group_id,
                    'size_option_id',r.size_option_id,'max_select',r.max_select
                ) order by r.id) from public.group_size_rules r where r.group_id=g.id),'[]'::jsonb)
            ) order by g.id) from public.product_option_groups g where g.product_id=p.id),'[]'::jsonb)
        ) order by p.id) from public.products p where p.store_id=p_store_id and p.id=any(p_product_ids)),'[]'::jsonb),
        'hours',coalesce((select jsonb_agg(jsonb_build_object(
            'id',h.id,'store_config_id',h.store_config_id,'day_of_week',h.day_of_week,'is_open',h.is_open,
            'periods',coalesce((select jsonb_agg(jsonb_build_object(
                'id',b.id,'business_hour_id',b.business_hour_id,'open_time',b.open_time,'close_time',b.close_time
            ) order by b.id) from public.business_hour_periods b where b.business_hour_id=h.id),'[]'::jsonb)
        ) order by h.id) from public.business_hours h where h.store_config_id=p_store_id),'[]'::jsonb)
    );
$function$;
revoke all on function public.rmenu_order_catalog_state(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.rmenu_order_catalog_state(uuid,uuid[]) to service_role;

-- Helper determinístico: só a função de submissão escolhe o instante atual.
create or replace function public.rmenu_order_store_open(p_state jsonb,p_instant timestamptz)
returns boolean language sql immutable security invoker set search_path = '' as $function$
    select case
        when p_state->'store' is null or p_state->'store'='null'::jsonb then false
        when not coalesce((p_state->'store'->>'auto_schedule_enabled')::boolean,false)
            then coalesce((p_state->'store'->>'is_open')::boolean,false)
        else exists (
            select 1 from jsonb_array_elements(p_state->'hours') h,
                lateral jsonb_array_elements(h->'periods') b,
                lateral (select p_instant at time zone 'America/Sao_Paulo' as local_now) t
            where (h->>'is_open')::boolean is true and (
                ((h->>'day_of_week')::integer=extract(dow from t.local_now)::integer and (
                    ((b->>'open_time')::time < (b->>'close_time')::time
                        and t.local_now::time >= (b->>'open_time')::time and t.local_now::time < (b->>'close_time')::time)
                    or ((b->>'open_time')::time > (b->>'close_time')::time and t.local_now::time >= (b->>'open_time')::time)
                )) or (
                    (h->>'day_of_week')::integer=(extract(dow from t.local_now)::integer+6)%7
                    and (b->>'open_time')::time > (b->>'close_time')::time
                    and t.local_now::time < (b->>'close_time')::time
                )
            )
        ) end;
$function$;
revoke all on function public.rmenu_order_store_open(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.rmenu_order_store_open(jsonb,timestamptz) to service_role;

create or replace function public.rmenu_submit_order(p_payload jsonb,p_request_hash text,p_catalog_state jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
    store_id_value uuid;
    key_value text;
    product_ids uuid[];
    current_state jsonb;
begin
    if jsonb_typeof(p_payload) is distinct from 'object' or p_request_hash is null
        or p_request_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Payload/hash inválido.' using errcode='22023';
    end if;
    store_id_value := (p_payload->>'store_id')::uuid;
    key_value := ((p_payload->>'idempotency_key')::uuid)::text;
    perform 1 from public.store_config s where s.id=store_id_value for update;
    if not found then raise exception 'Loja indisponível.' using errcode='22023'; end if;

    -- Um replay válido não depende de catálogo, horário ou cupom atuais.
    -- A função atômica exige hash igual, todos os itens e pedido não cancelado.
    if exists(select 1 from public.orders o where o.store_id=store_id_value and o.idempotency_key=key_value) then
        return public.rmenu_create_order_atomic(p_payload,p_request_hash);
    end if;
    if jsonb_typeof(p_payload->'items') is distinct from 'array'
        or jsonb_array_length(p_payload->'items') not between 1 and 100 then
        raise exception 'Itens inválidos.' using errcode='22023';
    end if;
    select array_agg(distinct id order by id) into product_ids from (
        select (i->>'product_id')::uuid as id from jsonb_array_elements(p_payload->'items') i
        union all
        select (h->>'product_id')::uuid from jsonb_array_elements(p_payload->'items') i,
            lateral jsonb_array_elements(coalesce(nullif(i->'half_half_items','null'::jsonb),'[]'::jsonb)) h
    ) selected;
    if product_ids is null or array_position(product_ids,null) is not null or cardinality(product_ids)>300 then
        raise exception 'Produtos inválidos.' using errcode='22023';
    end if;

    -- FOR UPDATE nos pais também conflita com FK KEY SHARE: inserções e
    -- movimentações de filhos não podem criar opções/regras/períodos invisíveis.
    -- Ordem fixa para reduzir deadlocks. Em erro, o servidor mantém a chave.
    perform p.id from public.products p where p.store_id=store_id_value and p.id=any(product_ids) order by p.id for update;
    if (select count(*) from public.products p where p.store_id=store_id_value and p.id=any(product_ids)) <> cardinality(product_ids) then
        raise exception 'Produto indisponível ou de outra loja.' using errcode='22023';
    end if;
    perform g.id from public.product_option_groups g where g.product_id=any(product_ids) order by g.id for update;
    perform o.id from public.product_options o join public.product_option_groups g on g.id=o.group_id
        where g.product_id=any(product_ids) order by o.id for update of o;
    perform r.id from public.group_size_rules r join public.product_option_groups g on g.id=r.group_id
        where g.product_id=any(product_ids) order by r.id for update of r;
    perform h.id from public.business_hours h where h.store_config_id=store_id_value order by h.id for update;
    perform b.id from public.business_hour_periods b join public.business_hours h on h.id=b.business_hour_id
        where h.store_config_id=store_id_value order by b.id for update of b;

    current_state := public.rmenu_order_catalog_state(store_id_value,product_ids);
    if current_state is distinct from p_catalog_state then
        raise exception 'O cardápio mudou. Atualize o carrinho e confira os valores.' using errcode='22023';
    end if;
    if not public.rmenu_order_store_open(current_state,clock_timestamp()) then
        raise exception 'A loja está fechada no momento.' using errcode='22023';
    end if;
    return public.rmenu_create_order_atomic(p_payload,p_request_hash);
end;
$function$;
revoke all on function public.rmenu_submit_order(jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.rmenu_submit_order(jsonb,text,jsonb) to service_role;
commit;
