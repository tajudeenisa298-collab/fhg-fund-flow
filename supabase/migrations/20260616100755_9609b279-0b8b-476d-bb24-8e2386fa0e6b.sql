CREATE OR REPLACE FUNCTION public.dispense_upkeep(
  _member_id uuid,
  _amount_usd numeric,
  _screenshot_path text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_member record;
  v_leader_name text;
  v_dup_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, leader_id, full_name, can_handle_funds INTO v_member
  FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;

  -- Duplicate guard: same leader → same member, same amount, still pending,
  -- created within the last 2 minutes.
  SELECT EXISTS (
    SELECT 1 FROM public.upkeep_dispensations
    WHERE leader_id = auth.uid()
      AND member_id = _member_id
      AND amount_usd = _amount_usd
      AND status = 'pending'
      AND created_at > now() - interval '2 minutes'
  ) INTO v_dup_exists;

  IF v_dup_exists THEN
    RAISE EXCEPTION 'Looks like a duplicate — an identical pending upkeep was just sent. Wait a moment or cancel the previous one.';
  END IF;

  INSERT INTO public.upkeep_dispensations (leader_id, member_id, amount_usd, screenshot_path, note)
  VALUES (auth.uid(), _member_id, _amount_usd, _screenshot_path, _note)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_leader_name FROM public.profiles WHERE id = auth.uid();

  PERFORM public.notify_user(
    _member_id,
    'Upkeep awaiting your approval',
    coalesce(v_leader_name, 'Your leader') || ' sent $' || _amount_usd || ' upkeep. Please confirm receipt.',
    'upkeep',
    '/dashboard'
  );

  RETURN v_id;
END;
$$;