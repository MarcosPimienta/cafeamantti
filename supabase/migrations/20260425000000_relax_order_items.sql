-- ============================================================
-- Relax order_items constraints for manual orders
-- ============================================================

-- Drop check constraints
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_weight_check;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_grind_check;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_grind_level_check;

-- Make columns nullable
ALTER TABLE public.order_items ALTER COLUMN weight DROP NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN grind DROP NOT NULL;
