-- 1. Remover políticas anteriores (Public ou antigas)
DROP POLICY IF EXISTS "Public Access" ON "public"."categories";
DROP POLICY IF EXISTS "Admin Access" ON "public"."categories";
DROP POLICY IF EXISTS "Allow authenticated insert" ON "public"."categories";
DROP POLICY IF EXISTS "Allow authenticated update" ON "public"."categories";
DROP POLICY IF EXISTS "Allow authenticated delete" ON "public"."categories";
DROP POLICY IF EXISTS "Authenticated Full Access" ON "public"."categories";

-- 2. Garantir que RLS está habilitado
ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

-- 3. Criar a política correta (Apenas usuários autenticados)
-- Esta política permite que qualquer usuário logado (auth.role() = 'authenticated') gerencie categorias.
-- Idealmente, num futuro, você restringiria isso por role no metadata do JWT.

CREATE POLICY "Authenticated Users CRUD"
ON "public"."categories"
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Opcional: Política de leitura pública (se o cardápio for público)
-- Se usuários deslogados precisarem VER as categorias no cardápio:
CREATE POLICY "Public Read Access"
ON "public"."categories"
FOR SELECT
TO anon
USING (true);
