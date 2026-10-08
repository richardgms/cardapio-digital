-- Etapa 2A: fechar escrita anônima e escrita entre lojas.
-- Execute o arquivo completo no SQL Editor. A transação desfaz tudo se falhar.
-- Não altera dados, preços, pedidos, triggers, índices ou leitura pública.
-- A configuração pública ainda terá uma projeção específica em etapa posterior.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
    target record;
    existing_policy record;
begin
    -- O código usa store_config.id = auth.users.id. Não assumir isso silenciosamente.
    if exists (
        select 1 from public.store_config s
        where not exists (select 1 from auth.users u where u.id = s.id)
    ) then
        raise exception 'Existem lojas sem proprietário Auth correspondente. Conferir ownership antes de aplicar esta migração.';
    end if;

    for target in
        select * from (values
            ('store_config', 'id = (select auth.uid())', 'id = (select auth.uid())'),
            ('categories', 'store_id = (select auth.uid())', 'store_id = (select auth.uid())'),
            ('delivery_zones', 'store_id = (select auth.uid())', 'store_id = (select auth.uid())'),
            ('products', 'store_id = (select auth.uid())',
                'store_id = (select auth.uid()) and (category_id is null or exists (select 1 from public.categories c where c.id = products.category_id and c.store_id = (select auth.uid())))'),
            ('business_hours', 'store_config_id = (select auth.uid())', 'store_config_id = (select auth.uid())'),
            ('business_hour_periods',
                'exists (select 1 from public.business_hours h where h.id = business_hour_periods.business_hour_id and h.store_config_id = (select auth.uid()))',
                'exists (select 1 from public.business_hours h where h.id = business_hour_periods.business_hour_id and h.store_config_id = (select auth.uid()))'),
            ('product_option_groups',
                'exists (select 1 from public.products p where p.id = product_option_groups.product_id and p.store_id = (select auth.uid()))',
                'exists (select 1 from public.products p where p.id = product_option_groups.product_id and p.store_id = (select auth.uid()))'),
            ('product_options',
                'exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = product_options.group_id and p.store_id = (select auth.uid()))',
                'exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = product_options.group_id and p.store_id = (select auth.uid()))'),
            ('group_size_rules',
                'exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = group_size_rules.group_id and p.store_id = (select auth.uid()))',
                'exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = group_size_rules.group_id and p.store_id = (select auth.uid())) and (size_option_id is null or exists (select 1 from public.product_options o join public.product_option_groups g on g.id = o.group_id join public.products p on p.id = g.product_id where o.id = group_size_rules.size_option_id and p.store_id = (select auth.uid()))) and (source_group_id is null or exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = group_size_rules.source_group_id and p.store_id = (select auth.uid())))')
        ) as t(table_name, owner_condition, write_condition)
    loop
        -- Falhar se a tabela/coluna esperada não existir, antes do commit.
        execute format('alter table public.%I enable row level security', target.table_name);

        -- Remover permissões de escrita antigas; SELECT é preservado.
        for existing_policy in
            select policyname from pg_policies
            where schemaname = 'public' and tablename = target.table_name and cmd <> 'SELECT'
        loop
            execute format('drop policy %I on public.%I', existing_policy.policyname, target.table_name);
        end loop;

        -- Clientes autenticados também podem consultar o catálogo público de outra loja.
        execute format('drop policy if exists rmenu_public_read on public.%I', target.table_name);
        execute format('create policy rmenu_public_read on public.%I for select to anon, authenticated using (true)', target.table_name);

        execute format(
            'create policy rmenu_owner_access on public.%I for all to authenticated using (%s) with check (%s)',
            target.table_name, target.owner_condition, target.write_condition
        );

        -- Barreiras restritivas: uma futura política permissiva ampla não abre a escrita.
        execute format(
            'create policy rmenu_write_insert_guard on public.%I as restrictive for insert to public with check (%s)',
            target.table_name, target.write_condition
        );
        execute format(
            'create policy rmenu_write_update_guard on public.%I as restrictive for update to public using (%s) with check (%s)',
            target.table_name, target.owner_condition, target.write_condition
        );
        execute format(
            'create policy rmenu_write_delete_guard on public.%I as restrictive for delete to public using (%s)',
            target.table_name, target.owner_condition
        );

        -- Privilégios de tabela inteira não são protegidos por RLS.
        execute format('revoke all privileges on table public.%I from public, anon, authenticated', target.table_name);
        execute format('grant select on table public.%I to anon', target.table_name);
        execute format('grant select, insert, update, delete on table public.%I to authenticated', target.table_name);
        -- O superadmin continua usando ações autenticadas no servidor com service_role.
        execute format('grant all privileges on table public.%I to service_role', target.table_name);
    end loop;
end;
$migration$;

commit;
