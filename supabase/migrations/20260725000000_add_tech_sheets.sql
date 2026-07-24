-- Migration to add coffee_tech_sheets table
-- Created: 2026-07-25

CREATE TABLE IF NOT EXISTS public.coffee_tech_sheets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT 'FICHA TÉCNICA',
    history_title TEXT DEFAULT 'Historia',
    history_text TEXT,
    origin TEXT,
    farm_name TEXT,
    location TEXT,
    altitude TEXT,
    variety TEXT,
    process TEXT,
    roast_level TEXT,
    sca_score NUMERIC(4, 2),
    sensory_profile TEXT,
    acidity TEXT,
    body TEXT,
    sweetness TEXT,
    image_url TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#717861',
    bg_color TEXT DEFAULT '#f2f0eb',
    status TEXT DEFAULT 'Publicado' CHECK (status IN ('Borrador', 'Publicado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.coffee_tech_sheets ENABLE ROW LEVEL SECURITY;

-- Policy for admins
DROP POLICY IF EXISTS "Admins can manage coffee_tech_sheets" ON public.coffee_tech_sheets;
CREATE POLICY "Admins can manage coffee_tech_sheets" 
    ON public.coffee_tech_sheets FOR ALL 
    USING (public.is_admin());

-- Also allow public select if needed for sharing/viewing
DROP POLICY IF EXISTS "Anyone can view tech sheets" ON public.coffee_tech_sheets;
CREATE POLICY "Anyone can view tech sheets"
    ON public.coffee_tech_sheets FOR SELECT
    USING (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS on_coffee_tech_sheets_updated ON public.coffee_tech_sheets;
CREATE TRIGGER on_coffee_tech_sheets_updated
    BEFORE UPDATE ON public.coffee_tech_sheets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
