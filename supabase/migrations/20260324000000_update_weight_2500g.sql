-- Update weight constraint and migrate existing data
-- Drop existing constraint (Postgres default name is table_column_check)
ALTER TABLE public.subscriptions 
DROP CONSTRAINT IF EXISTS subscriptions_weight_check;

-- Update existing 1kg records to 2.5kg
UPDATE public.subscriptions 
SET weight = '2.5kg' 
WHERE weight = '1kg';

-- Add new constraint with updated values
ALTER TABLE public.subscriptions 
ADD CONSTRAINT subscriptions_weight_check 
CHECK (weight IN ('250g', '500g', '2.5kg'));
