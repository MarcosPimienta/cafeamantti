-- ============================================================
-- Reempaque (repack) of roasted coffee
-- Date: 2026-09-30
--
-- Packaged coffee is sometimes opened and re-packed: a 2.5kg bag
-- split into 250g bags or samples, or several small bags combined
-- into a bigger one. One repack batch groups every movement of
-- that operation (salidas of the opened bags, entradas of the new
-- ones, packaging consumed, and the leftover returned to bulk) so
-- it shows up as one step in the Kardex and can be reverted as a
-- whole.
--
-- Kilos are conserved: output_kg <= input_kg. The difference
-- (sobrante_kg) either goes back to bulk coffee of the same
-- profile ('granel') or is written off ('merma').
-- ============================================================

CREATE TABLE IF NOT EXISTS public.repack_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date    DATE NOT NULL,
  input_kg         NUMERIC NOT NULL CHECK (input_kg > 0),
  output_kg        NUMERIC NOT NULL CHECK (output_kg >= 0),
  sobrante_kg      NUMERIC NOT NULL DEFAULT 0 CHECK (sobrante_kg >= 0),
  sobrante_destino TEXT CHECK (sobrante_destino IS NULL OR sobrante_destino IN ('granel', 'merma')),
  notes            TEXT,
  era              TEXT NOT NULL DEFAULT 'v2',
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (output_kg <= input_kg)
);

ALTER TABLE public.repack_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage repack batches" ON public.repack_batches;
CREATE POLICY "Admins can manage repack batches"
  ON public.repack_batches FOR ALL
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_repack_batches_era_date
  ON public.repack_batches (era, movement_date DESC);

-- Movements belong to their batch. Deleting a batch is done by the app,
-- which reverses stock first, so SET NULL here only guards against a
-- manual delete leaving dangling ids.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS repack_batch_id UUID
  REFERENCES public.repack_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_repack_batch
  ON public.inventory_movements (repack_batch_id)
  WHERE repack_batch_id IS NOT NULL;
