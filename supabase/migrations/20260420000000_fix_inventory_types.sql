-- ============================================================
-- Fix Inventory Types: Change INTEGER to NUMERIC for decimals
-- ============================================================

-- 1. Alter inventory table
ALTER TABLE public.inventory 
    ALTER COLUMN current_stock TYPE NUMERIC USING current_stock::NUMERIC,
    ALTER COLUMN min_stock TYPE NUMERIC USING min_stock::NUMERIC;

-- 2. Alter inventory_movements table
ALTER TABLE public.inventory_movements 
    ALTER COLUMN quantity TYPE NUMERIC USING quantity::NUMERIC;

-- 3. Alter production_batches table (if it exists and has integer columns)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'production_batches') THEN
        ALTER TABLE public.production_batches 
            ALTER COLUMN input_quantity_kg TYPE NUMERIC USING input_quantity_kg::NUMERIC,
            ALTER COLUMN output_quantity_kg TYPE NUMERIC USING output_quantity_kg::NUMERIC;
    END IF;
END $$;
