-- RLS policies for FIT files storage bucket
-- These policies control access to FIT files in Supabase Storage

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload their own FIT files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own FIT files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage all FIT files" ON storage.objects;

-- Policy for users to upload FIT files to their own folder
CREATE POLICY "Users can upload their own FIT files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'fit-files' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = auth.uid()
);

-- Policy for users to read their own FIT files
CREATE POLICY "Users can read their own FIT files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'fit-files' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = auth.uid()
);

-- Policy for service role to manage all FIT files (for edge functions)
CREATE POLICY "Service role can manage all FIT files" ON storage.objects
FOR ALL USING (
  bucket_id = 'fit-files' AND
  auth.role() = 'service_role'
);