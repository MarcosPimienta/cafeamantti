-- ============================================================
-- Link manual-order items to inventory
-- Date: 2026-09-22
--
-- Inventory for a manual order now moves at the moment of
-- payment (status paid / processing / shipped / delivered), the
-- same moment the order starts counting in Flujo de Caja. An
-- order can be created as Pendiente and paid later from the
-- orders list, so the stock deduction has to be replayable from
-- the order itself — which needs the inventory item per line.
--
-- NULL stays legal: web-checkout items and older manual orders
-- only carry the product name (product_id).
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS inventory_id UUID
  REFERENCES public.inventory(id) ON DELETE SET NULL;
