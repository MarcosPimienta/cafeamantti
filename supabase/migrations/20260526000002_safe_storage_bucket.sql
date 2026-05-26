-- Script seguro para crear el bucket de recibos

-- 1. Crear el bucket si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Eliminar políticas anteriores (por si fallaron a medias)
DROP POLICY IF EXISTS "Admins can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete receipts" ON storage.objects;

-- 3. Crear las políticas
CREATE POLICY "Admins can view receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert receipts" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update receipts" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete receipts" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'receipts' AND 
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND role = 'admin')
    );
