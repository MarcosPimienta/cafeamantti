-- ============================================================
-- RUT of each supplier (Proveedores)
-- Date: 2026-10-20
--
-- To deduct a purchase from a natural person (persona natural) the
-- DIAN asks for the supplier's RUT, so each supplier keeps a copy
-- (PDF or photo) in the private "supplier-documents" bucket, under
-- rut/<supplier id>/. Admins read it through short-lived signed URLs.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rut_path        TEXT,
  ADD COLUMN IF NOT EXISTS rut_file_name   TEXT,
  ADD COLUMN IF NOT EXISTS rut_uploaded_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-documents',
  'supplier-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can view supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete supplier documents" ON storage.objects;

CREATE POLICY "Admins can view supplier documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'supplier-documents' AND public.is_admin());

CREATE POLICY "Admins can insert supplier documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'supplier-documents' AND public.is_admin());

CREATE POLICY "Admins can update supplier documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'supplier-documents' AND public.is_admin());

CREATE POLICY "Admins can delete supplier documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'supplier-documents' AND public.is_admin());
