-- ================================================================
-- ROLLBACK: orders + order_items
-- Reverte completamente a migracao migrate-orders-up.sql
--
-- INSTRUCOES: Cole este SQL no Supabase SQL Editor e execute.
-- ================================================================

BEGIN;

-- Remover da publication Realtime
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.orders;

-- Dropar tabelas (order_items primeiro por causa da FK)
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

-- Dropar funcoes auxiliares
DROP FUNCTION IF EXISTS public.set_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

COMMIT;

-- ================================================================
-- ROLLBACK CONCLUIDO
-- Nenhuma tabela existente foi afetada.
-- ================================================================
