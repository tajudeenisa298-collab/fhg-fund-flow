
-- 1) office_ledger: scope to authenticated
DROP POLICY IF EXISTS "leaders read own office ledger" ON public.office_ledger;
CREATE POLICY "leaders read own office ledger"
  ON public.office_ledger
  FOR SELECT
  TO authenticated
  USING (leader_id = auth.uid());

-- 2) pv_logs: members may SELECT/UPDATE own, but not INSERT/DELETE
DROP POLICY IF EXISTS pv_logs_own_all ON public.pv_logs;
CREATE POLICY pv_logs_own_select
  ON public.pv_logs
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());
CREATE POLICY pv_logs_own_update
  ON public.pv_logs
  FOR UPDATE
  TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- 3) upkeep_dispensations: explicitly block client INSERT/UPDATE/DELETE.
--    All writes must go through SECURITY DEFINER RPCs (dispense_upkeep, acknowledge_upkeep, dispute_upkeep).
CREATE POLICY upkeep_dispensations_no_client_insert
  ON public.upkeep_dispensations
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
CREATE POLICY upkeep_dispensations_no_client_update
  ON public.upkeep_dispensations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);
CREATE POLICY upkeep_dispensations_no_client_delete
  ON public.upkeep_dispensations
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);
