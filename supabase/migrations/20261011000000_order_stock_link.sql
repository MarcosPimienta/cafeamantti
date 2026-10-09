-- ============================================================
-- Link order stock movements to their order
-- Date: 2026-10-11
--
-- Orders deduct stock when paid and give it back if cancelled. Until
-- now the movements were found by their reason text ("Orden Manual
-- #abcd1234"), which breaks as soon as web orders deduct stock too.
-- Each new movement now carries the order it belongs to; older ones
-- are still found by reason.
--
-- orders.source distinguishes manual, web and siigo orders for the
-- movement reason shown in the Kardex.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_order
  ON public.inventory_movements (order_id)
  WHERE order_id IS NOT NULL;

-- Manual orders were stored with the default source ('web').
UPDATE public.orders o
  SET source = 'manual'
  WHERE (o.source IS NULL OR o.source = 'web')
    AND EXISTS (
      SELECT 1 FROM public.inventory_movements m
      WHERE m.reason = 'Orden Manual #' || split_part(o.id::text, '-', 1)
    );
