-- ============================================================
-- Storage bucket for document images (proposal-assets)
-- Date: 2026-10-13
--
-- Proposals, maquila proposals (background + client logo) and
-- tech sheets upload images to the private "proposal-assets"
-- bucket (folders proposals/ and tech-sheets/), and read them back
-- through short-lived signed URLs. The bucket was never created by
-- a migration, so uploads failed with "Bucket not found".
--
-- Private, images only, up to 5 MB, and only admins can read or
-- write. Safe to run more than once.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-assets',
  'proposal-assets',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can view proposal assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert proposal assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update proposal assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete proposal assets" ON storage.objects;

CREATE POLICY "Admins can view proposal assets" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proposal-assets' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert proposal assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proposal-assets' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update proposal assets" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'proposal-assets' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete proposal assets" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'proposal-assets' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
  );
