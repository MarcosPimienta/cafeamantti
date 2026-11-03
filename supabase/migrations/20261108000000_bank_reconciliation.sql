-- ============================================================
-- Conciliación bancaria: extractos del banco contra Flujo de Caja
-- Date: 2026-11-08
--
-- bank_statements: one per account and month (the Davivienda PDF, read in
--   the app; the file itself is not kept).
-- bank_lines:      its movements (+ in, − out), as the bank printed them.
-- bank_matches:    lines explained together:
--   flujo     by Flujo de Caja rows that add up the same (bank_match_rows),
--   reverso   a returned transfer and the debit it undoes (they add up 0),
--   ignorado  left out on purpose, with a note.
-- A Flujo de Caja row explains one match at most. `owned`: the row was
-- created from the statement, so undoing the match deletes it.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bank_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank            TEXT NOT NULL DEFAULT 'davivienda',
  account_number  TEXT NOT NULL,
  period_month    DATE NOT NULL,
  opening_balance NUMERIC(14, 2) NOT NULL,
  closing_balance NUMERIC(14, 2) NOT NULL,
  file_name       TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank, account_number, period_month)
);

CREATE TABLE IF NOT EXISTS public.bank_matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('flujo', 'reverso', 'ignorado')),
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  line_date    DATE NOT NULL,
  amount       NUMERIC(14, 2) NOT NULL CHECK (amount <> 0),
  doc          TEXT,
  description  TEXT NOT NULL DEFAULT '',
  office       TEXT,
  match_id     UUID REFERENCES public.bank_matches(id) ON DELETE SET NULL,
  UNIQUE (statement_id, position)
);
CREATE INDEX IF NOT EXISTS bank_lines_match_idx ON public.bank_lines (match_id);

CREATE TABLE IF NOT EXISTS public.bank_match_rows (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES public.bank_matches(id) ON DELETE CASCADE,
  income_id  UUID REFERENCES public.cashflow_incomes(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.cashflow_expenses(id) ON DELETE CASCADE,
  owned      BOOLEAN NOT NULL DEFAULT false,
  CHECK ((income_id IS NULL) <> (expense_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_match_rows_income_uq ON public.bank_match_rows (income_id) WHERE income_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_match_rows_expense_uq ON public.bank_match_rows (expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_match_rows_match_idx ON public.bank_match_rows (match_id);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_match_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bank statements" ON public.bank_statements;
CREATE POLICY "Admins manage bank statements" ON public.bank_statements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage bank lines" ON public.bank_lines;
CREATE POLICY "Admins manage bank lines" ON public.bank_lines FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage bank matches" ON public.bank_matches;
CREATE POLICY "Admins manage bank matches" ON public.bank_matches FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage bank match rows" ON public.bank_match_rows;
CREATE POLICY "Admins manage bank match rows" ON public.bank_match_rows FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
