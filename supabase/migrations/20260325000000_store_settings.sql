-- Create store_settings table (single row enforced by id=1)
CREATE TABLE IF NOT EXISTS public.store_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    store_name TEXT NOT NULL DEFAULT 'Café Amantti',
    admin_email TEXT NOT NULL DEFAULT 'admin@cafeamantti.com',
    base_currency TEXT NOT NULL DEFAULT 'COP',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert the default row if it doesn't exist
INSERT INTO public.store_settings (id, store_name, admin_email, base_currency) 
VALUES (1, 'Café Amantti', 'admin@cafeamantti.com', 'COP') 
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Admins can view and update settings
CREATE POLICY "Admins can manage store settings" 
    ON public.store_settings 
    FOR ALL 
    USING (public.is_admin());

-- Public can view store settings
CREATE POLICY "Public can view store settings" 
    ON public.store_settings 
    FOR SELECT 
    USING (true);

-- Trigger for updated_at
CREATE TRIGGER on_store_settings_updated
    BEFORE UPDATE ON public.store_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
