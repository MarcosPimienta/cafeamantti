-- ============================================================
-- Add workflow fields to existing tables
-- Created: 2026-04-14
-- ============================================================

-- inventory_movements: add date, responsable, entry_type, tab_source
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS movement_date DATE,
  ADD COLUMN IF NOT EXISTS responsable TEXT,
  ADD COLUMN IF NOT EXISTS entry_type TEXT CHECK (entry_type IN ('MP', 'MAT')),
  ADD COLUMN IF NOT EXISTS tab_source TEXT CHECK (tab_source IN ('entrada', 'trilla', 'prod_consumo', 'prod_alta', 'salida'));

-- Backfill movement_date from created_at for existing rows
UPDATE public.inventory_movements
  SET movement_date = created_at::date
  WHERE movement_date IS NULL;

-- production_batches: add per-batch date and rendimiento factor
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS movement_date DATE,
  ADD COLUMN IF NOT EXISTS rendimiento_pct NUMERIC DEFAULT 0.735;

UPDATE public.production_batches
  SET movement_date = created_at::date
  WHERE movement_date IS NULL;
