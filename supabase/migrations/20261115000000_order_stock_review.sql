-- ============================================================
-- Orders whose inventory is "por revisar"
-- Date: 2026-11-10
--
-- A sale invoiced straight in Siigo and imported later as an order: its
-- bags were usually already taken out by hand ("Venta Niku Medellín"), so
-- the order must not deduct them again by itself. While stock_review is
-- true, syncOrderStock leaves the order alone; from the order, the admin
-- links the manual salida that was this sale, or deducts now. Either one
-- clears the flag.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_review BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.stock_review IS
  'Inventory to review: the order does not deduct by itself until a manual salida is linked to it or it is deducted from the order.';

CREATE INDEX IF NOT EXISTS orders_stock_review_idx ON public.orders (stock_review) WHERE stock_review;
