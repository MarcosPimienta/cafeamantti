-- ============================================================
-- Inventory System Migration
-- Created: 2026-04-14
-- ============================================================

-- -------------------------------------------------------
-- 1. inventory table
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_code TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'cafe' CHECK (category IN ('cafe', 'empaque', 'accesorio')),
    unit TEXT NOT NULL DEFAULT 'unidad',
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -------------------------------------------------------
-- 2. inventory_movements table (audit log)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entrada', 'salida', 'ajuste')),
    quantity INTEGER NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -------------------------------------------------------
-- 3. Enable RLS
-- -------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 4. RLS Policies — admin only
-- -------------------------------------------------------
CREATE POLICY "Admins can manage inventory"
    ON public.inventory FOR ALL
    USING (public.is_admin());

CREATE POLICY "Admins can manage inventory movements"
    ON public.inventory_movements FOR ALL
    USING (public.is_admin());

-- -------------------------------------------------------
-- 5. updated_at trigger for inventory
-- -------------------------------------------------------
CREATE TRIGGER on_inventory_updated
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -------------------------------------------------------
-- 6. Pre-seed the 12 products
-- -------------------------------------------------------
INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock)
VALUES
    ('CAPG-001',  'Café Pergamino',              'cafe',      'kg',     0, 10),
    ('CAFV-001',  'Café Verde',                  'cafe',      'kg',     0, 10),
    ('CAFT-125G', 'Café Tostado 125g',           'cafe',      'unidad', 0, 20),
    ('CAFT-250G', 'Café Tostado 250g',           'cafe',      'unidad', 0, 20),
    ('CAFT-500G', 'Café Tostado 500g',           'cafe',      'unidad', 0, 15),
    ('CAFT-2K5',  'Café Tostado 2.5kg',          'cafe',      'unidad', 0, 10),
    ('CAFT-001',  'Café Tostado KG',             'cafe',      'kg',     0, 10),
    ('EMP-BOLSA', 'Bolsa Empaque',               'empaque',   'unidad', 0, 50),
    ('ETQ-CAFE',  'Etiqueta Café',               'empaque',   'unidad', 0, 100),
    ('STK-AMT',   'Stickers Amantti',            'empaque',   'unidad', 0, 50),
    ('POC-001',   'Pocillo',                     'accesorio', 'unidad', 0, 5),
    ('SACF-001',  'Sacos de fique',              'empaque',   'unidad', 0, 10)
ON CONFLICT (product_code) DO NOTHING;
