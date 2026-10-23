-- ============================================================
-- Saldos a favor → Siigo: cruces y devoluciones
-- Date: 2026-10-30
--
-- A cruce (the balance pays a document) and a devolución go to Siigo as a
-- journal (comprobante contable) that credits 13300501 against each
-- anticipo's egreso (RP-1-…), as the accountant does by hand. `applied`
-- records which anticipos each one took: [{ advance_id, amount }].
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.supplier_advances
  ADD COLUMN IF NOT EXISTS applied JSONB NOT NULL DEFAULT '[]'::jsonb;
