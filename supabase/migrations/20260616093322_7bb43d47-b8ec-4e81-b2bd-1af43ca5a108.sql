
CREATE TABLE public.pv_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_month date NOT NULL,  -- always first of month
  pv numeric(12,2) NOT NULL CHECK (pv >= 0 AND pv <= 1000000),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pv_logs TO authenticated;
GRANT ALL ON public.pv_logs TO service_role;

ALTER TABLE public.pv_logs ENABLE ROW LEVEL SECURITY;

-- Member can fully manage own entries
CREATE POLICY "pv_logs_own_all" ON public.pv_logs
  FOR ALL TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- Leaders (any ancestor fund handler) can read team PV
CREATE POLICY "pv_logs_upline_read" ON public.pv_logs
  FOR SELECT TO authenticated
  USING (
    public.is_descendant_of(member_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = pv_logs.member_id AND p.leader_id = auth.uid()
    )
  );

-- Normalise to first-of-month on insert/update
CREATE OR REPLACE FUNCTION public.tg_pv_logs_normalise()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.period_month := date_trunc('month', NEW.period_month)::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pv_logs_normalise
  BEFORE INSERT OR UPDATE ON public.pv_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_pv_logs_normalise();

CREATE TRIGGER pv_logs_touch
  BEFORE UPDATE ON public.pv_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
