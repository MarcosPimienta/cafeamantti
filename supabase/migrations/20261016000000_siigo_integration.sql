-- ============================================================
-- Siigo Nube API integration
-- Date: 2026-10-16
--
-- siigo_settings   one row with the ids chosen in Ajustes → Siigo
--                  (invoice document type, seller, payment types,
--                  IVA tax, purchase document type, inventory group…).
--                  Credentials are NOT stored here: they live in the
--                  SIIGO_USERNAME / SIIGO_ACCESS_KEY environment variables.
-- siigo_sync_log   every call that creates something in Siigo (or
--                  fails to): what, which local record, the Siigo id
--                  and the error, for support and auditing.
--
-- Links from local records to Siigo:
--   orders             siigo_invoice_id / siigo_status / siigo_cufe /
--                      siigo_public_url / siigo_error (siigo_invoice, the
--                      FV-x-n name, already exists)
--   clients            siigo_customer_id, city_code (DANE, 5 digits:
--                      Siigo needs it to create the customer)
--   inventory          siigo_product_id
--   cashflow_expenses  siigo_purchase_id / siigo_purchase_name /
--                      siigo_error, supplier_id (the purchase needs the
--                      supplier's NIT)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.siigo_settings (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.siigo_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.siigo_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage siigo settings" ON public.siigo_settings;
CREATE POLICY "Admins can manage siigo settings" ON public.siigo_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.siigo_sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity      TEXT NOT NULL CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection')),
  local_id    TEXT,
  siigo_id    TEXT,
  siigo_name  TEXT,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  message     TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_siigo_sync_log_created ON public.siigo_sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_siigo_sync_log_local ON public.siigo_sync_log (entity, local_id);

ALTER TABLE public.siigo_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage siigo sync log" ON public.siigo_sync_log;
CREATE POLICY "Admins can manage siigo sync log" ON public.siigo_sync_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS siigo_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS siigo_status     TEXT,
  ADD COLUMN IF NOT EXISTS siigo_cufe       TEXT,
  ADD COLUMN IF NOT EXISTS siigo_public_url TEXT,
  ADD COLUMN IF NOT EXISTS siigo_error      TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_siigo_invoice_id ON public.orders (siigo_invoice_id) WHERE siigo_invoice_id IS NOT NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS siigo_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS city_code         TEXT CHECK (city_code IS NULL OR city_code ~ '^[0-9]{5}$');

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS siigo_product_id TEXT;

ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS supplier_id         UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS siigo_purchase_id   TEXT,
  ADD COLUMN IF NOT EXISTS siigo_purchase_name TEXT,
  ADD COLUMN IF NOT EXISTS siigo_error         TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_siigo_purchase_id ON public.cashflow_expenses (siigo_purchase_id) WHERE siigo_purchase_id IS NOT NULL;
