-- ============================================================
-- Credit notes (notas crédito) on sales invoices
-- Date: 2026-10-24
--
-- A credit note is made from an issued invoice in Facturas (or detected
-- when it was made in Siigo) for one of the DIAN reasons:
--   1 partial return     → chosen units, optionally back into inventory
--   2 full annulment     → the invoice is voided
--   3 discount / 4 price adjustment → only lowers what the customer owes
-- Units returned to inventory are 'entrada' movements linked to the note,
-- so they never mix with the order's own stock movements.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  reason            SMALLINT NOT NULL CHECK (reason IN (1, 2, 3, 4)),
  -- [{ inventory_id, code, name, quantity, unit_price, tax_id, linked, restock }]
  lines             JSONB NOT NULL DEFAULT '[]'::jsonb,
  total             NUMERIC NOT NULL CHECK (total > 0),
  notes             TEXT,
  origin            TEXT NOT NULL DEFAULT 'app' CHECK (origin IN ('app', 'siigo')),
  status            TEXT NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada', 'error')),
  siigo_id          TEXT,
  siigo_name        TEXT,
  siigo_status      TEXT,
  siigo_cude        TEXT,
  siigo_error       TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_notes_invoice_id_idx ON public.credit_notes (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_siigo_id_key ON public.credit_notes (siigo_id) WHERE siigo_id IS NOT NULL;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage credit notes" ON public.credit_notes;
CREATE POLICY "Admins manage credit notes" ON public.credit_notes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id) ON DELETE SET NULL;

ALTER TABLE public.siigo_sync_log DROP CONSTRAINT IF EXISTS siigo_sync_log_entity_check;
ALTER TABLE public.siigo_sync_log ADD CONSTRAINT siigo_sync_log_entity_check
  CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection', 'voucher', 'support_document', 'credit_note'));
