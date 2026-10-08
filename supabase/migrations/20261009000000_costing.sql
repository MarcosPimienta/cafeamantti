-- ============================================================
-- Direct cost per kg of roasted coffee (Inventario → Costos)
-- Date: 2026-10-09
--
-- Movements record kilos and units, never money. To cost each
-- roasted reference (tostado, empacado y despachado) the app needs:
--
--   inventory.standard_cost   what one stock unit costs today:
--                             $/kg for café verde and pergamino,
--                             $/unidad for bolsas, stickers, etiquetas.
--                             NULL = not priced yet.
--   cost_settings (one row)   toll roasting (maquila) rate and its
--                             basis, average dispatch cost, and the
--                             fallback yields used when there are no
--                             trilla / tostión batches to measure.
--
-- Real yields, the verde/pergamino mix and kg per order are computed
-- from production batches and orders; they are not stored.
-- ============================================================

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS standard_cost NUMERIC
  CHECK (standard_cost IS NULL OR standard_cost >= 0);

CREATE TABLE IF NOT EXISTS public.cost_settings (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Maquila de tostión: $ per kg, charged on verde delivered or on
  -- tostado received depending on the roaster's contract.
  roasting_fee_per_kg      NUMERIC NOT NULL DEFAULT 0 CHECK (roasting_fee_per_kg >= 0),
  roasting_fee_basis       TEXT NOT NULL DEFAULT 'verde'
                           CHECK (roasting_fee_basis IN ('verde', 'tostado')),
  -- Average cost of one dispatch (domicilio / transportadora).
  dispatch_cost_per_order  NUMERIC NOT NULL DEFAULT 0 CHECK (dispatch_cost_per_order >= 0),
  -- Kilos in an average dispatch. NULL = measure it from real orders.
  dispatch_kg_per_order    NUMERIC CHECK (dispatch_kg_per_order IS NULL OR dispatch_kg_per_order > 0),
  -- Used only when no batches exist to measure the real yield.
  default_roast_yield      NUMERIC NOT NULL DEFAULT 0.82 CHECK (default_roast_yield > 0 AND default_roast_yield <= 1),
  default_trilla_yield     NUMERIC NOT NULL DEFAULT 0.80 CHECK (default_trilla_yield > 0 AND default_trilla_yield <= 1),
  updated_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.cost_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cost_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage cost settings" ON public.cost_settings;
CREATE POLICY "Admins can manage cost settings"
  ON public.cost_settings FOR ALL
  USING (public.is_admin());
