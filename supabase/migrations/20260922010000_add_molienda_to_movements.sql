-- ============================================================
-- Track grind (Grano / Molido) on inventory movements
-- Date: 2026-09-22
--
-- The three roasted-coffee profiles (Premium = CAFT-*, Honey =
-- CAFT-HON-*, Chiroso = CAFT-MIC-*) are not split into separate
-- SKUs. Instead the grind is *determined at the moment the
-- movement is registered* — in the Entrada tab when coffee is
-- bought in, in the Empaque/Altas tab when it is packed, and in
-- the Salida tab when it leaves. Stock per profile x grind is
-- therefore derived by summing movements, not stored per SKU.
--
-- NULL stays legal: non-coffee items (bolsas, stickers, pocillos)
-- and every pre-existing row have no grind.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS molienda TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_movements_molienda_check'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_molienda_check
      CHECK (molienda IS NULL OR molienda IN ('grano', 'molido'));
  END IF;
END $$;

-- Most rows (packaging, accessories, pre-existing history) have no
-- grind, so a partial index stays small while still serving reports
-- that slice movements by Grano / Molido.
CREATE INDEX IF NOT EXISTS idx_inventory_movements_molienda
  ON public.inventory_movements (molienda)
  WHERE molienda IS NOT NULL;
