-- 1. admin_audit_log: explicit restrictive deny for writes
DROP POLICY IF EXISTS "deny_writes_admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "deny_writes_admin_audit_log"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Re-add the existing leader SELECT permissive policy guard (idempotent: only create if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.admin_audit_log'::regclass
      AND polname = 'leaders view admin audit log'
  ) THEN
    CREATE POLICY "leaders view admin audit log"
      ON public.admin_audit_log
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'leader'));
  END IF;
END $$;

-- 2. transactions: drop the redundant/incorrectly scoped downline policy
DROP POLICY IF EXISTS "downline views transactions" ON public.transactions;

-- 3. storage upkeep_proofs delete: require a matching dispensation row owned by the leader
DROP POLICY IF EXISTS "upkeep_proofs_leader_delete" ON storage.objects;
CREATE POLICY "upkeep_proofs_leader_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'upkeep-proofs'
    AND EXISTS (
      SELECT 1 FROM public.upkeep_dispensations d
      WHERE d.leader_id = auth.uid()
        AND d.screenshot_path = storage.objects.name
    )
  );

-- 4. Revoke anon/public EXECUTE on trigger-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.tg_notify_fund_rule_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_fx_rate_change() FROM PUBLIC, anon, authenticated;