-- Create quotes table
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Borrador' CHECK (status IN ('Borrador', 'Enviada', 'Aprobada', 'Rechazada')),
    orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait', 'landscape')),
    total_amount NUMERIC NOT NULL DEFAULT 0,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create quote items table
CREATE TABLE IF NOT EXISTS public.quote_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT, -- Referencia al inventario o null si es "Otro"
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Policies for admins
CREATE POLICY "Admins can manage all quotes" 
    ON public.quotes FOR ALL 
    USING (public.is_admin());

CREATE POLICY "Admins can manage all quote items" 
    ON public.quote_items FOR ALL 
    USING (public.is_admin());

-- Triggers for updated_at
CREATE TRIGGER on_quotes_updated
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
