-- ============================================================
-- Pedido ya contado en Flujo de Caja por un ingreso manual
-- Date: 2026-11-11
--
-- A paid order counts in Flujo de Caja by itself (its total, on paid_at).
-- When the money had already been registered by hand (a transfer typed in
-- Flujo de Caja before the sale was invoiced), the same sale counted twice.
-- cashflow_income_id says which manual income already holds that money:
-- Flujo de Caja then leaves the order out. Several orders can point to one
-- income (one transfer paying two invoices). If the income is deleted the
-- order counts again by itself.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cashflow_income_id UUID REFERENCES public.cashflow_incomes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_cashflow_income_idx ON public.orders (cashflow_income_id) WHERE cashflow_income_id IS NOT NULL;

COMMENT ON COLUMN public.orders.cashflow_income_id IS
  'Manual income in Flujo de Caja that already holds this order''s money; Flujo de Caja does not count the order again.';
