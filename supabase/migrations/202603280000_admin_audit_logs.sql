-- Tabela de logs para ações de impersonação
CREATE TABLE admin_impersonation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL, -- O Super Admin que fez a ação
    target_store_id UUID NOT NULL, -- A loja que estava sendo editada
    action_type TEXT NOT NULL, -- create, update, delete, toggle
    entity_name TEXT NOT NULL, -- products, config, categories
    payload JSONB, -- O que foi alterado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS
ALTER TABLE admin_impersonation_logs ENABLE ROW LEVEL SECURITY;

-- Política: Somente Super Admin pode ler os logs
CREATE POLICY "Super Admins can view logs" ON admin_impersonation_logs
    FOR SELECT
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'richardgms001@gmail.com');

-- Política: NINGUÉM pode alterar ou deletar logs (imutabilidade)
CREATE POLICY "No one can update logs" ON admin_impersonation_logs FOR UPDATE USING (false);
CREATE POLICY "No one can delete logs" ON admin_impersonation_logs FOR DELETE USING (false);
