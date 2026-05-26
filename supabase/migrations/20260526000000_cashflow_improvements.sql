-- Migration for Cashflow Improvements (Audit, History, and Receipts)

-- 1. Add columns to cashflow_expenses
ALTER TABLE public.cashflow_expenses ADD COLUMN image_url TEXT;
ALTER TABLE public.cashflow_expenses ADD COLUMN created_by UUID REFERENCES public.profiles(id);

-- 2. Add column to daily_cashflows
ALTER TABLE public.daily_cashflows ADD COLUMN created_by UUID REFERENCES public.profiles(id);

-- 3. Create cashflow_audit_logs table
CREATE TABLE IF NOT EXISTS public.cashflow_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    admin_id UUID REFERENCES public.profiles(id),
    action_type VARCHAR(50) NOT NULL, -- 'CREATE_EXPENSE', 'UPDATE_EXPENSE', 'DELETE_EXPENSE', 'UPDATE_CASHFLOW'
    expense_id UUID,
    cashflow_id UUID REFERENCES public.daily_cashflows(id) ON DELETE CASCADE,
    details JSONB
);

-- RLS setup for audit logs
ALTER TABLE public.cashflow_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cashflow audit logs" ON public.cashflow_audit_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert cashflow audit logs" ON public.cashflow_audit_logs
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

-- 4. Create storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage bucket 'receipts'
CREATE POLICY "Admins can view receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert receipts" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update receipts" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete receipts" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );
