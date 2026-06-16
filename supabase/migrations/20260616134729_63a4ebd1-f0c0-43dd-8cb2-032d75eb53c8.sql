-- fund_rules
DROP POLICY IF EXISTS "leaders manage own rules" ON public.fund_rules;
CREATE POLICY "leaders select own rules" ON public.fund_rules FOR SELECT TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders insert own rules" ON public.fund_rules FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders update own rules" ON public.fund_rules FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'))
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders delete own rules" ON public.fund_rules FOR DELETE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));

-- rank_upkeep_defaults
DROP POLICY IF EXISTS "leaders manage own rank defaults" ON public.rank_upkeep_defaults;
CREATE POLICY "leaders select own rank defaults" ON public.rank_upkeep_defaults FOR SELECT TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders insert own rank defaults" ON public.rank_upkeep_defaults FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders update own rank defaults" ON public.rank_upkeep_defaults FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'))
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders delete own rank defaults" ON public.rank_upkeep_defaults FOR DELETE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));

-- upkeep_plans
DROP POLICY IF EXISTS "leaders manage own plans" ON public.upkeep_plans;
CREATE POLICY "leaders select own plans" ON public.upkeep_plans FOR SELECT TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders insert own plans" ON public.upkeep_plans FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders update own plans" ON public.upkeep_plans FOR UPDATE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'))
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));
CREATE POLICY "leaders delete own plans" ON public.upkeep_plans FOR DELETE TO authenticated
  USING (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));