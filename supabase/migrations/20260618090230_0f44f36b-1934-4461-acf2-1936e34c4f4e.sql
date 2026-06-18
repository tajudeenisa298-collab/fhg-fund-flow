
-- 1. admin_audit_log: drop overly broad policy
DROP POLICY IF EXISTS "leaders view admin audit log" ON public.admin_audit_log;

-- 2. leader_purse_ledger: block direct inserts (force RPC)
CREATE POLICY "block_direct_insert_leader_purse_ledger"
  ON public.leader_purse_ledger AS RESTRICTIVE FOR INSERT
  TO authenticated WITH CHECK (false);

-- 3. transactions: block direct inserts (force create_managed_transaction)
CREATE POLICY "block_direct_insert_transactions"
  ON public.transactions AS RESTRICTIVE FOR INSERT
  TO authenticated WITH CHECK (false);

-- 4. withdrawal_requests: block direct updates (force resolve_withdrawal_request)
CREATE POLICY "block_direct_update_withdrawal_requests"
  ON public.withdrawal_requests AS RESTRICTIVE FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

-- 5. upkeep-proofs storage: require dispensation linkage on leader upload
DROP POLICY IF EXISTS upkeep_proofs_leader_upload ON storage.objects;
CREATE POLICY upkeep_proofs_leader_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'upkeep-proofs'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.upkeep_dispensations d
      WHERE d.leader_id = auth.uid()
        AND d.screenshot_path = storage.objects.name
    )
  );

-- 6. Revoke anon EXECUTE on SECURITY DEFINER functions exposed to anon
REVOKE EXECUTE ON FUNCTION public.leader_adjust_balance(uuid, numeric, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.leader_override_rank(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_pv_with_deduction(uuid, date, numeric, numeric, numeric, numeric, text) FROM anon, PUBLIC;
