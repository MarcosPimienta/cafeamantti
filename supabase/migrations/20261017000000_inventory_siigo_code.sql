-- ============================================================
-- Inventario — código del producto en Siigo
-- Date: 2026-10-17
--
-- Siigo numbers products on its own (0040 HONEY 250gr, 004 C.T -
-- PREMIUM 250gr…) while the app uses CAFT-HON-250G, CAFT-250G…
-- siigo_code links each app product to its Siigo product: invoices are
-- sent with it, and invoices pulled from Siigo are matched by it.
-- NULL = same code as product_code.
-- ============================================================

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS siigo_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_siigo_code
  ON public.inventory (upper(siigo_code)) WHERE siigo_code IS NOT NULL;
