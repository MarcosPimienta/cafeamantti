-- ============================================================
-- Categorías de gasto creadas por el equipo
-- Date: 2026-11-03
--
-- The built-in categories live in code (cashflow/types.ts). These are the
-- ones added from Ajustes → Categorías de gasto: each has its nature
-- (COGS, OPEX or CAPEX) and, for fixed assets, a suggested useful life.
-- Expenses keep the category by name, so a category is deactivated, never
-- deleted or renamed. Its default ledger account lives with the other
-- category accounts in siigo_settings.config.expense_accounts.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  expense_type        TEXT NOT NULL CHECK (expense_type IN ('COGS', 'OPEX', 'CAPEX')),
  -- Fixed assets only: suggested useful life in months.
  depreciation_months INTEGER CHECK (depreciation_months IS NULL OR depreciation_months > 0),
  active              BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_key ON public.expense_categories (lower(name));

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage expense categories" ON public.expense_categories;
CREATE POLICY "Admins manage expense categories" ON public.expense_categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
