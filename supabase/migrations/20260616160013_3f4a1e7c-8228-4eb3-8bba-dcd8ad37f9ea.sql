
-- 1) Require a linked dispensation for member uploads to upkeep-proofs
DROP POLICY IF EXISTS upkeep_proofs_member_upload ON storage.objects;
CREATE POLICY upkeep_proofs_member_upload
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'upkeep-proofs'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.upkeep_dispensations d
    WHERE d.member_id = auth.uid()
      AND d.screenshot_path = storage.objects.name
  )
);

-- 2) Explicit restrictive policy: members cannot UPDATE withdrawal_requests at all.
-- Prevents future permissive UPDATE policies from accidentally letting a member
-- change leader_id or amount_usd on an existing pending request.
CREATE POLICY "members cannot update own requests"
ON public.withdrawal_requests
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (member_id <> auth.uid())
WITH CHECK (member_id <> auth.uid());
