-- ================================================================
-- VALIDACAO POS-MIGRACAO: orders + order_items
-- Execute apos migrate-orders-up.sql para confirmar que tudo esta correto.
-- ================================================================

-- 1. Verificar tabelas existem
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items')
ORDER BY table_name;

-- 2. Verificar RLS habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items');

-- 3. Verificar policies (deve ter APENAS store_owner_all em cada)
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items')
ORDER BY tablename, policyname;

-- 4. Verificar indices
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items')
ORDER BY tablename, indexname;

-- 5. Verificar triggers
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('orders', 'order_items')
ORDER BY event_object_table, trigger_name;

-- 6. Verificar constraints
SELECT tc.table_name, tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('orders', 'order_items')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 7. Verificar publication Realtime
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'orders';

-- 8. Verificar replica identity
SELECT relname, relreplident
FROM pg_class
WHERE relname = 'orders'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
-- relreplident = 'f' significa FULL (correto)

-- 9. Verificar funcoes
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('set_updated_at', 'set_order_number');
