
-- 1. Announcement validity window + emergency flag
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON public.announcements (leader_id, expires_at, is_emergency);

-- 2. Let non-leader members read their own downline profiles
-- (RLS currently only allows leaders to see leader_id = auth.uid(); this
--  enables sponsors who are not yet leaders to see the people under them.)
DROP POLICY IF EXISTS "members view their downline profiles" ON public.profiles;
CREATE POLICY "members view their downline profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_descendant_of(id, auth.uid()));

-- 3. Fix the wording on the deposit produced when a member acknowledges
--    upkeep: from the member's POV the money came FROM their team leader,
--    so attribute the note that way.
CREATE OR REPLACE FUNCTION public.acknowledge_upkeep(_dispensation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_disp record; v_txn_id uuid; v_member_name text; v_recent int;
BEGIN
  SELECT count(*) INTO v_recent FROM public.upkeep_dispensations
  WHERE member_id = auth.uid()
    AND acknowledged_at IS NOT NULL
    AND acknowledged_at > now() - interval '1 minute';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'Too many actions. Please wait a minute and try again.';
  END IF;

  SELECT * INTO v_disp FROM public.upkeep_dispensations WHERE id = _dispensation_id FOR UPDATE;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_disp.member_id <> auth.uid() THEN RAISE EXCEPTION 'Not your upkeep'; END IF;
  IF v_disp.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
  VALUES (v_disp.member_id, v_disp.leader_id, 'deposit', v_disp.amount_usd,
          coalesce(v_disp.note, 'Upkeep') || ' · sent by team leader')
  RETURNING id INTO v_txn_id;

  UPDATE public.upkeep_dispensations
  SET status = 'acknowledged', acknowledged_at = now(), txn_id = v_txn_id
  WHERE id = _dispensation_id;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(
    v_disp.leader_id, 'Upkeep approved',
    coalesce(v_member_name, 'Member') || ' confirmed $' || v_disp.amount_usd || ' upkeep',
    'upkeep',
    '/dashboard'
  );
  RETURN v_txn_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_upkeep(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_upkeep(uuid) TO authenticated;

-- 4. Dispute resolution credit note (was "approved by member") — keep wording neutral
CREATE OR REPLACE FUNCTION public.resolve_dispute(_dispensation_id uuid, _credit boolean, _note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_disp record; v_txn_id uuid;
BEGIN
  IF _note IS NULL OR length(trim(_note)) < 3 THEN
    RAISE EXCEPTION 'Add a brief resolution note';
  END IF;

  SELECT * INTO v_disp FROM public.upkeep_dispensations WHERE id = _dispensation_id FOR UPDATE;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_disp.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your dispensation'; END IF;
  IF v_disp.status <> 'disputed' THEN RAISE EXCEPTION 'Only disputed items can be resolved'; END IF;

  IF _credit THEN
    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
    VALUES (v_disp.member_id, v_disp.leader_id, 'deposit', v_disp.amount_usd,
            'Upkeep dispute resolved (credited): ' || trim(_note))
    RETURNING id INTO v_txn_id;

    UPDATE public.upkeep_dispensations
    SET status = 'acknowledged', resolved_at = now(), resolution_note = trim(_note),
        resolution_credit = true, txn_id = v_txn_id
    WHERE id = _dispensation_id;
  ELSE
    UPDATE public.upkeep_dispensations
    SET resolved_at = now(), resolution_note = trim(_note), resolution_credit = false
    WHERE id = _dispensation_id;
  END IF;

  PERFORM public.notify_user(
    v_disp.member_id,
    CASE WHEN _credit THEN 'Upkeep dispute resolved — credited' ELSE 'Upkeep dispute closed' END,
    trim(_note), 'upkeep', '/dashboard'
  );
END;
$function$;
