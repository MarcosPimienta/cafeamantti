-- Migration for Cashflow Incomes

CREATE TABLE public.cashflow_incomes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cashflow_id UUID REFERENCES public.daily_cashflows(id) ON DELETE CASCADE NOT NULL,
    concept TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- RLS setup
ALTER TABLE public.cashflow_incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cashflow incomes"
    ON public.cashflow_incomes FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can insert cashflow incomes"
    ON public.cashflow_incomes FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update cashflow incomes"
    ON public.cashflow_incomes FOR UPDATE
    USING (public.is_admin());

CREATE POLICY "Admins can delete cashflow incomes"
    ON public.cashflow_incomes FOR DELETE
    USING (public.is_admin());

-- Modify audit logs to support income
-- Wait, the enum action_type is VARCHAR(50), so we can just use 'CREATE_INCOME', 'UPDATE_INCOME', 'DELETE_INCOME'
ALTER TABLE public.cashflow_audit_logs ADD COLUMN income_id UUID;
