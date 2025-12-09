-- 1. Garantir que exite a categoria Hambúrgueres
INSERT INTO categories (name, sort_order)
SELECT 'Hambúrgueres', 20
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Hambúrgueres');

-- 2. Inserir um Hambúrguer de Exemplo se não houver nenhum
WITH burger_cat AS (
  SELECT id FROM categories WHERE name = 'Hambúrgueres' LIMIT 1
)
INSERT INTO products (name, description, price, category_id, allows_half_half, is_available, image_url)
SELECT 
  'X-Bacon Artesanal', 
  'Pão brioche, burger 180g, muito bacon crocante e queijo cheddar.', 
  35.00, 
  (SELECT id FROM burger_cat), 
  false, 
  true, 
  'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=800&q=80'
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE category_id = (SELECT id FROM burger_cat)
);

-- 3. Adicionar Opções para TODOS os Hambúrgueres (ou para o recém criado)
DO $$
DECLARE
  prod RECORD;
  group_ponto_id UUID;
  group_adicionais_id UUID;
BEGIN
  -- Para cada produto na categoria Hambúrgueres
  FOR prod IN 
    SELECT p.id, p.name 
    FROM products p 
    JOIN categories c ON p.category_id = c.id 
    WHERE c.name = 'Hambúrgueres'
  LOOP
    
    -- GRUPO 1: Ponto da Carne (Obrigatório, Escolha Única)
    -- Verifica se já existe para evitar duplicata (opcional, mas bom pra re-run)
    IF NOT EXISTS (SELECT 1 FROM product_option_groups WHERE product_id = prod.id AND title = 'Ponto da Carne') THEN
      INSERT INTO product_option_groups (product_id, title, is_required, max_select, sort_order)
      VALUES (prod.id, 'Ponto da Carne', true, 1, 1)
      RETURNING id INTO group_ponto_id;

      -- Inserir opções do grupo Ponto da Carne
      INSERT INTO product_options (group_id, name, price, sort_order) VALUES
      (group_ponto_id, 'Bem Passado', 0, 1),
      (group_ponto_id, 'Ao Ponto', 0, 2),
      (group_ponto_id, 'Mal Passado', 0, 3);
    END IF;

    -- GRUPO 2: Adicionais (Opcional, Múltipla Escolha)
    IF NOT EXISTS (SELECT 1 FROM product_option_groups WHERE product_id = prod.id AND title = 'Turbine seu Burger') THEN
      INSERT INTO product_option_groups (product_id, title, is_required, max_select, sort_order)
      VALUES (prod.id, 'Turbine seu Burger', false, 5, 2)
      RETURNING id INTO group_adicionais_id;

      -- Inserir opções do grupo Adicionais
      INSERT INTO product_options (group_id, name, price, sort_order) VALUES
      (group_adicionais_id, 'Bacon Extra', 5.00, 1),
      (group_adicionais_id, 'Queijo Extra', 4.00, 2),
      (group_adicionais_id, 'Ovo', 3.00, 3),
      (group_adicionais_id, 'Maionese da Casa', 2.00, 4);
    END IF;

  END LOOP;
END $$;
