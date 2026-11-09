-- ============================================================
-- Notas crédito parciales de proveedores
-- Date: 2026-11-14
--
-- A supplier's credit note could only void a whole purchase invoice. Now it
-- can also lower part of it (a discount, a price corrected, one item of
-- several): the invoice stays, and what is owed drops by the note. If the
-- invoice was already paid beyond its new value, that excess becomes saldo a
-- favor with the supplier and stops being a cost in Flujo de Caja (the
-- payment's rows are split; split_rows keeps how, to undo it).
--
-- partial: the note lowers the invoice instead of voiding it. An invoice can
--   have several partial notes, or one that voids it.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.purchase_credit_notes
  ADD COLUMN IF NOT EXISTS partial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_rows JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.purchase_credit_notes DROP CONSTRAINT IF EXISTS purchase_credit_notes_bill_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_credit_notes_one_void_idx
  ON public.purchase_credit_notes (bill_id) WHERE NOT partial;
CREATE INDEX IF NOT EXISTS purchase_credit_notes_bill_idx ON public.purchase_credit_notes (bill_id);
