-- Somente leitura, antes da etapa 3A. Não retorna dados de clientes.
select jsonb_build_object(
    'documents_installed',to_regprocedure('public.rmenu_capture_order_document(uuid)') is not null,
    'atomic_documents_missing_or_divergent',(select count(*) from public.orders o left join public.order_documents d on d.order_id=o.id
        where o.request_hash is not null and (d.order_id is null or d.store_id<>o.store_id or d.document_version<>o.document_version)),
    'document_rls',(select relrowsecurity from pg_class where oid='public.order_documents'::regclass),
    'document_trigger_installed',exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='rmenu_order_seal_at_commit' and tgenabled='O'),
    'queue_already_installed',to_regclass('public.print_jobs') is not null,
    'activation_performed_by_this_query',false
) as print_queue_preflight;
