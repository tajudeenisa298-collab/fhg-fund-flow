
-- 1) Member-cancellation flag + RPC
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS cancelled_by_member boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cancel_withdrawal_request(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_req record;
BEGIN
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_req.member_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be cancelled'; END IF;

  UPDATE public.withdrawal_requests
  SET status = 'declined',
      cancelled_by_member = true,
      resolved_at = now(),
      leader_note = COALESCE(leader_note, 'Cancelled by member')
  WHERE id = _id;

  PERFORM public.notify_user(
    v_req.leader_id,
    'Withdrawal cancelled',
    'A member cancelled their $' || v_req.amount_usd || ' withdrawal request.',
    'request_resolved',
    '/dashboard'
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_request(uuid) TO authenticated;

-- 2) Dispute resolution
ALTER TABLE public.upkeep_dispensations
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolution_credit boolean;

CREATE OR REPLACE FUNCTION public.resolve_dispute(_dispensation_id uuid, _credit boolean, _note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_disp record;
  v_txn_id uuid;
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
    SET status = 'acknowledged',
        resolved_at = now(),
        resolution_note = trim(_note),
        resolution_credit = true,
        txn_id = v_txn_id
    WHERE id = _dispensation_id;
  ELSE
    UPDATE public.upkeep_dispensations
    SET resolved_at = now(),
        resolution_note = trim(_note),
        resolution_credit = false
    WHERE id = _dispensation_id;
  END IF;

  PERFORM public.notify_user(
    v_disp.member_id,
    CASE WHEN _credit THEN 'Upkeep dispute resolved — credited' ELSE 'Upkeep dispute closed' END,
    trim(_note),
    'upkeep',
    '/dashboard'
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_dispute(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, boolean, text) TO authenticated;
