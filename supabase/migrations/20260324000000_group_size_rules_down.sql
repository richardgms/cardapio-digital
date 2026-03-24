-- ============================================================
-- DOWN: group_size_rules
-- Rollback completo — remove tabela, indexes e policies.
-- CASCADE cuida de dependências.
-- ============================================================

DROP TABLE IF EXISTS group_size_rules CASCADE;
