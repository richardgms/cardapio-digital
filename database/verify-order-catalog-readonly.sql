-- Somente leitura: confere a instalação da etapa 2D.
with required(signature) as (
    values ('public.rmenu_order_catalog_state(uuid,uuid[])'),
           ('public.rmenu_order_store_open(jsonb,timestamp with time zone)'),
           ('public.rmenu_submit_order(jsonb,text,jsonb)')
), installed as (
    select r.signature,p.oid,p.prosecdef,p.proconfig from required r
    left join pg_proc p on p.oid=to_regprocedure(r.signature)
)
select jsonb_build_object(
    'functions', (select jsonb_agg(jsonb_build_object(
        'signature',signature,'exists',oid is not null,'security_definer',prosecdef,
        'configuration',proconfig,
        'anon_execute',has_function_privilege('anon',oid,'EXECUTE'),
        'authenticated_execute',has_function_privilege('authenticated',oid,'EXECUTE'),
        'service_role_execute',has_function_privilege('service_role',oid,'EXECUTE')
    ) order by signature) from installed),
    'missing_functions',coalesce((select jsonb_agg(signature order by signature) from installed where oid is null),'[]'::jsonb)
) as catalog_verification;
