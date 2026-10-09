-- ============================================================
-- Allow ENS (enseres) as an Entradas entry type
-- Date: 2026-10-10
--
-- Purchases of furniture and fixtures (cafeteras, muebles) get
-- their own entry type, separate from EQP (equipo). Safe to run
-- whether or not 20261010020000_entry_type_equipo.sql was applied:
-- it leaves the final list either way.
--
-- Keep this list in sync with utils/inventory/categories.ts.
-- ============================================================

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_entry_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_entry_type_check
  CHECK (entry_type IS NULL OR entry_type IN ('MP', 'MAT', 'EQP', 'ENS'));
