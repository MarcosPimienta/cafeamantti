-- ============================================================
-- Order payment, apart from delivery
-- Date: 2026-10-27
--
-- Until now one status said both how far the order went and whether it
-- was paid (paid/processing/shipped/delivered all meant "paid"). Now:
--   status          pending → processing → shipped → delivered | cancelled
--   payment_status  pending | paid   (paid_at: when the money came in)
-- An order can be delivered and still owed (credit sales). Cash flow
-- counts an order's income on paid_at.
--
-- Existing orders: the ones in paid/processing/shipped/delivered are paid
-- (on their creation date), except those with a credit invoice still owed.
-- Orders in the old 'paid' status go back to 'pending' (not prepared yet),
-- paid. Safe to run more than once.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending', 'paid'));

-- Backfill only rows that were never set (paid_at null and still 'pending').
UPDATE public.orders
SET payment_status = 'paid', paid_at = created_at
WHERE status IN ('paid', 'processing', 'shipped', 'delivered')
  AND payment_status = 'pending' AND paid_at IS NULL;

-- Credit invoices with a balance: delivered, not paid yet.
UPDATE public.orders o
SET payment_status = 'pending', paid_at = NULL
FROM public.sales_invoices i
WHERE i.order_id = o.id
  AND i.status <> 'anulada'
  AND i.payment_terms = 'credito'
  AND i.total
      - COALESCE((SELECT SUM(p.amount) FROM public.invoice_payments p WHERE p.invoice_id = i.id), 0)
      - COALESCE((SELECT SUM(n.total) FROM public.credit_notes n WHERE n.invoice_id = i.id), 0) > 0.5;

-- The old 'paid' stage meant "paid, not prepared yet".
UPDATE public.orders SET status = 'pending' WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS orders_payment_status_paid_at_idx ON public.orders (payment_status, paid_at);
