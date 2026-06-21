-- Make leader reports flexible enough for unknown names/nicknames while keeping routing private.

ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'sexual_assault';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'abuse_or_harassment';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'threats_or_intimidation';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'fraud_or_scam';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'discrimination';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'privacy_breach';
ALTER TYPE public.leader_offence ADD VALUE IF NOT EXISTS 'policy_violation';

ALTER TABLE public.leader_reports
  ALTER COLUMN reported_leader_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reported_name_text text,
  ADD COLUMN IF NOT EXISTS reported_nickname text,
  ADD COLUMN IF NOT EXISTS proof_path text,
  ADD COLUMN IF NOT EXISTS proof_file_name text;

DROP POLICY IF EXISTS "Reporter or recipient can read leader reports" ON public.leader_reports;
CREATE POLICY "Reporter or recipient can read leader reports"
ON public.leader_reports FOR SELECT TO authenticated
USING (
  (reported_leader_id IS NULL OR auth.uid() <> reported_leader_id)
  AND (
    auth.uid() = reporter_id
    OR auth.uid() = ANY (recipient_user_ids)
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leader-report-proofs',
  'leader-report-proofs',
  false,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp','application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','application/pdf']::text[];

DROP POLICY IF EXISTS "leader_report_proofs_reporter_upload" ON storage.objects;
CREATE POLICY "leader_report_proofs_reporter_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'leader-report-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "leader_report_proofs_private_read" ON storage.objects;
CREATE POLICY "leader_report_proofs_private_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leader-report-proofs'
  AND EXISTS (
    SELECT 1
    FROM public.leader_reports lr
    WHERE lr.proof_path = storage.objects.name
      AND (lr.reported_leader_id IS NULL OR auth.uid() <> lr.reported_leader_id)
      AND (
        lr.reporter_id = auth.uid()
        OR auth.uid() = ANY (lr.recipient_user_ids)
      )
  )
);

DROP POLICY IF EXISTS "leader_report_proofs_reporter_delete_pending" ON storage.objects;
CREATE POLICY "leader_report_proofs_reporter_delete_pending"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'leader-report-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND NOT EXISTS (
    SELECT 1 FROM public.leader_reports lr WHERE lr.proof_path = storage.objects.name
  )
);

