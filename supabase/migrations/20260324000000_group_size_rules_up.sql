-- ============================================================
-- UP: group_size_rules
-- Regras de max_select por tamanho para grupos de opções.
-- Permite que marmitas G, por exemplo, aceitem 2 proteínas
-- enquanto P/M aceitam apenas 1.
-- ============================================================

CREATE TABLE group_size_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Grupo addon que receberá o limite condicional (ex: Proteínas)
    group_id        UUID NOT NULL
                      REFERENCES product_option_groups(id) ON DELETE CASCADE,

    -- Grupo replacement dono da opção de tamanho (ex: Tamanho)
    -- Necessário para distinguir regras quando o produto
    -- tiver mais de um grupo replacement no futuro.
    source_group_id UUID NOT NULL
                      REFERENCES product_option_groups(id) ON DELETE CASCADE,

    -- Opção de tamanho que ativa esta regra (ex: G)
    size_option_id  UUID NOT NULL
                      REFERENCES product_options(id) ON DELETE CASCADE,

    -- Limite máximo de seleções para este grupo quando este tamanho
    -- estiver selecionado. Valor 1–20 (domínio de negócio: marmita).
    max_select      INTEGER NOT NULL
                      CHECK (max_select > 0 AND max_select <= 20),

    created_at      TIMESTAMPTZ DEFAULT now(),

    -- Uma única regra por par (grupo, tamanho)
    UNIQUE (group_id, size_option_id)
);

-- ── Indexes manuais para FKs ────────────────────────────────
-- PostgreSQL NÃO cria índices automáticos para colunas FK.
-- Obrigatório para performance em joins e cascades.
CREATE INDEX idx_gsr_group_id        ON group_size_rules (group_id);
CREATE INDEX idx_gsr_source_group_id ON group_size_rules (source_group_id);
CREATE INDEX idx_gsr_size_option_id  ON group_size_rules (size_option_id);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE group_size_rules ENABLE ROW LEVEL SECURITY;

-- SELECT: público — dados de configuração do cardápio são públicos
-- (anon key pode ler, consistente com product_option_groups e product_options)
CREATE POLICY "public can read size rules"
    ON group_size_rules FOR SELECT
    USING (true);

-- INSERT: apenas o dono da loja pode criar regras para seus grupos.
-- Validação cross-tenant: navega group_id → product_option_groups
-- → products.store_id e compara com auth.uid().
CREATE POLICY "owner can insert size rules"
    ON group_size_rules FOR INSERT
    WITH CHECK (
        auth.uid() = (
            SELECT p.store_id
            FROM product_option_groups pog
            JOIN products p ON p.id = pog.product_id
            WHERE pog.id = group_size_rules.group_id
        )
    );

-- UPDATE: mesma validação de propriedade
CREATE POLICY "owner can update size rules"
    ON group_size_rules FOR UPDATE
    USING (
        auth.uid() = (
            SELECT p.store_id
            FROM product_option_groups pog
            JOIN products p ON p.id = pog.product_id
            WHERE pog.id = group_size_rules.group_id
        )
    )
    WITH CHECK (
        auth.uid() = (
            SELECT p.store_id
            FROM product_option_groups pog
            JOIN products p ON p.id = pog.product_id
            WHERE pog.id = group_size_rules.group_id
        )
    );

-- DELETE: mesma validação de propriedade
CREATE POLICY "owner can delete size rules"
    ON group_size_rules FOR DELETE
    USING (
        auth.uid() = (
            SELECT p.store_id
            FROM product_option_groups pog
            JOIN products p ON p.id = pog.product_id
            WHERE pog.id = group_size_rules.group_id
        )
    );

-- ── Smoke test (rodar após aplicar) ────────────────────────
-- Com anon key deve retornar [] sem erro (tabela vazia, não bloqueio):
--   SELECT * FROM group_size_rules LIMIT 1;
--
-- Com auth de store errada deve retornar código 42501 (RLS violation):
--   INSERT INTO group_size_rules (group_id, source_group_id, size_option_id, max_select)
--   VALUES ('<group_de_outra_loja>', '<source>', '<option>', 2);
