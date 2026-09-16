-- ============================================================
-- Migration: Inventory & Cashflow Data Cutover — Sept 2026
-- Date: 2026-09-16
-- Purpose:
--   Introduce an 'era' column to separate legacy messy data (v1)
--   from clean data (v2) starting September 2026.
--   NO data is deleted. Old rows are stamped 'v1'.
--   Opening-balance snapshot movements are created for v2.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — Add 'era' column to operational inventory tables
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — Stamp all pre-September 2026 rows as 'v1'
-- ────────────────────────────────────────────────────────────

UPDATE public.inventory_movements
  SET era = 'v1'
  WHERE movement_date < '2026-09-01'
     OR (movement_date IS NULL AND created_at < '2026-09-01');

UPDATE public.production_batches
  SET era = 'v1'
  WHERE movement_date < '2026-09-01'
     OR (movement_date IS NULL AND created_at < '2026-09-01');

UPDATE public.inventory_logs
  SET era = 'v1'
  WHERE created_at < '2026-09-01';

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — Add 'era' column to cashflow tables
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.daily_cashflows
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS era TEXT NOT NULL DEFAULT 'v2';

-- ────────────────────────────────────────────────────────────
-- SECTION 4 — Stamp pre-September cashflow rows as 'v1'
-- ────────────────────────────────────────────────────────────

UPDATE public.daily_cashflows
  SET era = 'v1'
  WHERE date < '2026-09-01';

-- Stamp expenses/incomes whose parent cashflow is v1
UPDATE public.cashflow_expenses
  SET era = 'v1'
  WHERE cashflow_id IN (
    SELECT id FROM public.daily_cashflows WHERE date < '2026-09-01'
  );

UPDATE public.cashflow_incomes
  SET era = 'v1'
  WHERE cashflow_id IN (
    SELECT id FROM public.daily_cashflows WHERE date < '2026-09-01'
  );

-- ────────────────────────────────────────────────────────────
-- SECTION 5 — Reset current stock to 0 & preserve legacy stock
-- ────────────────────────────────────────────────────────────

-- 1. Preserve legacy stock in a dedicated column before resetting
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS legacy_stock NUMERIC DEFAULT 0;

UPDATE public.inventory
  SET legacy_stock = COALESCE(current_stock, 0);

-- 2. Reset all inventory items to 0 for the clean start from September 2026
UPDATE public.inventory
  SET current_stock = 0;

-- 3. Clean up any previous v2 opening movements that carried over old stock
DELETE FROM public.inventory_movements
  WHERE era = 'v2' AND reason = 'Apertura inventario limpio — Sept 2026';


-- ────────────────────────────────────────────────────────────
-- SECTION 6 — Performance indexes for era filtering
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inventory_movements_era
  ON public.inventory_movements (era);

CREATE INDEX IF NOT EXISTS idx_production_batches_era
  ON public.production_batches (era);

CREATE INDEX IF NOT EXISTS idx_daily_cashflows_era
  ON public.daily_cashflows (era);

CREATE INDEX IF NOT EXISTS idx_cashflow_expenses_era
  ON public.cashflow_expenses (era);

CREATE INDEX IF NOT EXISTS idx_cashflow_incomes_era
  ON public.cashflow_incomes (era);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_era
  ON public.inventory_logs (era);
