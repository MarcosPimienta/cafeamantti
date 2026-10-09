-- ============================================================
-- Maquila de empaque — economic proposals
-- Date: 2026-10-12
--
-- Amantti packs and labels coffee that a client brings, charging
-- per packed unit. A proposal holds one line per presentation
-- (lines JSONB: grams, monthly units, materials with cost and who
-- supplies them, labor, target margin, agreed price) plus the
-- conditions and settings (merma, IVA). Costs and margins are for
-- the internal view only; the client PDF shows prices.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.maquila_proposals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  custom_client_name TEXT,
  title              TEXT NOT NULL DEFAULT 'Propuesta de maquila de empaque',
  proposal_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until        DATE,
  status             TEXT NOT NULL DEFAULT 'borrador'
                     CHECK (status IN ('borrador', 'enviada', 'aceptada', 'rechazada')),
  intro              TEXT,
  conditions         TEXT,
  minimum_units      INTEGER CHECK (minimum_units IS NULL OR minimum_units >= 0),
  settings           JSONB NOT NULL DEFAULT '{"merma_pct": 1, "apply_iva": true, "iva_pct": 19}'::jsonb,
  lines              JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  internal_notes     TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maquila_proposals_created ON public.maquila_proposals (created_at DESC);

ALTER TABLE public.maquila_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage maquila proposals" ON public.maquila_proposals;
CREATE POLICY "Admins can manage maquila proposals"
  ON public.maquila_proposals FOR ALL
  USING (public.is_admin());