DROP FUNCTION IF EXISTS public.submit_leader_report(uuid,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.submit_leader_report(
  _reported_leader_id uuid,
  _reported_status text,
  _reported_name text,
  _reported_nickname text,
  _offence text,
  _offence_custom text,
  _description text,
  _reporter_name text,
  _reporter_whatsapp text,
  _proof_path text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter uuid := auth.uid();
  v_anchor uuid;
  v_recipients uuid[] := '{}';
  v_report_id uuid;
  v_offence public.leader_offence;
  v_recent int;
  v_reported_name text;
  v_reported_status text;
  v_offence_label text;
  rcpt uuid;
BEGIN
  IF v_reporter IS NULL THEN RAISE EXCEPTION 'Must be signed in'; END IF;
  IF _reported_leader_id IS NOT NULL AND _reported_leader_id = v_reporter THEN
    RAISE EXCEPTION 'You cannot report yourself.';
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

  SELECT count(*) INTO v_recent FROM public.leader_reports
  WHERE reporter_id = v_reporter AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You have submitted several reports recently. Please wait a while before submitting another.';
  END IF;

  IF _reported_leader_id IS NOT NULL THEN
    SELECT full_name, rank
      INTO v_reported_name, v_reported_status
    FROM public.profiles
    WHERE id = _reported_leader_id
      AND terminated_at IS NULL;

    IF v_reported_name IS NULL THEN
      RAISE EXCEPTION 'The selected leader could not be found.';
    END IF;
    v_anchor := _reported_leader_id;
  ELSE
    v_reported_name := nullif(trim(coalesce(_reported_name, '')), '');
    v_reported_status := nullif(trim(coalesce(_reported_status, '')), '');
    IF v_reported_status IS NULL THEN
      RAISE EXCEPTION 'Please select the status of the person you are reporting.';
    END IF;
    IF v_reported_name IS NULL AND length(trim(coalesce(_reported_nickname, ''))) < 2 THEN
      RAISE EXCEPTION 'Please enter their full name, nickname, or enough detail to identify them.';
    END IF;
    v_anchor := v_reporter;
  END IF;

  v_reported_name := coalesce(nullif(trim(coalesce(_reported_name, '')), ''), v_reported_name);
  v_reported_status := coalesce(nullif(trim(coalesce(_reported_status, '')), ''), v_reported_status);

  -- Route to the two fund-handling leaders above the reported person.
  -- If the exact person is unknown, use the reporter's upline as the safest available route.
  WITH RECURSIVE chain AS (
    SELECT p.id, p.sponsor_id, p.leader_id, p.rank, p.can_handle_funds, 1 AS depth
    FROM public.profiles anchor
    JOIN public.profiles p ON p.id = coalesce(anchor.leader_id, anchor.sponsor_id)
    WHERE anchor.id = v_anchor
    UNION ALL
    SELECT p.id, p.sponsor_id, p.leader_id, p.rank, p.can_handle_funds, c.depth + 1
    FROM public.profiles p
    JOIN chain c ON p.id = c.sponsor_id
    WHERE c.depth < 50
  ),
  eligible AS (
    SELECT DISTINCT ON (id) id, depth
    FROM chain
    WHERE coalesce(can_handle_funds, false) = true
      AND id <> coalesce(_reported_leader_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id <> v_reporter
      AND EXISTS (
        SELECT 1 FROM public.profiles live
        WHERE live.id = chain.id AND live.terminated_at IS NULL
      )
    ORDER BY id, depth
  )
  SELECT coalesce(array_agg(id ORDER BY depth), '{}')
    INTO v_recipients
  FROM (
    SELECT id, depth FROM eligible ORDER BY depth LIMIT 2
  ) picked;

  IF array_length(v_recipients, 1) IS NULL THEN
    SELECT coalesce(array_agg(id), '{}')
      INTO v_recipients
    FROM (
      SELECT id
      FROM public.profiles
      WHERE coalesce(can_handle_funds, false) = true
        AND terminated_at IS NULL
        AND id <> v_reporter
        AND id <> coalesce(_reported_leader_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND rank ILIKE '%Director%'
      ORDER BY created_at
      LIMIT 2
    ) fallback;
  END IF;

  IF array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'No upline leader found to receive this report. Please contact support directly.';
  END IF;

  INSERT INTO public.leader_reports (
    reported_leader_id, reported_rank_at_time, reported_name_text, reported_nickname,
    reporter_id, reporter_name, reporter_whatsapp,
    offence, offence_custom, description, proof_path, proof_file_name, recipient_user_ids
  )
  VALUES (
    _reported_leader_id, v_reported_status, v_reported_name,
    nullif(trim(coalesce(_reported_nickname, '')), ''),
    v_reporter, trim(_reporter_name), trim(_reporter_whatsapp),
    v_offence, nullif(trim(coalesce(_offence_custom, '')), ''), trim(_description),
    nullif(trim(coalesce(_proof_path, '')), ''),
    CASE WHEN nullif(trim(coalesce(_proof_path, '')), '') IS NULL
      THEN NULL
      ELSE split_part(trim(_proof_path), '/', array_length(string_to_array(trim(_proof_path), '/'), 1))
    END,
    v_recipients
  )
  RETURNING id INTO v_report_id;

  v_offence_label := CASE v_offence::text
    WHEN 'funds_mismanagement' THEN 'Funds mismanagement'
    WHEN 'dating' THEN 'Dating or inappropriate relationship pressure'
    WHEN 'sexual_harassment' THEN 'Sexual harassment'
    WHEN 'sexual_assault' THEN 'Sexual assault'
    WHEN 'abuse_or_harassment' THEN 'Abuse or harassment'
    WHEN 'threats_or_intimidation' THEN 'Threats or intimidation'
    WHEN 'fraud_or_scam' THEN 'Fraud or scam'
    WHEN 'discrimination' THEN 'Discrimination'
    WHEN 'privacy_breach' THEN 'Privacy breach'
    WHEN 'policy_violation' THEN 'Policy violation'
    WHEN 'custom' THEN coalesce(nullif(trim(coalesce(_offence_custom, '')), ''), 'Other')
  END;

  FOREACH rcpt IN ARRAY v_recipients LOOP
    PERFORM public.notify_user(
      rcpt,
      'Confidential leader report',
      'A confidential report was filed about '
        || coalesce(v_reported_name, nullif(trim(coalesce(_reported_nickname, '')), ''), 'someone in the team')
        || ' (' || coalesce(v_reported_status, 'status unknown') || ').' || E'\n'
        || 'Offence: ' || v_offence_label || E'\n'
        || CASE WHEN nullif(trim(coalesce(_reported_nickname, '')), '') IS NULL
          THEN ''
          ELSE 'Nickname/details: ' || trim(_reported_nickname) || E'\n'
        END
        || 'Reporter: ' || trim(_reporter_name) || ' - WhatsApp: ' || trim(_reporter_whatsapp) || E'\n'
        || CASE WHEN nullif(trim(coalesce(_proof_path, '')), '') IS NULL
          THEN 'Proof uploaded: No' || E'\n'
          ELSE 'Proof uploaded: Yes' || E'\n'
        END
        || 'Please contact the reporter within 24 hours. The reported person was NOT notified.' || E'\n\n'
        || 'Details: ' || trim(_description),
      'leader_report'::public.notification_kind,
      '/dashboard'
    );
  END LOOP;

  RETURN v_report_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_leader_report(uuid,text,text,text,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_leader_report(uuid,text,text,text,text,text,text,text,text,text) TO authenticated;
