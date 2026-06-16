
CREATE POLICY "upkeep_proofs_member_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'upkeep-proofs'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

REVOKE EXECUTE ON FUNCTION public.validate_invite_code(text) FROM anon, PUBLIC;
