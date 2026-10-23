-- ============================================================
-- Saldos a favor con proveedores (anticipos)
-- Date: 2026-10-29
--
-- Money paid to a supplier beyond what a document owed (or handed over
-- before any invoice) is an advance: an asset (PUC 13300501), not an
-- expense. Each movement of that balance is one row:
--   anticipo   → money left (Siigo egreso type AdvancePayment)
--   cruce      → the balance paid (part of) a purchase invoice or cuenta de cobro
--   devolucion → the supplier gave the money back
-- In Flujo de Caja the money moves as ANTICIPO rows, which never reach the
-- P&L: + when it leaves, − when it comes back or is crossed (the crossed
-- invoice's expense goes in on that day, so the day's cash nets to zero).
-- Safe to run more than once.
-- ============================================================

-- Flujo de Caja: outflows that are not expenses.
ALTER TABLE public.cashflow_expenses DROP CONSTRAINT IF EXISTS cashflow_expenses_expense_type_check;
ALTER TABLE public.cashflow_expenses ADD CONSTRAINT cashflow_expenses_expense_type_check
  CHECK (expense_type IN ('OPEX', 'CAPEX', 'COGS', 'ANTICIPO'));

-- A document can be paid with the supplier's balance.
ALTER TABLE public.payable_payments DROP CONSTRAINT IF EXISTS payable_payments_method_check;
ALTER TABLE public.payable_payments ADD CONSTRAINT payable_payments_method_check
  CHECK (method IN ('bank', 'cash', 'advance'));

CREATE TABLE IF NOT EXISTS public.supplier_advances (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name           TEXT NOT NULL,
  -- The balance is kept per identification (cuentas de cobro may have no supplier row).
  supplier_identification TEXT NOT NULL,
  kind                    TEXT NOT NULL CHECK (kind IN ('anticipo', 'cruce', 'devolucion')),
  move_date               DATE NOT NULL,
  amount                  NUMERIC NOT NULL CHECK (amount > 0),
  -- How the money moved (anticipo, devolución); null for a cruce.
  method                  TEXT CHECK (method IN ('bank', 'cash')),
  -- The payment that left the excess (anticipo) or that the balance made (cruce).
  payment_id              UUID REFERENCES public.payable_payments(id) ON DELETE CASCADE,
  -- Its ANTICIPO row in Flujo de Caja (anticipo, devolución).
  expense_id              UUID REFERENCES public.cashflow_expenses(id) ON DELETE SET NULL,
  notes                   TEXT,
  siigo_status            TEXT NOT NULL DEFAULT 'pendiente' CHECK (siigo_status IN ('pendiente', 'enviado', 'error', 'no_aplica')),
  siigo_id                TEXT,
  siigo_name              TEXT,
  siigo_error             TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_advances_identification_idx ON public.supplier_advances (supplier_identification);
CREATE INDEX IF NOT EXISTS supplier_advances_payment_idx ON public.supplier_advances (payment_id);

ALTER TABLE public.supplier_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage supplier advances" ON public.supplier_advances;
CREATE POLICY "Admins manage supplier advances" ON public.supplier_advances FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.siigo_sync_log DROP CONSTRAINT IF EXISTS siigo_sync_log_entity_check;
ALTER TABLE public.siigo_sync_log ADD CONSTRAINT siigo_sync_log_entity_check
  CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection', 'voucher', 'support_document', 'credit_note', 'payment_receipt', 'supplier_advance'));
