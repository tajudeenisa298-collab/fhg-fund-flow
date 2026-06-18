
-- 1. Extend notification kinds
DO $$ BEGIN
  ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'leader_report';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Offence enum
DO $$ BEGIN
  CREATE TYPE public.leader_offence AS ENUM (
    'funds_mismanagement','dating','sexual_harassment','custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table
CREATE TABLE IF NOT EXISTS public.leader_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_rank_at_time text,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_name text NOT NULL,
  reporter_whatsapp text NOT NULL,
  offence public.leader_offence NOT NULL,
  offence_custom text,
  description text NOT NULL,
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(description) BETWEEN 10 AND 4000),
  CHECK (length(reporter_whatsapp) BETWEEN 5 AND 32)
);

GRANT SELECT, INSERT ON public.leader_reports TO authenticated;
GRANT ALL ON public.leader_reports TO service_role;

ALTER TABLE public.leader_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can see their own submissions; recipient leaders can see reports addressed to them.
-- The reported leader is explicitly excluded.
DROP POLICY IF EXISTS "Reporter or recipient can read leader reports" ON public.leader_reports;
CREATE POLICY "Reporter or recipient can read leader reports"
ON public.leader_reports FOR SELECT TO authenticated
USING (
  auth.uid() <> reported_leader_id
  AND (
    auth.uid() = reporter_id
    OR auth.uid() = ANY (recipient_user_ids)
  )
);

-- Direct INSERT is disallowed; routing happens in the RPC only.
DROP POLICY IF EXISTS "No direct insert on leader_reports" ON public.leader_reports;
CREATE POLICY "No direct insert on leader_reports"
ON public.leader_reports FOR INSERT TO authenticated
WITH CHECK (false);

