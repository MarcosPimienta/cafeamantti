-- ============================================================
-- Production Batches Table
-- Created: 2026-04-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    process_type TEXT NOT NULL CHECK (process_type IN ('trilla', 'tostion')),
    input_inventory_id UUID REFERENCES public.inventory(id) ON DELETE RESTRICT NOT NULL,
    input_quantity_kg NUMERIC NOT NULL CHECK (input_quantity_kg > 0),
    output_inventory_id UUID REFERENCES public.inventory(id) ON DELETE RESTRICT NOT NULL,
    output_quantity_kg NUMERIC NOT NULL CHECK (output_quantity_kg > 0),
    weight_loss_pct NUMERIC NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage production batches"
    ON public.production_batches FOR ALL
    USING (public.is_admin());
