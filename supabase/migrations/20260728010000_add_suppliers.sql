-- Migration: Create suppliers (Proveedores) table for procurement & contas de cobro
-- Date: 2026-07-28

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    document_type TEXT DEFAULT 'NIT',
    document_number TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    bank_name TEXT,
    bank_account_type TEXT,
    bank_account_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Admins can manage all suppliers
CREATE POLICY "Admins can manage all suppliers" 
    ON public.suppliers FOR ALL 
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS on_suppliers_updated ON public.suppliers;
CREATE TRIGGER on_suppliers_updated
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
