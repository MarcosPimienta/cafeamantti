-- Add iva_rate column to public.quote_items table
ALTER TABLE public.quote_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC DEFAULT 0;

-- Backfill: update items to match the parent quote's iva_rate if it had apply_iva active
UPDATE public.quote_items qi
SET iva_rate = q.iva_rate
FROM public.quotes q
WHERE qi.quote_id = q.id AND q.apply_iva = TRUE;
