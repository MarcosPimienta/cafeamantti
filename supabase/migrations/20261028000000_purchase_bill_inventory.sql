-- ============================================================
-- Purchase invoices that bring stock in
-- Date: 2026-10-28
--
-- A line of a purchase invoice (Compras) can say which inventory product
-- came in and how much (e.g. 598 kg of Café Verde). Saving the invoice
-- creates that 'entrada', linked here so annulling the invoice reverts it.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS purchase_bill_id UUID REFERENCES public.purchase_bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_purchase_bill_idx ON public.inventory_movements (purchase_bill_id);
