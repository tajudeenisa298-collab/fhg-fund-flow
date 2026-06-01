
-- Realtime: ensure all live-updating tables emit full row payloads and join the realtime publication
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawal_requests REPLICA IDENTITY FULL;
ALTER TABLE public.invite_codes REPLICA IDENTITY FULL;
ALTER TABLE public.upkeep_plans REPLICA IDENTITY FULL;
ALTER TABLE public.office_ledger REPLICA IDENTITY FULL;
ALTER TABLE public.leader_purse_ledger REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notifications','profiles','transactions','withdrawal_requests',
    'invite_codes','upkeep_plans','office_ledger','leader_purse_ledger'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Rank-based upkeep defaults per leader; per-member plans prefill from these
CREATE TABLE public.rank_upkeep_defaults (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  leader_id uuid NOT NULL,
  rank text NOT NULL,
  amount_usd numeric NOT NULL CHECK (amount_usd > 0),
  frequency public.upkeep_frequency NOT NULL DEFAULT 'weekly',
  custom_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leader_id, rank)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rank_upkeep_defaults TO authenticated;
GRANT ALL ON public.rank_upkeep_defaults TO service_role;

ALTER TABLE public.rank_upkeep_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaders manage own rank defaults"
  ON public.rank_upkeep_defaults
  FOR ALL TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(), 'leader'));

CREATE POLICY "members view their leader rank defaults"
  ON public.rank_upkeep_defaults
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.leader_id = rank_upkeep_defaults.leader_id)
    OR public.is_descendant_of(auth.uid(), leader_id)
  );

CREATE TRIGGER rank_upkeep_defaults_touch
  BEFORE UPDATE ON public.rank_upkeep_defaults
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER rank_upkeep_defaults_validate_rank
  BEFORE INSERT OR UPDATE ON public.rank_upkeep_defaults
  FOR EACH ROW EXECUTE FUNCTION public.validate_fund_rule_target_rank();

ALTER TABLE public.rank_upkeep_defaults REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rank_upkeep_defaults';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
