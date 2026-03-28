-- ================================================================
-- MIGRACAO: orders + order_items (UP)
-- Plano: PLANO_ORDERS_SCHEMA.md v2 (Staff/QA aprovado)
-- Data: 2026-03-27
--
-- INSTRUCOES: Cole este SQL inteiro no Supabase SQL Editor e execute.
-- Toda a migracao roda em uma unica transacao.
-- ================================================================

BEGIN;

-- ── Fase 1.1: Funcao updated_at (reutilizavel) ──────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── Fase 1.2: Funcao order_number (auto-incremento por loja) ────

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  next_number integer;
BEGIN
  -- Lock na row da store_config para serializar insercoes concorrentes
  PERFORM 1 FROM public.store_config WHERE id = NEW.store_id FOR UPDATE;

  SELECT COALESCE(MAX(order_number), 0) + 1
  INTO next_number
  FROM public.orders
  WHERE store_id = NEW.store_id;

  NEW.order_number := next_number;
  RETURN NEW;
END;
$$;

-- ── Fase 1.3: Tabela orders ─────────────────────────────────────

CREATE TABLE public.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES public.store_config(id) ON DELETE CASCADE,
  order_number      integer NOT NULL DEFAULT 0,
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL,
  delivery_type     text NOT NULL CHECK (delivery_type IN ('delivery', 'pickup', 'table')),
  table_number      integer,
  delivery_zone_id  uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  delivery_zone_name text,
  delivery_address  text,
  payment_method    text NOT NULL CHECK (payment_method IN ('pix', 'card', 'cash')),
  change_for        integer,
  subtotal          integer NOT NULL,
  delivery_fee      integer NOT NULL DEFAULT 0,
  total             integer NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints cross-column
  CONSTRAINT orders_delivery_needs_address
    CHECK (delivery_type != 'delivery' OR delivery_address IS NOT NULL),
  CONSTRAINT orders_table_needs_number
    CHECK (delivery_type != 'table' OR table_number IS NOT NULL),
  CONSTRAINT orders_store_number_unique
    UNIQUE (store_id, order_number)
);

-- ── Fase 1.4: Triggers ──────────────────────────────────────────

CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Fase 1.5: Indices ───────────────────────────────────────────

CREATE INDEX idx_orders_store_id
  ON public.orders(store_id);
CREATE INDEX idx_orders_store_status
  ON public.orders(store_id, status);
CREATE INDEX idx_orders_store_created
  ON public.orders(store_id, created_at DESC);

-- ── Fase 2.1: Tabela order_items ────────────────────────────────

CREATE TABLE public.order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name      text NOT NULL,
  quantity          integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price        integer NOT NULL,
  selected_options  jsonb NOT NULL DEFAULT '[]'::jsonb,
  observations      text,
  is_half_half      boolean NOT NULL DEFAULT false,
  half_half_items   jsonb,
  item_total        integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Fase 2.2: Indice ────────────────────────────────────────────

CREATE INDEX idx_order_items_order_id
  ON public.order_items(order_id);

-- ── Fase 3.1: RLS orders ────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_owner_all" ON public.orders
  FOR ALL
  TO authenticated
  USING (store_id = auth.uid())
  WITH CHECK (store_id = auth.uid());

-- ── Fase 3.2: RLS order_items ───────────────────────────────────

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_owner_all" ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE public.orders.id = public.order_items.order_id
      AND public.orders.store_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE public.orders.id = public.order_items.order_id
      AND public.orders.store_id = auth.uid()
    )
  );

-- ── Fase 4: Realtime ────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

COMMIT;

-- ================================================================
-- MIGRACAO CONCLUIDA
-- Para validar, execute: scripts/validate-orders.sql
-- Para reverter, execute: scripts/migrate-orders-down.sql
-- ================================================================
