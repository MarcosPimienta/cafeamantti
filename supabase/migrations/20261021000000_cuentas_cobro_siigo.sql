-- ============================================================
-- Signed cuentas de cobro → Siigo support documents
-- Date: 2026-10-21
--
-- A signed expense cuenta de cobro (from a natural person who does not
-- invoice) is sent to Siigo as a "documento soporte" from the admin.
-- These columns keep what Siigo returned, or why it failed. The signed
-- PDF stays in the app: Siigo's API takes no attachments.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.cuentas_cobro
  ADD COLUMN IF NOT EXISTS siigo_ds_id      TEXT,
  ADD COLUMN IF NOT EXISTS siigo_ds_name    TEXT,
  ADD COLUMN IF NOT EXISTS siigo_ds_status  TEXT,
  ADD COLUMN IF NOT EXISTS siigo_ds_error   TEXT,
  ADD COLUMN IF NOT EXISTS siigo_ds_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_cobro_siigo_ds_id_key ON public.cuentas_cobro (siigo_ds_id) WHERE siigo_ds_id IS NOT NULL;

ALTER TABLE public.siigo_sync_log DROP CONSTRAINT IF EXISTS siigo_sync_log_entity_check;
ALTER TABLE public.siigo_sync_log ADD CONSTRAINT siigo_sync_log_entity_check
  CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection', 'voucher', 'support_document'));
