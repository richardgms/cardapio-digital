-- Execute depois da migração 2026100701. Somente leitura; resultado único.
begin transaction read only;
select jsonb_build_object(
    'write_policies', (
        select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        from (
            select tablename, policyname, permissive, roles, cmd, qual, with_check
            from pg_policies
            where schemaname = 'public' and cmd <> 'SELECT'
              and tablename in ('store_config', 'categories', 'delivery_zones', 'products',
                                'business_hours', 'business_hour_periods',
                                'product_option_groups', 'product_options', 'group_size_rules')
            order by tablename, policyname
        ) p
    ),
    'unexpected_anon_write_grants', (
        select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
        from (
            select table_name, grantee, privilege_type
            from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name in ('store_config', 'categories', 'delivery_zones', 'products',
                                 'business_hours', 'business_hour_periods',
                                 'product_option_groups', 'product_options', 'group_size_rules')
              and grantee in ('PUBLIC', 'anon') and privilege_type <> 'SELECT'
        ) g
    ),
    'unexpected_authenticated_table_grants', (
        select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
        from (
            select table_name, grantee, privilege_type
            from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name in ('store_config', 'categories', 'delivery_zones', 'products',
                                 'business_hours', 'business_hour_periods',
                                 'product_option_groups', 'product_options', 'group_size_rules')
              and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        ) g
    )
) as verification;
rollback;
