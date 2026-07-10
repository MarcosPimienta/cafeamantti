-- Add missing tax columns to public.quotes table (resolves missing columns in database)
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS apply_iva BOOLEAN DEFAULT FALSE;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS iva_rate NUMERIC DEFAULT 0;

-- Backfill: existing quotes that have apply_iva as true should default to 5%
UPDATE public.quotes SET iva_rate = 5 WHERE apply_iva = TRUE;
