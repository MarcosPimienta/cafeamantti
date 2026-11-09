-- ============================================================
-- Flujo de Caja: la plata de una factura entra cuando se registra su pago
-- Date: 2026-11-12
--
-- Until now every order marked paid counted by itself in Flujo de Caja (as
-- "Ventas Web", on the day it was marked) — including cash invoices, marked
-- paid when invoiced although the transfer had not arrived. Now only web
-- orders paid through ePayco count by themselves; an invoice's money enters
-- Flujo de Caja as an income when its payment is registered (date and value
-- of the payment), and that income can be reconciled with the bank.
--
-- invoice_payments.cashflow_income_id: the income that holds the payment —
--   its own (income_owned = true, created with the payment and deleted with
--   it) or a cobro's income that paid several invoices (income_owned = false).
-- siigo_status 'no_aplica': the confirmed payment of a cash invoice, which
--   Siigo already has as paid (no recibo de caja).
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS cashflow_income_id UUID REFERENCES public.cashflow_incomes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS income_owned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS invoice_payments_income_idx ON public.invoice_payments (cashflow_income_id) WHERE cashflow_income_id IS NOT NULL;

ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_siigo_status_check;
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_siigo_status_check
  CHECK (siigo_status IN ('pendiente', 'enviado', 'error', 'no_aplica'));

COMMENT ON COLUMN public.invoice_payments.cashflow_income_id IS
  'Income in Flujo de Caja that holds this payment (its own when income_owned, else a cobro''s).';
