-- ============================================================
-- Cuentas de cobro que traen producto al inventario
-- Date: 2026-11-13
--
-- A supplier without a factura (Daniel selling green coffee or pergamino)
-- bills with a cuenta de cobro. Like a purchase invoice, each of its items
-- can say which product enters the inventory and how much; the entrada is
-- written when the cuenta de cobro is saved, moves with its edits, and goes
-- away when it is deleted (refused if that stock was already used).
-- cuenta_cobro_id ties the entrada to its cuenta de cobro.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS cuenta_cobro_id UUID REFERENCES public.cuentas_cobro(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_cuenta_cobro_idx
  ON public.inventory_movements (cuenta_cobro_id) WHERE cuenta_cobro_id IS NOT NULL;
