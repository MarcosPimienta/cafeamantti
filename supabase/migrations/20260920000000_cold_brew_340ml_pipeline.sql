-- ============================================================
-- Migration: Add Cold Brew 340ml and configure pipeline for Café 11:11
-- Date: 2026-09-20
-- ============================================================

-- 1. Insert Cold Brew 340ml finished product into inventory
INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock, notes)
VALUES
    ('CAFC-340ML', 'Cold Brew 340ml', 'cafe', 'unidad', 0, 10, 'Cold Brew 340ml elaborado por tercero Café 11:11')
ON CONFLICT (product_code) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    notes = EXCLUDED.notes;

-- 2. Update production_batches check constraint to allow 'cold_brew'
ALTER TABLE public.production_batches
    DROP CONSTRAINT IF EXISTS production_batches_process_type_check;

ALTER TABLE public.production_batches
    ADD CONSTRAINT production_batches_process_type_check
    CHECK (process_type IN ('trilla', 'tostion', 'cold_brew'));

-- 3. Add third_party column to production_batches if not exists
ALTER TABLE public.production_batches
    ADD COLUMN IF NOT EXISTS third_party TEXT DEFAULT NULL;

-- 4. Update inventory_movements tab_source check constraint to allow 'cold_brew'
ALTER TABLE public.inventory_movements
    DROP CONSTRAINT IF EXISTS inventory_movements_tab_source_check;

ALTER TABLE public.inventory_movements
    ADD CONSTRAINT inventory_movements_tab_source_check
    CHECK (tab_source IN ('entrada', 'trilla', 'prod_consumo', 'prod_alta', 'salida', 'cold_brew'));

-- 5. Register Café 11:11 in suppliers table
INSERT INTO public.suppliers (name, document_type)
SELECT 'Café 11:11', 'NIT'
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE name ILIKE '%11:11%');
