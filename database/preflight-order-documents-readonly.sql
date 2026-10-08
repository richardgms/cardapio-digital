-- Somente contagens/metadados, sem dados de clientes e sem escrita.
select jsonb_build_object(
    'atomic_rpc_exists',to_regprocedure('public.rmenu_create_order_atomic(jsonb,text)') is not null,
    'submit_rpc_exists',to_regprocedure('public.rmenu_submit_order(jsonb,text,jsonb)') is not null,
    'tables_without_rls',(select count(*) from pg_class where oid in ('public.orders'::regclass,'public.order_items'::regclass) and not relrowsecurity),
    'numbering_trigger_matches',exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='trg_orders_set_number' and tgfoid=to_regprocedure('public.set_order_number()') and tgenabled='O'),
    'unique_store_number_exists',exists(select 1 from pg_constraint where conrelid='public.orders'::regclass and contype='u' and convalidated and pg_get_constraintdef(oid)='UNIQUE (store_id, order_number)'),
    'invalid_numbers',(select count(*) from public.orders where order_number<=0),
    'duplicate_numbers',(select count(*) from (select 1 from public.orders group by store_id,order_number having count(*)>1) d),
    'atomic_incomplete_or_divergent',(select count(*) from public.orders o where request_hash is not null and (
        expected_item_count is null or expected_item_count<>(select count(*) from public.order_items where order_id=o.id)
        or subtotal is distinct from (select sum(item_total) from public.order_items where order_id=o.id)
        or total is distinct from subtotal+delivery_fee-coalesce(discount_value,0)
        or exists(select 1 from public.order_items i where i.order_id=o.id and (
            item_total is distinct from quantity*unit_price or unit_price<0 or item_total<0
            or unit_price::text in ('NaN','Infinity','-Infinity') or item_total::text in ('NaN','Infinity','-Infinity')
            or jsonb_typeof(selected_options) is distinct from 'array'))
    )),
    'legacy_without_items_preserved',(select count(*) from public.orders o where request_hash is null and not exists(select 1 from public.order_items where order_id=o.id)),
    'automatic_printing_activated',false
) as document_preflight;
