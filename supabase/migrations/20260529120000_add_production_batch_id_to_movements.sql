-- ============================================================
-- Add production_batch_id to inventory_movements referencing production_batches(id) ON DELETE CASCADE
-- Created: 2026-05-29
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS production_batch_id UUID REFERENCES public.production_batches(id) ON DELETE CASCADE;
