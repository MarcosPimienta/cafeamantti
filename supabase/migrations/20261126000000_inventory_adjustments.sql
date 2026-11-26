-- ============================================================
-- Comprobantes de ajuste de inventario
-- Date: 2026-11-26
--
-- An adjustment changes stock because the count, a damage or a typing error
-- says so, not because something came in or went out. Until now it was a
-- loose movement (type 'ajuste' or a salida of kind 'ajuste') with a free
-- text reason. Now it is a voucher: a consecutive number (AJ-0001), a date,
-- a bodega, a reason, who made it, and one movement per product
-- (type 'ajuste', tab_source 'ajuste', adjustment_id), each with the unit
-- cost it was valued at.
--
-- A voucher is never edited or deleted: it is annulled, which writes the
-- opposite movements (same voucher, dated the day of the annulment) so the
-- Kardex shows both the adjustment and its reversal.
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Consecutive without gaps: given inside the voucher's transaction (see below).
  number          INTEGER NOT NULL UNIQUE,
  adjustment_date DATE NOT NULL,
  warehouse_id    UUID NOT NULL REFERENCES public.warehouses(id),
  reason_kind     TEXT NOT NULL CHECK (reason_kind IN ('conteo', 'dano', 'vencimiento', 'error_registro', 'otro')),
  notes           TEXT,
  responsable     TEXT,
  status          TEXT NOT NULL DEFAULT 'vigente' CHECK (status IN ('vigente', 'anulado')),
  annulled_at     TIMESTAMPTZ,
  annulled_date   DATE,
  annul_reason    TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inventory_adjustments IS 'Comprobantes de ajuste de inventario (AJ-0001…): each line is an inventory_movements row with this adjustment_id';

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage inventory adjustments" ON public.inventory_adjustments;
CREATE POLICY "Admins can manage inventory adjustments" ON public.inventory_adjustments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS adjustment_id UUID REFERENCES public.inventory_adjustments(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS inventory_movements_adjustment_idx ON public.inventory_movements (adjustment_id) WHERE adjustment_id IS NOT NULL;

-- tab_source gains 'ajuste' (and keeps every value the app writes).
ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_tab_source_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_tab_source_check
  CHECK (tab_source IS NULL OR tab_source IN ('entrada', 'trilla', 'prod_consumo', 'prod_alta', 'salida', 'cold_brew', 'reempaque', 'transferencia', 'ajuste'))
  NOT VALID;

-- ── Create ───────────────────────────────────────────────────
-- p_lines: [{ "inventory_id": uuid, "quantity": signed numeric, "molienda": text|null, "unit_cost": numeric|null }]
-- Everything in one transaction: if a line would leave a product (or the
-- bodega) below zero, the stock triggers refuse it and nothing is written.
CREATE OR REPLACE FUNCTION public.inventory_adjustment_create(
  p_date        DATE,
  p_warehouse   UUID,
  p_reason_kind TEXT,
  p_reason_text TEXT,
  p_notes       TEXT,
  p_responsable TEXT,
  p_lines       JSONB
)
RETURNS TABLE (adjustment_id UUID, adjustment_number INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_number INTEGER;
  v_wh     UUID := COALESCE(p_warehouse, public.default_warehouse_id());
  v_label  TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'El comprobante necesita al menos un producto.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_lines) AS l(quantity NUMERIC) WHERE l.quantity IS NULL OR l.quantity = 0) THEN
    RAISE EXCEPTION 'Cada línea debe mover una cantidad distinta de cero.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = v_wh AND w.active) THEN
    RAISE EXCEPTION 'Bodega no encontrada o inactiva.';
  END IF;

  -- The next number, with the table locked against other vouchers until this
  -- one commits: a voucher that fails rolls back and leaves no gap.
  LOCK TABLE public.inventory_adjustments IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(max(a.number), 0) + 1 INTO v_number FROM public.inventory_adjustments a;

  INSERT INTO public.inventory_adjustments (number, adjustment_date, warehouse_id, reason_kind, notes, responsable, created_by)
  VALUES (v_number, p_date, v_wh, p_reason_kind, NULLIF(trim(p_notes), ''), NULLIF(trim(p_responsable), ''), auth.uid())
  RETURNING inventory_adjustments.id INTO v_id;

  v_label := 'AJ-' || lpad(v_number::text, 4, '0');

  INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, created_by, movement_date, responsable, tab_source, molienda, warehouse_id, unit_cost, adjustment_id)
  SELECT l.inventory_id, 'ajuste', l.quantity,
         concat_ws(' — ', 'Comprobante ' || v_label || ' · ' || p_reason_text, NULLIF(trim(p_notes), '')),
         auth.uid(), p_date, NULLIF(trim(p_responsable), ''), 'ajuste', NULLIF(l.molienda, ''), v_wh,
         CASE WHEN l.unit_cost IS NULL OR l.unit_cost < 0 THEN NULL ELSE l.unit_cost END,
         v_id
    FROM jsonb_to_recordset(p_lines) AS l(inventory_id UUID, quantity NUMERIC, molienda TEXT, unit_cost NUMERIC);

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

-- ── Annul ────────────────────────────────────────────────────
-- Writes the opposite of every line of the voucher, dated p_date.
CREATE OR REPLACE FUNCTION public.inventory_adjustment_annul(p_id UUID, p_date DATE, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_adj   public.inventory_adjustments%ROWTYPE;
  v_label TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué se anula el comprobante.';
  END IF;
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comprobante no encontrado.';
  END IF;
  IF v_adj.status = 'anulado' THEN
    RAISE EXCEPTION 'Este comprobante ya está anulado.';
  END IF;

  v_label := 'AJ-' || lpad(v_adj.number::text, 4, '0');

  INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, created_by, movement_date, responsable, tab_source, molienda, warehouse_id, unit_cost, adjustment_id)
  SELECT m.inventory_id, 'ajuste', -m.quantity,
         'Anulación del comprobante ' || v_label || ' — ' || trim(p_reason),
         auth.uid(), p_date, m.responsable, 'ajuste', m.molienda, m.warehouse_id, m.unit_cost, m.adjustment_id
    FROM public.inventory_movements m
   WHERE m.adjustment_id = p_id;

  UPDATE public.inventory_adjustments
     SET status = 'anulado', annulled_at = now(), annulled_date = p_date, annul_reason = trim(p_reason)
   WHERE id = p_id;
END;
$$;
