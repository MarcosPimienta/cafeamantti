-- Add inventory association to cashflow_incomes
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_sold NUMERIC DEFAULT 0;

-- Add income_id association to inventory_movements to support cascading/reverting adjustments
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS income_id UUID REFERENCES public.cashflow_incomes(id) ON DELETE CASCADE;
