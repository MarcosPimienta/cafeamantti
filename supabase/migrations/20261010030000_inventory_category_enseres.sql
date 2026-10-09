-- ============================================================
-- "enseres" inventory category
-- Date: 2026-10-10
--
-- Furniture and fixtures (cafeteras, muebles, menaje) are tracked
-- in inventory but are neither coffee, packaging, accessories for
-- sale nor equipment lent in comodato. Their purchases are entered
-- with entry type EQP ("Equipo y enseres").
--
-- Keep this list in sync with utils/inventory/categories.ts.
-- ============================================================

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_category_check;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_check
  CHECK (category IN ('cafe', 'empaque', 'accesorio', 'equipo', 'enseres'));
