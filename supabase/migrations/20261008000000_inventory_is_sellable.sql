-- ============================================================
-- Mark which inventory items are sold
-- Date: 2026-10-08
--
-- The inventory holds both what Café Amantti sells and what it
-- consumes to make it (pergamino, café verde, bolsas, stickers,
-- etiquetas, sacos). Orders must only offer the first group, so
-- each item now says whether it is sold. Admins can change it
-- per product from Inventario.
--
-- Initial values by product code:
--   sold      CAFT-*  roasted coffee (packed sizes and bulk kg)
--             CAFC-*  cold brew
--             CAFS-*  café soluble / instantáneo
--   not sold  CAPG-*  pergamino, CAFV-* café verde,
--             EMP-*, STK-*, ETQ-*, SACF-*  packaging and supplies,
--             POC-*   pocillos, and anything else
-- ============================================================

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT false;

UPDATE public.inventory
  SET is_sellable = true
  WHERE product_code LIKE 'CAFT-%'
     OR product_code LIKE 'CAFC-%'
     OR product_code LIKE 'CAFS-%';

CREATE INDEX IF NOT EXISTS idx_inventory_is_sellable
  ON public.inventory (is_sellable)
  WHERE is_sellable;
