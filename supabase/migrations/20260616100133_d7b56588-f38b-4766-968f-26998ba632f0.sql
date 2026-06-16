-- Allow leaders to manage PV log entries for their direct managed members.
CREATE POLICY "pv_logs_leader_manage" ON public.pv_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = pv_logs.member_id AND p.leader_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = pv_logs.member_id AND p.leader_id = auth.uid()
    )
  );