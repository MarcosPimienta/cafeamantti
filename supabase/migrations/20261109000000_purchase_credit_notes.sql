-- ============================================================
-- Notas crédito de proveedores (anulación total de una factura de compra)
-- Date: 2026-11-09 · requires 20261029000000_supplier_advances.sql
--
-- The supplier voids a purchase invoice with a credit note. The accountant
-- registers it in Siigo; the app keeps it and undoes the invoice here:
--   · the invoice is anulada (it no longer owes anything);
--   · if the goods went back, its inventory entries come out;
--   · what was already paid stays with the supplier as saldo a favor: the
--     payments' Flujo de Caja rows become ANTICIPO rows (the money did leave,
--     but it is no longer a cost) and an anticipo movement holds the balance.
-- `converted`, `unstocked` and `payments` keep what was changed, so the
-- credit note can be undone. Crossing that balance in Siigo is done there
-- by hand (it sits on the supplier's account, not on an anticipo egreso).
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.purchase_credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         UUID NOT NULL UNIQUE REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  -- The supplier's credit note number.
  number          TEXT NOT NULL,
  issue_date      DATE NOT NULL,
  total           NUMERIC NOT NULL CHECK (total > 0),
  reason          TEXT,
  goods_returned  BOOLEAN NOT NULL DEFAULT false,
  -- What was already paid and became saldo a favor.
  paid            NUMERIC NOT NULL DEFAULT 0,
  previous_status TEXT NOT NULL,
  converted       JSONB NOT NULL DEFAULT '[]'::jsonb,
  unstocked       JSONB NOT NULL DEFAULT '[]'::jsonb,
  payments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The document in Siigo, once the accountant registers it.
  siigo_name      TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage purchase credit notes" ON public.purchase_credit_notes;
CREATE POLICY "Admins manage purchase credit notes" ON public.purchase_credit_notes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The saldo a favor a credit note left.
ALTER TABLE public.supplier_advances
  ADD COLUMN IF NOT EXISTS purchase_credit_note_id UUID REFERENCES public.purchase_credit_notes(id) ON DELETE CASCADE;
