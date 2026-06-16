
DROP POLICY IF EXISTS "fund handlers view managed bank" ON public.bank_accounts;
CREATE POLICY "fund handlers view managed bank" ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = bank_accounts.user_id AND p.leader_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.can_handle_funds = true
    )
  );
