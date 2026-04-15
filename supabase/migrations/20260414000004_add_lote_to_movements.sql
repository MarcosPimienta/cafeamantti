-- ============================================================
-- Add lote (batch reference) column to inventory_movements
-- Format: L{YYYY}-{MM}-{CODE}{SEQ}
-- Example: L2025-01-P00  (Pergamino, lote 00, Jan 2025)
--          L2025-02-V01  (Café Verde, lote 01, Feb 2025)
-- Created: 2026-04-14
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS lote TEXT;
