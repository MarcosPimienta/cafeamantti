-- Migration: Add Cuentas de Cobro (Billing Accounts for Natural Persons)
-- Date: 2026-06-25

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.cuentas_cobro (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    number SERIAL,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'firmada', 'rechazada')),
    
    -- Issuer (natural person details)
    issuer_name TEXT NOT NULL,
    issuer_document TEXT NOT NULL, -- Cedula
    issuer_email TEXT NOT NULL,
    issuer_phone TEXT NOT NULL,
    
    -- Bank details (optional, filled when signing)
    bank_name TEXT,
    bank_account_type TEXT, -- 'Ahorros' or 'Corriente'
    bank_account_number TEXT,
    
    -- Document details
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of service/product items
    total_amount NUMERIC NOT NULL DEFAULT 0,
    concept TEXT,
    
    -- Signature info
    signature_data TEXT, -- Base64 representation of the signature
    signature_type TEXT CHECK (signature_type IN ('scribble', 'typed')),
    signed_at TIMESTAMP WITH TIME ZONE,
    
    -- Integration with Expenses (optional link to daily cashflow expense)
    expense_id UUID REFERENCES public.cashflow_expenses(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.cuentas_cobro ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can manage all cuentas_cobro" 
    ON public.cuentas_cobro FOR ALL 
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Public can read a single document by its UUID
CREATE POLICY "Public can view single accounts by id" 
    ON public.cuentas_cobro FOR SELECT 
    USING (true);

-- Public can update a single document by its UUID to sign it (only if status is 'pendiente')
CREATE POLICY "Public can sign accounts" 
    ON public.cuentas_cobro FOR UPDATE 
    USING (status = 'pendiente')
    WITH CHECK (status = 'firmada' OR status = 'pendiente');

-- 4. Set up updated_at trigger
DROP TRIGGER IF EXISTS on_cuentas_cobro_updated ON public.cuentas_cobro;
CREATE TRIGGER on_cuentas_cobro_updated
    BEFORE UPDATE ON public.cuentas_cobro
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
