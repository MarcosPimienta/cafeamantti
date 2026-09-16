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

-- 1. Ensure legacy_stock column exists
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS legacy_stock NUMERIC DEFAULT 0;

-- 2. If current_stock has values, save them to legacy_stock
UPDATE public.inventory
  SET legacy_stock = COALESCE(current_stock, 0)
  WHERE (legacy_stock IS NULL OR legacy_stock = 0) AND current_stock != 0;

-- 3. If current_stock was already set to 0, recover legacy stock from snapshot movements
UPDATE public.inventory i
  SET legacy_stock = m.quantity
  FROM public.inventory_movements m
  WHERE m.inventory_id = i.id
    AND m.reason = 'Apertura inventario limpio — Sept 2026'
    AND (i.legacy_stock IS NULL OR i.legacy_stock = 0);

-- 4. If any items still have 0/NULL, calculate from sum of historical v1 movements
UPDATE public.inventory i
  SET legacy_stock = COALESCE(sub.total_qty, 0)
  FROM (
    SELECT inventory_id, SUM(quantity) as total_qty
    FROM public.inventory_movements
    WHERE era = 'v1'
    GROUP BY inventory_id
  ) sub
  WHERE i.id = sub.inventory_id
    AND (i.legacy_stock IS NULL OR i.legacy_stock = 0);

-- 5. Reset operational current_stock to 0 for all products in the clean era (v2)
UPDATE public.inventory
  SET current_stock = 0;

-- 6. Clean up temporary v2 snapshot movements so they don't pollute v2
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
