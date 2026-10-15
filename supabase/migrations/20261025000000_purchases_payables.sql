-- ============================================================
-- Purchases (facturas de compra) and payments to suppliers
-- Date: 2026-10-25
--
-- Compras: invoices received from companies (personas jurídicas). Each
-- one goes to Siigo as a purchase invoice (never a support document) owed
-- to the supplier. Payments — of a purchase invoice or of a signed cuenta
-- de cobro (support document) — become a Siigo payment receipt (recibo de
-- pago/egreso) against that document, and an expense in Flujo de Caja on
-- the day the money left, for what actually left (net of withholdings).
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.purchase_bills (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name           TEXT NOT NULL,
  supplier_identification TEXT NOT NULL,
  -- The supplier's own invoice number (e.g. FETD-1968): Siigo matches payments to it.
  provider_prefix         TEXT NOT NULL DEFAULT '',
  provider_number         TEXT NOT NULL,
  issue_date              DATE NOT NULL,
  due_date                DATE NOT NULL,
  -- [{ category, account, description, base, tax_id, tax_rate, retention_id, retention_rate }]
  lines                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal                NUMERIC NOT NULL DEFAULT 0,
  iva                     NUMERIC NOT NULL DEFAULT 0,
  withheld                NUMERIC NOT NULL DEFAULT 0,
  -- What is owed to the supplier: subtotal + IVA − withholdings.
  total                   NUMERIC NOT NULL CHECK (total > 0),
  notes                   TEXT,
  status                  TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'registrada', 'error', 'anulada')),
  siigo_id                TEXT,
  siigo_name              TEXT,
  siigo_error             TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same supplier invoice is registered only once.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_provider_invoice_key
  ON public.purchase_bills (supplier_identification, provider_prefix, provider_number)
  WHERE status <> 'anulada';
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_siigo_id_key ON public.purchase_bills (siigo_id) WHERE siigo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payable_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         UUID REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  cuenta_cobro_id UUID REFERENCES public.cuentas_cobro(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL,
  amount          NUMERIC NOT NULL CHECK (amount > 0),
  method          TEXT NOT NULL CHECK (method IN ('bank', 'cash')),
  notes           TEXT,
  -- Flujo de Caja expenses this payment created (one per category).
  expense_ids     UUID[] NOT NULL DEFAULT '{}',
  siigo_status    TEXT NOT NULL DEFAULT 'pendiente' CHECK (siigo_status IN ('pendiente', 'enviado', 'error', 'no_aplica')),
  siigo_id        TEXT,
  siigo_name      TEXT,
  siigo_error     TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payable_payments_one_document CHECK ((bill_id IS NULL) <> (cuenta_cobro_id IS NULL))
);

CREATE INDEX IF NOT EXISTS payable_payments_bill_idx ON public.payable_payments (bill_id);
CREATE INDEX IF NOT EXISTS payable_payments_cc_idx ON public.payable_payments (cuenta_cobro_id);

ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage purchase bills" ON public.purchase_bills;
CREATE POLICY "Admins manage purchase bills" ON public.purchase_bills FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage payable payments" ON public.payable_payments;
CREATE POLICY "Admins manage payable payments" ON public.payable_payments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- What the support document left owed, its category and due date (for payments).
ALTER TABLE public.cuentas_cobro
  ADD COLUMN IF NOT EXISTS siigo_ds_owed     NUMERIC,
  ADD COLUMN IF NOT EXISTS siigo_ds_category TEXT,
  ADD COLUMN IF NOT EXISTS siigo_ds_date     DATE;

ALTER TABLE public.siigo_sync_log DROP CONSTRAINT IF EXISTS siigo_sync_log_entity_check;
ALTER TABLE public.siigo_sync_log ADD CONSTRAINT siigo_sync_log_entity_check
  CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection', 'voucher', 'support_document', 'credit_note', 'payment_receipt'));
