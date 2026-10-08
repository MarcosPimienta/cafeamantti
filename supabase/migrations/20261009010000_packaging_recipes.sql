-- ============================================================
-- Packaging recipe per roasted reference
-- Date: 2026-10-09
--
-- Not every bag gets a sticker (or the same extras). Each packed
-- reference can declare exactly what packing one unit consumes:
--   items = [{"code": "EMP-BOLSA-FIR-2K5", "qty": 1}, ...]
-- An empty array means "no packaging". A reference without a row
-- keeps the default (its bag + the profile sticker).
--
-- Used by Inventario → Costos (packaging cost) and by the
-- consumption suggested in Empaque/Altas and Reempaque, so cost and
-- stock follow the same recipe.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.packaging_recipes (
  reference_code TEXT PRIMARY KEY,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb
                 CHECK (jsonb_typeof(items) = 'array'),
  updated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.packaging_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage packaging recipes" ON public.packaging_recipes;
CREATE POLICY "Admins can manage packaging recipes"
  ON public.packaging_recipes FOR ALL
  USING (public.is_admin());
