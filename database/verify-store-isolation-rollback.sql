-- Executar O ARQUIVO INTEIRO no SQL Editor do Supabase, com acesso administrativo.
-- Testa RLS com os papéis reais anon/authenticated e os UIDs de duas lojas.
-- Não utiliza service_role durante as tentativas de acesso dos clientes.
-- Só escreve produtos fictícios, indisponíveis e nunca confirmados no banco.
-- Nenhum produto existente é editado. ROLLBACK desfaz TODOS os dados de teste.
-- Isto valida o banco; não substitui um teste de ponta a ponta com dois logins.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create temporary table rmenu_rls_context (
    store_a uuid not null,
    store_b uuid not null,
    product_a uuid not null,
    product_b uuid not null
) on commit drop;
create temporary table rmenu_rls_results (
    check_name text primary key,
    passed boolean not null check (passed)
) on commit drop;

do $preflight$
declare
    owners uuid[];
begin
    if exists (
        select 1 from pg_roles
        where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls)
    ) then
        raise exception 'anon/authenticated têm bypass de RLS; interrompendo teste.';
    end if;
    if not exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'products'
          and c.relkind = 'r' and c.relrowsecurity
    ) then
        raise exception 'products não é uma tabela com RLS ativo; interrompendo teste.';
    end if;
    -- Triggers externos podem ter efeitos que ROLLBACK não consegue desfazer.
    -- O inventário atual não tem triggers de usuário nem regras em products.
    if exists (
        select 1 from pg_trigger where tgrelid = 'public.products'::regclass and not tgisinternal
    ) or exists (
        select 1 from pg_rewrite where ev_class = 'public.products'::regclass and ev_type <> '1'
    ) then
        raise exception 'products contém triggers/regras; revisar antes de executar este teste.';
    end if;
    select array_agg(id) into owners from (
        select s.id from public.store_config s join auth.users u on u.id = s.id
        order by s.id limit 2
    ) candidates;
    if coalesce(array_length(owners, 1), 0) <> 2 then
        raise exception 'São necessárias duas lojas com proprietários Auth para testar isolamento.';
    end if;
    insert into pg_temp.rmenu_rls_context values (owners[1], owners[2], gen_random_uuid(), gen_random_uuid());
end;
$preflight$;

insert into public.products (id, store_id, name, description, price, is_available)
select product_a, store_a, '__RMENU_RLS_TEST_ROLLBACK__', 'original', 1, false
from pg_temp.rmenu_rls_context
union all
select product_b, store_b, '__RMENU_RLS_TEST_ROLLBACK__', 'original', 1, false
from pg_temp.rmenu_rls_context;

grant select on pg_temp.rmenu_rls_context to anon, authenticated;
grant insert on pg_temp.rmenu_rls_results to anon, authenticated;

-- Cliente autenticado A: JWT simulado apenas nesta transação administrativa.
select set_config('request.jwt.claim.sub', store_a::text, true),
       set_config('request.jwt.claims', json_build_object('sub', store_a, 'role', 'authenticated')::text, true)
from pg_temp.rmenu_rls_context;
set local role authenticated;

do $store_a$
declare
    ctx record;
    affected integer;
    blocked boolean;
begin
    select * into strict ctx from pg_temp.rmenu_rls_context;
    if current_user <> 'authenticated' or auth.uid() is distinct from ctx.store_a then
        raise exception 'Papel/UID da loja A incorreto; teste inválido.';
    end if;
    update public.products set description = 'editado pelo dono A' where id = ctx.product_a;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Dono A não consegue editar seu produto.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_a_can_update_own_product', true);

    update public.products set description = 'acesso indevido A' where id = ctx.product_b;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FALHA: A alterou produto da loja B.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_a_cannot_update_store_b', true);

    delete from public.products where id = ctx.product_b;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FALHA: A excluiu produto da loja B.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_a_cannot_delete_store_b', true);

    blocked := false;
    begin
        insert into public.products (id, store_id, name, price, is_available)
        values (gen_random_uuid(), ctx.store_b, '__RMENU_RLS_TEST_ROLLBACK__', 1, false);
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked then raise exception 'FALHA: A inseriu produto na loja B.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_a_cannot_insert_into_store_b', true);

    blocked := false;
    begin
        update public.products set store_id = ctx.store_b where id = ctx.product_a;
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked then raise exception 'FALHA: A conseguiu mover seu produto para B.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_a_cannot_move_product_to_store_b', true);
end;
$store_a$;

