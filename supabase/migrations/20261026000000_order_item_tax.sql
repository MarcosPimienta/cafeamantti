-- ============================================================
-- IVA per order line
-- Date: 2026-10-26
--
-- Each product of a manual order carries the IVA chosen when the order was
-- made (defaulting to the product's own: 5%, 19%, none…), and the invoice
-- uses it. tax_id is the Siigo tax (0 = without IVA); tax_rate its
-- percentage. Orders keep their total before IVA plus tax_amount (IVA).
-- Lines without them (older orders, web store) use the product's IVA.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_id   INTEGER,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0;
