-- ============================================================
-- "equipo" inventory category
-- Date: 2026-10-10
--
-- Equipment such as espresso machines lent to clients in
-- comodato is tracked in inventory like any other item, but it is
-- neither coffee, packaging nor an accessory for sale.
-- ============================================================

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_category_check;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_check
  CHECK (category IN ('cafe', 'empaque', 'accesorio', 'equipo'));
