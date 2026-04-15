-- ============================================================
-- Cleanup: remove all seeded movements and production batches
-- so the seed can be re-run cleanly without duplicates.
--
-- Run this BEFORE re-running 20260414000003_seed_sheets_data.sql
-- ============================================================

-- 1. Delete ALL inventory_movements that came from the seed
--    (identified by tab_source being set — manual adjustments have NULL tab_source)
DELETE FROM public.inventory_movements
WHERE tab_source IN ('entrada', 'trilla', 'prod_consumo', 'prod_alta', 'salida');

-- 2. Delete all production_batches (they were all seeded)
DELETE FROM public.production_batches;

-- 3. Reset current_stock to 0 for every product
UPDATE public.inventory SET current_stock = 0;
