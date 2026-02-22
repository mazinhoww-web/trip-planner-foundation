-- Bucket for reservation import originals
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  20971520,
  ARRAY['text/plain', 'text/html', 'message/rfc822', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies: users can only manage files inside folder named with own auth uid
CREATE POLICY "Users upload own import files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read own import files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own import files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own import files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'imports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
