-- ============================================================
-- Add sample white-label packaging bag item
-- Date: 2026-09-22
-- ============================================================

INSERT INTO public.inventory (
  product_code,
  product_name,
  category,
  unit,
  current_stock,
  min_stock,
  notes
)
VALUES
  ('EMP-BOLSA-MUESTRAS-BLANCA', 'Empaque Bolsa Muestras Blancas', 'empaque', 'unidad', 0, 50, 'Empaque para bolsas muestrales blancas de marca Amantti')
ON CONFLICT (product_code) DO UPDATE SET
  product_name = EXCLUDED.product_name,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  min_stock = EXCLUDED.min_stock,
  notes = EXCLUDED.notes;
