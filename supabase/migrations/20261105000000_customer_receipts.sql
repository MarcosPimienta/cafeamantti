-- ============================================================
-- Cobros a clientes (recibos de caja hechos desde la app)
-- Date: 2026-11-05
--
-- When the bank statement arrives, each customer deposit is registered in
-- Cuentas por cobrar and assigned, invoice by invoice, to what it pays
-- (also invoices made directly in Siigo). Each one becomes a Siigo recibo
-- de caja (DebtPayment) for one customer branch, and the money enters
-- Flujo de Caja. RCs made in Siigo since the cutoff are imported here
-- (status 'importado') so the history is complete.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_receipts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  site_id                 UUID REFERENCES public.client_sites(id) ON DELETE SET NULL,
  customer_identification TEXT NOT NULL,
  customer_name           TEXT NOT NULL,
  -- The customer's Siigo branch (sucursal) the invoices were issued to.
  branch_office           INTEGER NOT NULL DEFAULT 0,
  receipt_date            DATE NOT NULL,
  amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method                  TEXT NOT NULL CHECK (method IN ('transfer', 'cash')),
  notes                   TEXT,
  -- What it pays: [{ siigo_invoice_id, name, due_date, value }]
  items                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                  TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'enviado', 'error', 'importado')),
  siigo_id                TEXT,
  siigo_name              TEXT,
  siigo_error             TEXT,
  -- Its income in Flujo de Caja (the part that pays invoices made in Siigo).
  income_id               UUID REFERENCES public.cashflow_incomes(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipts_siigo_key ON public.customer_receipts (siigo_id) WHERE siigo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_receipts_customer_idx ON public.customer_receipts (customer_identification, receipt_date DESC);

ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage customer receipts" ON public.customer_receipts;
CREATE POLICY "Admins manage customer receipts" ON public.customer_receipts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
