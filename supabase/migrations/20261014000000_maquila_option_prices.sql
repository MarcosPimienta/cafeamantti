-- ============================================================
-- Maquila — general price table for bag options
-- Date: 2026-10-14
--
-- Each maquila presentation picks how its bag is made: valve,
-- peel stick, sticker, printed faces and inks per face. Amantti's
-- retail bag (1 ink on both faces, with valve, no sticker, no peel
-- stick) is the reference, and its store price is the reference
-- price. Every difference from that bag adds or subtracts the
-- option's price to the client; its cost adds to the unit cost.
--
--   valvula          price/cost of the valve, per bag
--   peel_stick       adhesive closure, per bag
--   sticker          per bag
--   cara             one printed face at 1 ink, per bag
--   tinta_adicional  each extra ink, per printed face, per bag
--
-- Proposals keep a copy of these values when saved, so editing
-- the table does not change proposals already sent. Seeded at
-- zero: set the real values from the maquila module.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maquila_option_prices (
  key        TEXT PRIMARY KEY
             CHECK (key IN ('valvula', 'peel_stick', 'sticker', 'cara', 'tinta_adicional')),
  price      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.maquila_option_prices (key) VALUES
  ('valvula'), ('peel_stick'), ('sticker'), ('cara'), ('tinta_adicional')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.maquila_option_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage maquila option prices" ON public.maquila_option_prices;
CREATE POLICY "Admins can manage maquila option prices"
  ON public.maquila_option_prices FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
