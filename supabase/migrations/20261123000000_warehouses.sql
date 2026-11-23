-- ============================================================
-- Bodegas: stock por bodega y transferencias entre ellas
-- Date: 2026-11-23
--
-- Until now a product's stock was one number. From here every movement
-- says which bodega it happened in (inventory_movements.warehouse_id), and
-- a product's stock in a bodega is the sum of its v2 movements there
-- (view inventory_warehouse_stock). inventory.current_stock stays the total
-- across bodegas and the existing trigger keeps moving it.
--
-- Three bodegas: Edificio Nueva Alejandría (the main one: orders,
-- purchases and production move stock there unless told otherwise),
-- Café 11:11 (the cold brew maquilador: the roasted coffee sent to it sits
-- there until the bottles come back) and Bodega Mateo.
--
-- Every existing movement goes to the main bodega, so today's stock is all
-- in Nueva Alejandría. warehouse_id defaults to the main bodega, so code
-- that does not send one keeps working unchanged.
--
-- A transfer is two movements in one transaction (inventory_transfer):
-- a salida in the origin and an entrada in the destination, both with
-- tab_source 'transferencia' and the same transfer_id. The product total
-- does not change.
--
-- A movement written, edited or deleted that would leave a product below
-- zero in its bodega is refused, except an order's salida (as with the total).
-- Safe to run more than once.
-- ============================================================

-- ── Bodegas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'propia' CHECK (kind IN ('propia', 'maquila')),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one main bodega.
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default ON public.warehouses (is_default) WHERE is_default;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
CREATE POLICY "Admins can manage warehouses" ON public.warehouses FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.warehouses (code, name, kind, is_default) VALUES
  ('NALE',  'Edificio Nueva Alejandría', 'propia',  true),
  ('C1111', 'Café 11:11',                'maquila', false),
  ('MATEO', 'Bodega Mateo',              'propia',  false)
ON CONFLICT (code) DO NOTHING;

-- The main bodega, for column defaults and callers that send none.
CREATE OR REPLACE FUNCTION public.default_warehouse_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.warehouses WHERE is_default ORDER BY created_at LIMIT 1;
$$;

-- ── Bodega and transfer on every movement ────────────────────
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS transfer_id  UUID;

-- Today's movements (both eras) happened in the main bodega.
UPDATE public.inventory_movements
   SET warehouse_id = public.default_warehouse_id()
 WHERE warehouse_id IS NULL;

ALTER TABLE public.inventory_movements
  ALTER COLUMN warehouse_id SET DEFAULT public.default_warehouse_id(),
  ALTER COLUMN warehouse_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_item_warehouse_idx ON public.inventory_movements (inventory_id, warehouse_id) WHERE era = 'v2';
CREATE INDEX IF NOT EXISTS inventory_movements_transfer_idx ON public.inventory_movements (transfer_id) WHERE transfer_id IS NOT NULL;

-- tab_source gains 'transferencia' (and keeps every value the app writes).
-- NOT VALID: checks new rows only, so older values never block the migration.
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_tab_source_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_tab_source_check
  CHECK (tab_source IS NULL OR tab_source IN ('entrada', 'trilla', 'prod_consumo', 'prod_alta', 'salida', 'cold_brew', 'reempaque', 'transferencia'))
  NOT VALID;

-- ── Stock per bodega ─────────────────────────────────────────
-- Split by grind too, so roasted coffee shows grano/molido per bodega.
CREATE OR REPLACE VIEW public.inventory_warehouse_stock
WITH (security_invoker = on) AS
SELECT m.inventory_id,
       m.warehouse_id,
       m.molienda,
       sum(m.quantity) AS quantity
  FROM public.inventory_movements m
 WHERE m.era = 'v2'
 GROUP BY m.inventory_id, m.warehouse_id, m.molienda;

