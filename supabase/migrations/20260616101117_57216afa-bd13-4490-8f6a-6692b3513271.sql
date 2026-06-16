
-- ============================================================
-- 1) PER-MEMBER FEE OVERRIDES
-- ============================================================
ALTER TABLE public.fund_rules
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS fund_rules_member_id_idx ON public.fund_rules(member_id);

-- Replace per-USD trigger so member-specific rules override team-wide rule of same name
CREATE OR REPLACE FUNCTION public.tg_apply_per_usd_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_rate numeric;
  v_ded_usd numeric;
  v_ded_ngn numeric;
  v_txn_id uuid;
  v_member_rank text;
BEGIN
  IF new.type::text <> 'deposit' OR new.leader_id IS NULL THEN RETURN new; END IF;
  SELECT usd_to_ngn INTO v_rate FROM public.app_settings WHERE id = 1;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1600; END IF;
  SELECT rank INTO v_member_rank FROM public.profiles WHERE id = new.member_id;

  FOR r IN
    SELECT DISTINCT ON (lower(name)) *
    FROM public.fund_rules
    WHERE leader_id = new.leader_id
      AND active = true
      AND kind = 'per_usd'
      AND (member_id IS NULL OR member_id = new.member_id)
      AND (target_rank IS NULL OR target_rank = v_member_rank)
    ORDER BY lower(name), (member_id IS NOT NULL) DESC, created_at DESC
  LOOP
    v_ded_ngn := r.amount_ngn * new.amount_usd;
    v_ded_usd := round(v_ded_ngn / v_rate, 2);
    IF v_ded_usd > 0 THEN
      INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, parent_txn_id)
      VALUES (new.member_id, new.leader_id, 'fund_deduction', v_ded_usd, 'NGN', v_rate, round(v_ded_ngn, 2), r.name, new.id)
      RETURNING id INTO v_txn_id;

      IF r.destination = 'team_leader' THEN
        INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
        VALUES (new.leader_id, 'credit', v_ded_usd, r.name || ' from deposit');
      ELSE
        INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note, source_txn_id)
        VALUES (new.leader_id, 'support_in', round(v_ded_ngn, 2), r.name,
                CASE WHEN r.destination = 'custom' THEN 'Custom fund from deposit' ELSE 'Office support from deposit' END,
                v_txn_id);
      END IF;
    END IF;
  END LOOP;
  RETURN new;
END;
$function$;

-- Replace fixed-schedule runner: member-specific rules apply only to that member;
-- team-wide rules skip any member who has an override of the same name.
CREATE OR REPLACE FUNCTION public.run_due_fund_rules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  m record;
  cnt int := 0;
  v_rate numeric;
  v_ded_usd numeric;
  v_next timestamptz;
  v_txn_id uuid;
BEGIN
  SELECT usd_to_ngn INTO v_rate FROM public.app_settings WHERE id = 1;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1600; END IF;

  FOR r IN SELECT * FROM public.fund_rules
           WHERE active = true
             AND kind = 'fixed'
             AND frequency IS NOT NULL
             AND next_run_at IS NOT NULL
             AND next_run_at <= now()
           FOR UPDATE SKIP LOCKED
  LOOP
    v_ded_usd := round(r.amount_ngn / v_rate, 2);

    FOR m IN
      SELECT id FROM public.profiles
       WHERE leader_id = r.leader_id
         AND can_handle_funds = false
         AND (r.target_rank IS NULL OR rank = r.target_rank)
         AND (
           r.member_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.fund_rules o
             WHERE o.leader_id = r.leader_id AND o.active AND o.kind = 'fixed'
               AND o.member_id = public.profiles.id
               AND lower(o.name) = lower(r.name)
           )
           OR r.member_id = public.profiles.id
         )
    LOOP
      IF r.destination = 'member_upkeep' THEN
        INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
        VALUES (m.id, r.leader_id, 'deposit', v_ded_usd, 'NGN', v_rate, r.amount_ngn,
                coalesce(r.name, 'Rank upkeep'));
      ELSE
        INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
        VALUES (m.id, r.leader_id, 'fund_deduction', v_ded_usd, 'NGN', v_rate, r.amount_ngn, r.name)
        RETURNING id INTO v_txn_id;

        IF r.destination = 'team_leader' THEN
          INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
          VALUES (r.leader_id, 'credit', v_ded_usd, r.name || ' scheduled fund rule');
        ELSE
          INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note, source_txn_id)
          VALUES (r.leader_id, 'support_in', r.amount_ngn, r.name,
                  CASE WHEN r.destination = 'custom' THEN 'Custom scheduled fund rule' ELSE 'Office support scheduled fund rule' END,
                  v_txn_id);
        END IF;
      END IF;
      cnt := cnt + 1;
    END LOOP;

    v_next := CASE r.frequency
      WHEN 'weekly' THEN r.next_run_at + interval '7 days'
      WHEN 'biweekly' THEN r.next_run_at + interval '14 days'
      WHEN 'monthly' THEN r.next_run_at + interval '1 month'
      WHEN 'custom_days' THEN r.next_run_at + (coalesce(r.custom_days, 7) || ' days')::interval
      WHEN 'one_time' THEN null
    END;

    UPDATE public.fund_rules
    SET next_run_at = v_next,
        active = CASE WHEN r.frequency = 'one_time' THEN false ELSE active END
    WHERE id = r.id;
  END LOOP;
  RETURN cnt;
END;
$function$;

-- ============================================================
-- 2) BROADCAST ANNOUNCEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_leader_id_idx ON public.announcements(leader_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leader manages own announcements"
ON public.announcements FOR ALL TO authenticated
USING (leader_id = auth.uid())
WITH CHECK (leader_id = auth.uid());

CREATE POLICY "Team members can read their leader's announcements"
ON public.announcements FOR SELECT TO authenticated
USING (leader_id = (SELECT leader_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER touch_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_notify_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE m record;
BEGIN
  FOR m IN SELECT id FROM public.profiles WHERE leader_id = NEW.leader_id LOOP
    PERFORM public.notify_user(m.id, 'Announcement: ' || NEW.title, NEW.body, 'generic', '/dashboard');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_announcements_notify
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_announcement();

-- ============================================================
-- 3) RESOURCE LIBRARY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('link','file','note')),
  category text,
  url text,
  storage_path text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resources_leader_id_idx ON public.resources(leader_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leader manages own resources"
ON public.resources FOR ALL TO authenticated
USING (leader_id = auth.uid())
WITH CHECK (leader_id = auth.uid());

CREATE POLICY "Team members can read their leader's resources"
ON public.resources FOR SELECT TO authenticated
USING (leader_id = (SELECT leader_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER touch_resources_updated_at
BEFORE UPDATE ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage RLS for team-resources bucket
-- Path layout: {leader_id}/{filename}
CREATE POLICY "Leaders can read own team-resources files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'team-resources'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (SELECT leader_id::text FROM public.profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Leaders can upload to own team-resources folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'team-resources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Leaders can update own team-resources files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'team-resources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Leaders can delete own team-resources files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'team-resources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
