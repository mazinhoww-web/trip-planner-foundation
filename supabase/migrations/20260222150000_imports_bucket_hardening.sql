-- Ensure storage bucket exists and policies are idempotent in every environment (Lovable, preview, prod)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  20971520,
  ARRAY['text/plain', 'text/html', 'message/rfc822', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users upload own import files'
  ) THEN
    CREATE POLICY "Users upload own import files"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'imports'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users read own import files'
  ) THEN
    CREATE POLICY "Users read own import files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'imports'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users update own import files'
  ) THEN
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
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users delete own import files'
  ) THEN
    CREATE POLICY "Users delete own import files"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'imports'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
