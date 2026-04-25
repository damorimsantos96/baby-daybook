-- ============================================================
-- BABY DAYBOOK — Storage RLS for child-photos bucket
-- Allows authenticated users to INSERT/UPDATE/SELECT/DELETE
-- objects whose first path segment matches their user ID.
-- Execute no SQL Editor do Supabase (supabase.com → SQL Editor)
-- ============================================================

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
