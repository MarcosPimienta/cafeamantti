-- ============================================================
-- Migration: Add Siigo sales import support to orders
-- Date: 2026-09-24
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS siigo_invoice TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_siigo_invoice ON public.orders (siigo_invoice);
CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders (source);
