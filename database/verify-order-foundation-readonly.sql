-- Executar depois da migração 2026100702 e trazer foundation_verification.
-- Somente SELECT: não apaga, corrige ou altera nenhum registro.
-- Retorna contagens e permissões; não retorna dados pessoais ou IDs de pedidos.

with target_names(table_name) as (
    values ('admin_impersonation_logs'), ('business_hour_periods'), ('business_hours'),
           ('categories'), ('coupon_usages'), ('coupons'), ('delivery_zones'),
           ('group_size_rules'), ('notification_reads'), ('notifications'),
           ('order_items'), ('orders'), ('product_option_groups'), ('product_options'),
           ('products'), ('store_config')
), target_tables as (
    select t.table_name, c.oid, c.relrowsecurity
    from target_names t
    join pg_namespace n on n.nspname = 'public'
    join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name and c.relkind = 'r'
), unexpected_privileges as (
    select t.table_name, r.role_name, p.privilege
    from target_tables t
    cross join (values ('anon'), ('authenticated')) r(role_name)
    cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) p(privilege)
    where has_table_privilege(r.role_name, t.oid, p.privilege)
), recorded_usages as (
    select coupon_id, count(*) as recorded_count from public.coupon_usages group by coupon_id
), duplicate_orders as (
    select order_id from public.coupon_usages group by order_id having count(*) > 1
)
select jsonb_build_object(
    'tables_checked', (select count(*) from target_tables),
    'missing_tables', coalesce((
        select jsonb_agg(table_name order by table_name) from target_names
        where table_name not in (select table_name from target_tables)
    ), '[]'::jsonb),
    'tables_without_rls', coalesce((
        select jsonb_agg(table_name order by table_name) from target_tables where not relrowsecurity
    ), '[]'::jsonb),
    'unexpected_client_table_privileges', coalesce((
        select jsonb_agg(to_jsonb(p) order by table_name, role_name, privilege) from unexpected_privileges p
    ), '[]'::jsonb),
    'coupon_data', jsonb_build_object(
        'coupons_count', (select count(*) from public.coupons),
        'usage_rows_count', (select count(*) from public.coupon_usages),
        'orders_with_multiple_coupon_usages', (select count(*) from duplicate_orders),
        'usages_linking_different_stores', (
            select count(*) from public.coupon_usages u
            join public.coupons c on c.id = u.coupon_id
            join public.orders o on o.id = u.order_id
            where c.store_id is distinct from o.store_id
        ),
        'null_usage_counters', (select count(*) from public.coupons where usage_count is null),
        'negative_usage_counters', (select count(*) from public.coupons where usage_count < 0),
        'negative_usage_limits', (select count(*) from public.coupons where usage_limit < 0),
        'coupons_above_usage_limit', (
            select count(*) from public.coupons where usage_limit is not null and usage_count > usage_limit
        ),
        'counters_differing_from_recorded_usages', (
            select count(*) from public.coupons c left join recorded_usages u on u.coupon_id = c.id
            where c.usage_count is distinct from coalesce(u.recorded_count, 0)
        ),
        'negative_discounts_in_usage', (select count(*) from public.coupon_usages where discount_applied < 0)
    )
) as foundation_verification;
