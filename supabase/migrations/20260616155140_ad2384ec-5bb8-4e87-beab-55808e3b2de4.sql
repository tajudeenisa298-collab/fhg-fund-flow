
DROP POLICY IF EXISTS "downline views profiles" ON public.profiles;
CREATE POLICY "members view upline profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_descendant_of(auth.uid(), id));