-- ── No bodega below zero ─────────────────────────────────────
-- After a movement is written, changed or deleted, the bodega it touched must
-- not be left below zero for that product. An order's salida may still go
-- short (as with the total), so the Kardex shows the shortfall of a paid sale.
CREATE OR REPLACE FUNCTION public.inventory_check_warehouse_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item    UUID;
  v_wh      UUID;
  v_need    NUMERIC;
  v_balance NUMERIC;
  v_name    TEXT;
  v_whname  TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only removing stock (an entrada) can leave the bodega short.
    IF OLD.era <> 'v2' OR OLD.quantity <= 0 THEN RETURN NULL; END IF;
    v_item := OLD.inventory_id; v_wh := OLD.warehouse_id; v_need := OLD.quantity;
  ELSE
    IF NEW.era <> 'v2' OR NEW.order_id IS NOT NULL THEN RETURN NULL; END IF;
    IF TG_OP = 'INSERT' AND NEW.quantity >= 0 THEN RETURN NULL; END IF;
    v_item := NEW.inventory_id; v_wh := NEW.warehouse_id; v_need := abs(NEW.quantity);
  END IF;

  SELECT COALESCE(sum(quantity), 0) INTO v_balance
    FROM public.inventory_movements
   WHERE inventory_id = v_item AND warehouse_id = v_wh AND era = 'v2';
  IF v_balance < -0.0005 THEN
    SELECT product_name INTO v_name FROM public.inventory WHERE id = v_item;
    SELECT name INTO v_whname FROM public.warehouses WHERE id = v_wh;
    RAISE EXCEPTION 'Stock insuficiente de "%" en %: quedaría en %.',
      v_name, v_whname, round(v_balance, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  -- An edit that moved the movement to another product or bodega: the old one must hold too.
  IF TG_OP = 'UPDATE' AND OLD.era = 'v2' AND (OLD.inventory_id <> NEW.inventory_id OR OLD.warehouse_id <> NEW.warehouse_id) THEN
    SELECT COALESCE(sum(quantity), 0) INTO v_balance
      FROM public.inventory_movements
     WHERE inventory_id = OLD.inventory_id AND warehouse_id = OLD.warehouse_id AND era = 'v2';
    IF v_balance < -0.0005 THEN
      SELECT product_name INTO v_name FROM public.inventory WHERE id = OLD.inventory_id;
      SELECT name INTO v_whname FROM public.warehouses WHERE id = OLD.warehouse_id;
      RAISE EXCEPTION 'Stock insuficiente de "%" en %: quedaría en %.',
        v_name, v_whname, round(v_balance, 2)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS inventory_movements_warehouse_stock ON public.inventory_movements;
CREATE TRIGGER inventory_movements_warehouse_stock
  AFTER INSERT OR UPDATE OF quantity, inventory_id, warehouse_id OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_check_warehouse_stock();

-- ── Transfer: both movements or neither ──────────────────────
CREATE OR REPLACE FUNCTION public.inventory_transfer(
  p_item        UUID,
  p_from        UUID,
  p_to          UUID,
  p_qty         NUMERIC,
  p_date        DATE,
  p_molienda    TEXT DEFAULT NULL,
  p_lote        TEXT DEFAULT NULL,
  p_note        TEXT DEFAULT NULL,
  p_responsable TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_transfer UUID := gen_random_uuid();
  v_from     TEXT;
  v_to       TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero.';
  END IF;
  IF p_from = p_to THEN
    RAISE EXCEPTION 'La bodega de origen y la de destino son la misma.';
  END IF;
  SELECT name INTO v_from FROM public.warehouses WHERE id = p_from AND active;
  SELECT name INTO v_to   FROM public.warehouses WHERE id = p_to AND active;
  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'Bodega no encontrada o inactiva.';
  END IF;

  INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, created_by, movement_date, responsable, tab_source, lote, molienda, warehouse_id, transfer_id)
  VALUES
    (p_item, 'salida', -p_qty, concat_ws(' — ', 'Transferencia a ' || v_to, NULLIF(p_note, '')), auth.uid(), p_date, NULLIF(p_responsable, ''), 'transferencia', NULLIF(p_lote, ''), NULLIF(p_molienda, ''), p_from, v_transfer),
    (p_item, 'entrada', p_qty, concat_ws(' — ', 'Transferencia desde ' || v_from, NULLIF(p_note, '')), auth.uid(), p_date, NULLIF(p_responsable, ''), 'transferencia', NULLIF(p_lote, ''), NULLIF(p_molienda, ''), p_to, v_transfer);

  RETURN v_transfer;
END;
$$;
