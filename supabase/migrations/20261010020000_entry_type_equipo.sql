-- ============================================================
-- Allow EQP (equipo) as an Entradas entry type
-- Date: 2026-10-10
--
-- inventory_movements.entry_type was created with an inline
-- CHECK (entry_type IN ('MP', 'MAT')). Equipment purchases (e.g.
-- espresso machines for comodato) are registered as EQP.
-- ============================================================

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_entry_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_entry_type_check
  CHECK (entry_type IS NULL OR entry_type IN ('MP', 'MAT', 'EQP'));
