-- Add discount and custom client fields to quotes table
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_client_name TEXT,
ADD COLUMN IF NOT EXISTS custom_client_document TEXT,
ADD COLUMN IF NOT EXISTS custom_client_email TEXT,
ADD COLUMN IF NOT EXISTS custom_client_phone TEXT,
ADD COLUMN IF NOT EXISTS apply_iva BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
