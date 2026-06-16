
-- 1) Atomic withdrawal approval + optional platform fee
CREATE OR REPLACE FUNCTION public.resolve_withdrawal_request(
  _id uuid,
  _status text,
  _note text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL,
  _local_amount numeric DEFAULT NULL,
  _platform_fee_usd numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_member_balance numeric;
  v_fee numeric := COALESCE(_platform_fee_usd, 0);
BEGIN
  IF _status NOT IN ('approved','declined') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF v_fee < 0 THEN RAISE EXCEPTION 'Fee cannot be negative'; END IF;
  IF v_fee >= v_req.amount_usd THEN RAISE EXCEPTION 'Fee must be less than the withdrawal amount'; END IF;

  UPDATE public.withdrawal_requests
    SET status = _status::withdrawal_status,
        leader_note = _note,
        resolved_at = now()
    WHERE id = _id;

  IF _status = 'approved' THEN
    SELECT balance_usd INTO v_member_balance FROM public.profiles WHERE id = v_req.member_id;
    IF v_member_balance < (v_req.amount_usd) THEN
      RAISE EXCEPTION 'Member balance insufficient';
    END IF;

    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, request_id)
    VALUES (v_req.member_id, v_req.leader_id, 'withdrawal', v_req.amount_usd,
            COALESCE(_currency,'NGN'), _exchange_rate, _local_amount, _note, _id);

    IF v_fee > 0 THEN
      INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, note)
      VALUES (v_req.member_id, v_req.leader_id, 'bank_fee', v_fee, 'USD',
              'Platform fee on withdrawal of $' || v_req.amount_usd);
    END IF;
  END IF;
END;
$$;

-- 2) get_downline — include new profile fields
DROP FUNCTION IF EXISTS public.get_downline(uuid);
CREATE OR REPLACE FUNCTION public.get_downline(_root uuid)
RETURNS TABLE(
  id uuid, full_name text, email text, leader_id uuid, sponsor_id uuid,
  rank text, balance_usd numeric, can_handle_funds boolean,
  gender public.gender_kind, avatar_url text, whatsapp_number text,
  payout_method text, created_at timestamptz, updated_at timestamptz, depth int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT p.*, 1 AS depth
    FROM public.profiles p
    WHERE p.sponsor_id = _root
    UNION ALL
    SELECT p.*, tree.depth + 1
    FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
    WHERE tree.depth < 50
  )
  SELECT tree.id, tree.full_name, tree.email, tree.leader_id, tree.sponsor_id, tree.rank,
         tree.balance_usd, tree.can_handle_funds, tree.gender, tree.avatar_url,
         tree.whatsapp_number, tree.payout_method::text, tree.created_at, tree.updated_at, tree.depth
  FROM tree
  WHERE _root = auth.uid() OR public.has_role(auth.uid(), 'leader') OR public.is_descendant_of(tree.id, auth.uid());
$$;

-- 3) handle_new_user: lock invite-code row + save bank details from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  v_invite_code text := nullif(upper(trim(new.raw_user_meta_data->>'invite_code')), '');
  v_gender public.gender_kind := nullif(new.raw_user_meta_data->>'gender','')::public.gender_kind;
  v_bank jsonb := new.raw_user_meta_data->'bank';
  v_sponsor_id uuid := null;
  v_leader_id uuid := null;
  v_role public.app_role := 'leader';
  v_invite_id uuid := null;
  v_initial_rank text := 'Director';
  v_can_handle boolean := true;
  v_invite record;
  v_sponsor_handles boolean := false;
  v_has_profiles boolean := false;
  v_walker uuid;
  v_walker_handles boolean;
  v_walker_sponsor uuid;
  v_depth int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_has_profiles;

  IF v_invite_code IS NULL AND v_has_profiles THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  IF v_invite_code IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.invite_codes
    WHERE code = v_invite_code
      AND used_by IS NULL
      AND revoked = false
      AND expires_at > now()
    FOR UPDATE
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    v_sponsor_id := v_invite.leader_id;
    SELECT coalesce(can_handle_funds, false) INTO v_sponsor_handles FROM public.profiles WHERE id = v_sponsor_id;

    IF v_sponsor_handles THEN
      v_leader_id := v_sponsor_id;
    ELSE
      v_leader_id := public.nearest_fund_handler(v_sponsor_id);
    END IF;

    v_role := 'member';
    v_invite_id := v_invite.id;
    v_initial_rank := 'Member';
    v_can_handle := false;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, sponsor_id, leader_id, rank, can_handle_funds, gender)
  VALUES (new.id, v_full_name, new.email, v_sponsor_id, v_leader_id, v_initial_rank, v_can_handle, v_gender)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_invite_id IS NOT NULL THEN
    UPDATE public.invite_codes SET used_by = new.id, used_at = now() WHERE id = v_invite_id;

    PERFORM public.notify_user(
      v_sponsor_id, 'New sponsored member',
      v_full_name || ' joined your team', 'generic', '/dashboard'
    );

    v_walker := v_sponsor_id;
    v_depth := 0;
    WHILE v_walker IS NOT NULL AND v_depth < 50 LOOP
      SELECT can_handle_funds, sponsor_id INTO v_walker_handles, v_walker_sponsor
      FROM public.profiles WHERE id = v_walker;
      IF v_walker_handles AND v_walker <> v_sponsor_id THEN
        PERFORM public.notify_user(
          v_walker, 'New member in your team',
          v_full_name || ' joined under ' || (SELECT full_name FROM public.profiles WHERE id = v_sponsor_id),
          'generic', '/dashboard'
        );
      END IF;
      v_walker := v_walker_sponsor;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  -- Save bank details (collected at signup) directly from metadata so the
  -- browser doesn't have to insert them right after sign-up.
  IF v_bank IS NOT NULL
     AND v_bank ? 'account_number'
     AND v_bank ? 'bank_name' THEN
    INSERT INTO public.bank_accounts (
      user_id, bank_name, bank_code, account_number, account_owner_name, verified_at
    )
    VALUES (
      new.id,
      v_bank->>'bank_name',
      NULLIF(v_bank->>'bank_code',''),
      v_bank->>'account_number',
      coalesce(v_bank->>'account_owner_name', v_full_name),
      CASE WHEN (v_bank->>'verified')::boolean IS TRUE THEN now() ELSE NULL END
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