CREATE TRIGGER tg_leader_reports_touch
BEFORE UPDATE ON public.leader_reports
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Submission RPC
CREATE OR REPLACE FUNCTION public.submit_leader_report(
  _reported_leader_id uuid,
  _reported_rank text,
  _offence text,
  _offence_custom text,
  _description text,
  _reporter_name text,
  _reporter_whatsapp text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter uuid := auth.uid();
  v_recipients uuid[] := '{}';
  v_report_id uuid;
  v_director_idx int := 5;  -- index of 'Director' in the rank list
  v_offence public.leader_offence;
  v_recent int;
  r record;
  v_offence_label text;
BEGIN
  IF v_reporter IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _reported_leader_id IS NULL OR _reported_leader_id = v_reporter THEN
    RAISE EXCEPTION 'Invalid reported leader';
  END IF;
  IF _description IS NULL OR length(trim(_description)) < 10 THEN
    RAISE EXCEPTION 'Please describe what happened (at least 10 characters).';
  END IF;
  IF _reporter_name IS NULL OR length(trim(_reporter_name)) < 2 THEN
    RAISE EXCEPTION 'Your name is required so the leader handling this can reach you.';
  END IF;
  IF _reporter_whatsapp IS NULL OR length(trim(_reporter_whatsapp)) < 5 THEN
    RAISE EXCEPTION 'A WhatsApp number is required so the leader can contact you privately.';
  END IF;

  BEGIN
    v_offence := _offence::public.leader_offence;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Unknown offence category: %', _offence;
  END;

  IF v_offence = 'custom' AND (_offence_custom IS NULL OR length(trim(_offence_custom)) < 3) THEN
    RAISE EXCEPTION 'Please name the custom offence.';
  END IF;

  -- Anti-spam: max 5 reports per reporter per hour
  SELECT count(*) INTO v_recent FROM public.leader_reports
  WHERE reporter_id = v_reporter AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You have submitted several reports recently. Please wait a while before submitting another.';
  END IF;

  -- Compute recipients: top 3 ancestors with rank >= Director, plus fund handler fallback.
  WITH RECURSIVE chain AS (
    SELECT id, sponsor_id, rank, 1 AS depth
    FROM public.profiles WHERE id = _reported_leader_id
    UNION ALL
    SELECT p.id, p.sponsor_id, p.rank, c.depth + 1
    FROM public.profiles p
    JOIN chain c ON p.id = c.sponsor_id
    WHERE c.depth < 50
  ),
  ranked_ancestors AS (
    SELECT a.id,
           CASE a.rank
             WHEN 'Member' THEN 0 WHEN 'Distributor' THEN 1 WHEN 'Manager' THEN 2
             WHEN 'Senior Manager' THEN 3 WHEN 'Executive Manager' THEN 4
             WHEN 'Director' THEN 5 WHEN 'Emerald Director' THEN 6 WHEN 'Sapphire Director' THEN 7
             WHEN '1 Ruby Director' THEN 8 WHEN '2 Ruby Director' THEN 9
             WHEN '3 Ruby Director' THEN 10 WHEN '4 Ruby Director' THEN 11
             WHEN '5 Ruby Director' THEN 12 WHEN '1 Diamond Director' THEN 13
             WHEN '2 Diamond Director' THEN 14 WHEN '3 Diamond Director' THEN 15
             WHEN '4 Diamond Director' THEN 16 WHEN '5 Diamond Director' THEN 17
             ELSE -1 END AS rank_idx
    FROM public.profiles a
    JOIN chain c ON c.id = a.id
    WHERE a.id <> _reported_leader_id
      AND coalesce(a.terminated_at, 'epoch'::timestamptz) = 'epoch'::timestamptz OR a.terminated_at IS NULL
  )
  SELECT array_agg(DISTINCT id) INTO v_recipients FROM (
    SELECT id FROM ranked_ancestors
    WHERE rank_idx >= v_director_idx
    ORDER BY rank_idx DESC
    LIMIT 3
  ) t;

  v_recipients := coalesce(v_recipients, '{}');

  -- Add the fund handler as a safety net (deduped).
  FOR r IN SELECT leader_id FROM public.profiles WHERE id = _reported_leader_id LOOP
    IF r.leader_id IS NOT NULL
       AND r.leader_id <> _reported_leader_id
       AND NOT (r.leader_id = ANY (v_recipients)) THEN
      v_recipients := v_recipients || r.leader_id;
    END IF;
  END LOOP;

  IF array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'No upline leader found to receive this report. Please contact support directly.';
  END IF;

  -- Insert (bypasses the deny-all INSERT policy via SECURITY DEFINER)
  INSERT INTO public.leader_reports (
    reported_leader_id, reported_rank_at_time, reporter_id,
    reporter_name, reporter_whatsapp,
    offence, offence_custom, description, recipient_user_ids
  )
  VALUES (
    _reported_leader_id, _reported_rank, v_reporter,
    trim(_reporter_name), trim(_reporter_whatsapp),
    v_offence, nullif(trim(coalesce(_offence_custom,'')),''), trim(_description), v_recipients
  )
  RETURNING id INTO v_report_id;

  -- Notify each recipient privately.
  v_offence_label := CASE v_offence
    WHEN 'funds_mismanagement' THEN 'Funds mismanagement'
    WHEN 'dating' THEN 'Dating'
    WHEN 'sexual_harassment' THEN 'Sexual harassment'
    WHEN 'custom' THEN coalesce(nullif(trim(coalesce(_offence_custom,'')),''),'Other')
  END;

  FOREACH r IN ARRAY (SELECT array_agg(x) FROM unnest(v_recipients) x) LOOP
    NULL;
  END LOOP;

  -- (loop above is a no-op placeholder; real loop below)
  DECLARE rcpt uuid;
          v_reported_name text;
  BEGIN
    SELECT full_name INTO v_reported_name FROM public.profiles WHERE id = _reported_leader_id;
    FOREACH rcpt IN ARRAY v_recipients LOOP
      PERFORM public.notify_user(
        rcpt,
        'Confidential leader report',
        'A report was filed against ' || coalesce(v_reported_name,'a leader')
          || ' (' || coalesce(_reported_rank,'unknown rank') || ').' || E'\n'
          || 'Offence: ' || v_offence_label || E'\n'
          || 'Reporter: ' || trim(_reporter_name) || ' — WhatsApp: ' || trim(_reporter_whatsapp) || E'\n'
          || 'Please reach out off-platform within 24 hours. The reported person will NOT be notified.' || E'\n\n'
          || 'Details: ' || trim(_description),
        'leader_report'::public.notification_kind,
        '/dashboard'
      );
    END LOOP;
  END;

  RETURN v_report_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_leader_report(uuid,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_leader_report(uuid,text,text,text,text,text,text) TO authenticated;

-- 5. Fix admin_audit_log RLS direction (was reversed: leaked upline entries)
DROP POLICY IF EXISTS "Leaders read own audit log" ON public.admin_audit_log;
CREATE POLICY "Leaders read own audit log"
ON public.admin_audit_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'leader')
  AND (
    actor_id = auth.uid()
    OR (target_user_id IS NOT NULL AND public.is_descendant_of(target_user_id, auth.uid()))
  )
);
