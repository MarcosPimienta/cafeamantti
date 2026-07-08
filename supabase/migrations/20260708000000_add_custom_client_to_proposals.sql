-- Add custom client fields to proposals table
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS custom_client_name TEXT,
ADD COLUMN IF NOT EXISTS custom_client_document TEXT,
ADD COLUMN IF NOT EXISTS custom_client_email TEXT,
ADD COLUMN IF NOT EXISTS custom_client_phone TEXT;
