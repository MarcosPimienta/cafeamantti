-- ============================================================
-- Sedes de clientes (sucursales en Siigo)
-- Date: 2026-11-02
--
-- A company (one NIT) can have several sedes (e.g. GRUPO PROFITNESS →
-- Smart Fit Fabricato, Smart Fit Mayorca…). Each sede is synced to Siigo
-- as a branch office of the same NIT (sucursal 1, 2…), with its own name
-- and address. An order says which sede it is for; its invoice goes to
-- that branch in Siigo and carries the sede in its observations, and the
-- receivables statement groups by sede.
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_sites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  address             TEXT,
  city                TEXT,
  -- DANE code of the city (5 digits): Siigo needs it to create the branch.
  city_code           TEXT,
  contact_name        TEXT,
  phone               TEXT,
  notes               TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  -- Its branch office in Siigo (null = not synced yet; 0 is the NIT's main one).
  siigo_branch_office INTEGER,
  siigo_customer_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_sites_name_key ON public.client_sites (client_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS client_sites_branch_key ON public.client_sites (client_id, siigo_branch_office) WHERE siigo_branch_office IS NOT NULL;

ALTER TABLE public.client_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage client sites" ON public.client_sites;
CREATE POLICY "Admins manage client sites" ON public.client_sites FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.client_sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_site_idx ON public.orders (site_id);

-- The invoice keeps its sede and the Siigo branch it was issued to (its
-- payments must go to the same one).
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS site_id       UUID REFERENCES public.client_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_office INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sales_invoices_site_idx ON public.sales_invoices (site_id);

-- The receivables statement reads balances from Siigo. Invoices made
-- directly in Siigo (no app invoice to hold a sede) get theirs here when
-- someone assigns it on the statement.
CREATE TABLE IF NOT EXISTS public.siigo_invoice_sites (
  siigo_invoice_id TEXT PRIMARY KEY,
  site_id          UUID NOT NULL REFERENCES public.client_sites(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.siigo_invoice_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage siigo invoice sites" ON public.siigo_invoice_sites;
CREATE POLICY "Admins manage siigo invoice sites" ON public.siigo_invoice_sites FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
