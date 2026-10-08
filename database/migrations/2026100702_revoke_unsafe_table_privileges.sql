-- Etapa 2B: privilégios de tabela inteira não são limitados por RLS.
-- Não altera dados, políticas de linha, CRUD, triggers ou numeração.
-- Executar o arquivo inteiro no SQL Editor. Migração reaplicável.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
    target_tables constant text[] := array[
        'admin_impersonation_logs', 'business_hour_periods', 'business_hours',
        'categories', 'coupon_usages', 'coupons', 'delivery_zones',
        'group_size_rules', 'notification_reads', 'notifications',
        'order_items', 'orders', 'product_option_groups', 'product_options',
        'products', 'store_config'
    ];
    table_name text;
    client_role text;
    table_privilege text;
begin
    -- Conferir todas as tabelas antes da primeira mudança.
    foreach table_name in array target_tables loop
        if not exists (
            select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = table_name
              and c.relkind = 'r' and c.relrowsecurity
        ) then
            raise exception 'Tabela public.% ausente, incompatível ou sem RLS; migração abortada.', table_name;
        end if;
    end loop;

    foreach table_name in array target_tables loop
        execute format(
            'revoke truncate, trigger, references on table public.%I from public, anon, authenticated',
            table_name
        );
        -- Verificar também privilégios herdados de outros papéis.
        foreach client_role in array array['anon', 'authenticated'] loop
            foreach table_privilege in array array['TRUNCATE', 'TRIGGER', 'REFERENCES'] loop
                if has_table_privilege(client_role, format('public.%I', table_name), table_privilege) then
                    raise exception 'Privilégio % ainda herdado por % em public.%; migração abortada.',
                        table_privilege, client_role, table_name;
                end if;
            end loop;
        end loop;
    end loop;
end;
$migration$;

commit;
