-- 1. Criar categoria Pizzas se não existir
INSERT INTO categories (name, sort_order)
SELECT 'Pizzas', 10
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Pizzas');

-- 2. Inserir Pizzas (usando subquery para pegar o ID da categoria)
WITH pizza_cat AS (
  SELECT id FROM categories WHERE name = 'Pizzas' LIMIT 1
)
INSERT INTO products (name, description, price, category_id, allows_half_half, is_available, image_url)
VALUES 
  (
    'Pizza Calabresa', 
    'Molho de tomate, mussarela, calabresa fatiada e cebola.', 
    45.00, 
    (SELECT id FROM pizza_cat), 
    true, 
    true, 
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80'
  ),
  (
    'Pizza Mussarela', 
    'Molho de tomate, muita mussarela e orégano.', 
    40.00, 
    (SELECT id FROM pizza_cat), 
    true, 
    true, 
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80'
  ),
  (
    'Pizza Portuguesa', 
    'Molho, mussarela, presunto, ovos, cebola e azeitona.', 
    50.00, 
    (SELECT id FROM pizza_cat), 
    true, 
    true, 
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80'
  );