reset role;
select set_config('request.jwt.claim.sub', store_b::text, true),
       set_config('request.jwt.claims', json_build_object('sub', store_b, 'role', 'authenticated')::text, true)
from pg_temp.rmenu_rls_context;
set local role authenticated;

do $store_b$
declare
    ctx record;
    affected integer;
begin
    select * into strict ctx from pg_temp.rmenu_rls_context;
    if current_user <> 'authenticated' or auth.uid() is distinct from ctx.store_b then
        raise exception 'Papel/UID da loja B incorreto; teste inválido.';
    end if;
    update public.products set description = 'editado pelo dono B' where id = ctx.product_b;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Dono B não consegue editar seu produto.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_b_can_update_own_product', true);

    update public.products set description = 'acesso indevido B' where id = ctx.product_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FALHA: B alterou produto da loja A.'; end if;
    insert into pg_temp.rmenu_rls_results values ('owner_b_cannot_update_store_a', true);
end;
$store_b$;

reset role;
select set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $visitor$
declare
    ctx record;
    visible integer;
    command text;
    blocked boolean;
    operation text;
begin
    select * into strict ctx from pg_temp.rmenu_rls_context;
    if current_user <> 'anon' or auth.uid() is not null then
        raise exception 'Papel/UID anônimo incorreto; teste inválido.';
    end if;
    select count(*) into visible from public.products where id in (ctx.product_a, ctx.product_b);
    if visible <> 2 then raise exception 'Leitura pública de produtos deixou de funcionar.'; end if;
    insert into pg_temp.rmenu_rls_results values ('anonymous_can_read_catalog', true);

    foreach operation in array array['insert', 'update', 'delete'] loop
        command := case operation
            when 'insert' then format('insert into public.products (id, store_id, name, price, is_available) values (gen_random_uuid(), %L::uuid, %L, 1, false)', ctx.store_a, '__RMENU_RLS_TEST_ROLLBACK__')
            when 'update' then format('update public.products set description = %L where id = %L::uuid', 'acesso indevido anon', ctx.product_a)
            when 'delete' then format('delete from public.products where id = %L::uuid', ctx.product_a)
        end;
        blocked := false;
        begin
            execute command;
        exception when insufficient_privilege then blocked := true;
        end;
        if not blocked then raise exception 'FALHA: visitante conseguiu executar %.', operation; end if;
        insert into pg_temp.rmenu_rls_results values ('anonymous_cannot_' || operation, true);
    end loop;
end;
$visitor$;

reset role;
do $final_check$
begin
    if (select count(*) from pg_temp.rmenu_rls_results) <> 11 then
        raise exception 'Teste incompleto: esperados 11 resultados.';
    end if;
    if not exists (
        select 1 from public.products p, pg_temp.rmenu_rls_context c
        where p.id = c.product_a and p.store_id = c.store_a and p.description = 'editado pelo dono A'
    ) or not exists (
        select 1 from public.products p, pg_temp.rmenu_rls_context c
        where p.id = c.product_b and p.store_id = c.store_b and p.description = 'editado pelo dono B'
    ) then
        raise exception 'Os produtos temporários sofreram alteração indevida.';
    end if;
end;
$final_check$;

select jsonb_build_object(
    'all_passed', bool_and(passed),
    'checks_count', count(*),
    'checks', jsonb_object_agg(check_name, passed)
) as isolation_verification
from pg_temp.rmenu_rls_results;

-- Não trocar por COMMIT. Não executar partes isoladamente.
rollback;
