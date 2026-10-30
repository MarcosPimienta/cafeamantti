-- ============================================================
-- Movimientos de balance: salidas de plata que no son gasto
-- Date: 2026-11-04
--
-- The monthly payment of autorretención or retenciones to the DIAN, a
-- loan's principal… money leaves (Flujo de Caja) against a liability or
-- asset account, but it is not an expense, so it never reaches the P&L
-- (which only adds OPEX, COGS and CAPEX). Team categories can have this
-- type (Ajustes → Categorías de gasto).
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.cashflow_expenses DROP CONSTRAINT IF EXISTS cashflow_expenses_expense_type_check;
ALTER TABLE public.cashflow_expenses ADD CONSTRAINT cashflow_expenses_expense_type_check
  CHECK (expense_type IN ('OPEX', 'CAPEX', 'COGS', 'ANTICIPO', 'BALANCE'));

ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_expense_type_check;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_expense_type_check
  CHECK (expense_type IN ('COGS', 'OPEX', 'CAPEX', 'BALANCE'));
