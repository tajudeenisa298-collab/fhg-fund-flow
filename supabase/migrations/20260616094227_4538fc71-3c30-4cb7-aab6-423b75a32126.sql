
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Storage policies for avatars bucket (private bucket, served via signed URLs)
CREATE POLICY "Avatars are viewable by authenticated users"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow self-update of avatar_url (guard trigger preserves other immutable fields)
-- guard_profile_self_update allows columns not in its OLD-pinning list, so avatar_url is editable
