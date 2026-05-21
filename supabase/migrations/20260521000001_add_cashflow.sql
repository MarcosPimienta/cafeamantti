-- Migration for Cashflow Module

CREATE TABLE public.daily_cashflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    initial_balance NUMERIC NOT NULL DEFAULT 0,
    daily_income NUMERIC NOT NULL DEFAULT 0,
    final_balance NUMERIC NOT NULL DEFAULT 0,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

CREATE TABLE public.cashflow_expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cashflow_id UUID REFERENCES public.daily_cashflows(id) ON DELETE CASCADE NOT NULL,
    concept TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- RLS setup
ALTER TABLE public.daily_cashflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_expenses ENABLE ROW LEVEL SECURITY;

-- Policies for daily_cashflows
CREATE POLICY "Admins can view daily cashflows"
    ON public.daily_cashflows FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can insert daily cashflows"
    ON public.daily_cashflows FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update daily cashflows"
    ON public.daily_cashflows FOR UPDATE
    USING (public.is_admin());

CREATE POLICY "Admins can delete daily cashflows"
    ON public.daily_cashflows FOR DELETE
    USING (public.is_admin());

-- Policies for cashflow_expenses
CREATE POLICY "Admins can view cashflow expenses"
    ON public.cashflow_expenses FOR SELECT
    USING (public.is_admin());

CREATE POLICY "Admins can insert cashflow expenses"
    ON public.cashflow_expenses FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update cashflow expenses"
    ON public.cashflow_expenses FOR UPDATE
    USING (public.is_admin());

CREATE POLICY "Admins can delete cashflow expenses"
    ON public.cashflow_expenses FOR DELETE
    USING (public.is_admin());
