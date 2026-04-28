-- Create clients table for CRM/B2B (No authentication required)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Admins can manage all clients
CREATE POLICY "Admins can manage all clients" 
    ON public.clients FOR ALL 
    USING (public.is_admin());

-- Triggers for updated_at
CREATE TRIGGER on_clients_updated
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add client_id to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
