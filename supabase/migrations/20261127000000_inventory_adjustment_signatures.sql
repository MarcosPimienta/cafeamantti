-- ============================================================
-- Firmas digitales de los comprobantes de ajuste
-- Date: 2026-11-27
--
-- A voucher has three signatures: elaboró, revisó, aprobó. Each is made by
-- an admin from the voucher page (drawn or typed, as in cuentas de cobro)
-- and records who signed and when. A signature is never changed or removed:
-- admins can read and add them, nobody can update or delete them. An
-- annulled voucher takes no more signatures.
--
-- Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_adjustment_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id  UUID NOT NULL REFERENCES public.inventory_adjustments(id) ON DELETE RESTRICT,
  role           TEXT NOT NULL CHECK (role IN ('elaboro', 'reviso', 'aprobo')),
  signer_id      UUID NOT NULL REFERENCES auth.users(id),
  signer_name    TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('scribble', 'typed')),
  signature_data TEXT NOT NULL CHECK (length(signature_data) BETWEEN 2 AND 300000),
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (adjustment_id, role)
);

CREATE INDEX IF NOT EXISTS inventory_adjustment_signatures_adj_idx ON public.inventory_adjustment_signatures (adjustment_id);

ALTER TABLE public.inventory_adjustment_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read adjustment signatures" ON public.inventory_adjustment_signatures;
CREATE POLICY "Admins read adjustment signatures" ON public.inventory_adjustment_signatures
  FOR SELECT USING (public.is_admin());

-- Only an admin, only as themself, only on a voucher still in force.
DROP POLICY IF EXISTS "Admins sign adjustments" ON public.inventory_adjustment_signatures;
CREATE POLICY "Admins sign adjustments" ON public.inventory_adjustment_signatures
  FOR INSERT WITH CHECK (
    public.is_admin()
    AND signer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = adjustment_id AND a.status = 'vigente')
  );
-- No UPDATE or DELETE policy: a signature stays as it was made.
