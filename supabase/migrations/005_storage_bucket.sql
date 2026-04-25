-- ============================================================
-- BABY DAYBOOK - Storage bucket + RLS for child photos
-- Ensures child-photos bucket exists and authenticated users
-- can only read/write objects inside their own {user_id}/ path.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'child-photos',
  'child-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "own_photos" ON storage.objects;

CREATE POLICY "own_photos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'child-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'child-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
