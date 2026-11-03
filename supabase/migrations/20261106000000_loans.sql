-- ============================================================
-- Pasivos: préstamos de terceros y de socios
-- Date: 2026-11-06
--
-- Each loan has a scheme:
--   interes_mensual: interest paid every month (e.g. 3% on the day 8)
--   capitaliza:      interest added to the capital every N months until the
--                    maturity (it is a cost every month, but no money leaves)
--   sin_interes:     partners' loans, returned when the business can
-- Movements: desembolso, pago_interes, abono_capital, pago_final. A payment
-- is also a Flujo de Caja expense (interest: expense; capital: balance
-- movement), unless it was already there. `tracked_from`: payments before it
-- are not asked for (loans loaded at the September 2026 cutoff).
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.loans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_name           TEXT NOT NULL,
  creditor_kind           TEXT NOT NULL CHECK (creditor_kind IN ('tercero', 'socio')),
  scheme                  TEXT NOT NULL CHECK (scheme IN ('interes_mensual', 'capitaliza', 'sin_interes')),
  principal               NUMERIC(14, 2) NOT NULL CHECK (principal > 0),
  start_date              DATE NOT NULL,
  -- Monthly rate as a fraction: 0.03 = 3% mensual.
  monthly_rate            NUMERIC(8, 6) NOT NULL DEFAULT 0 CHECK (monthly_rate >= 0),
  capitalize_every_months INTEGER CHECK (capitalize_every_months IS NULL OR capitalize_every_months > 0),
  payment_day             INTEGER CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31),
  maturity_date           DATE,
  tracked_from            DATE,
  notes                   TEXT,
  active                  BOOLEAN NOT NULL DEFAULT true,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loan_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id       UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  move_date     DATE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('desembolso', 'pago_interes', 'abono_capital', 'pago_final')),
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  notes         TEXT,
  -- Its Flujo de Caja row; owned = created with the movement (deleted with it).
  expense_id    UUID REFERENCES public.cashflow_expenses(id) ON DELETE SET NULL,
  expense_owned BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loan_movements_loan_idx ON public.loan_movements (loan_id, move_date);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage loans" ON public.loans;
CREATE POLICY "Admins manage loans" ON public.loans FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins manage loan movements" ON public.loan_movements;
CREATE POLICY "Admins manage loan movements" ON public.loan_movements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
