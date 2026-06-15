
-- 1) Re-grant EXECUTE on helper functions used inside RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_descendant_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearest_fund_handler(uuid) TO authenticated;

-- 2) Anyone with the 'leader' role must be a fund handler
UPDATE public.profiles p
SET can_handle_funds = true
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'leader'
) AND can_handle_funds = false;

-- 3) Recompute leader_id for every non-handler so they point at their nearest upline fund handler
UPDATE public.profiles p
SET leader_id = public.nearest_fund_handler(p.sponsor_id)
WHERE p.can_handle_funds = false
  AND p.sponsor_id IS NOT NULL
  AND (p.leader_id IS NULL OR p.leader_id <> COALESCE(public.nearest_fund_handler(p.sponsor_id), '00000000-0000-0000-0000-000000000000'::uuid));

-- 4) Update handle_new_user: notify every fund handler in the upline chain
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  v_invite_code text := nullif(upper(trim(new.raw_user_meta_data->>'invite_code')), '');
  v_gender public.gender_kind := nullif(new.raw_user_meta_data->>'gender','')::public.gender_kind;
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

    -- Direct sponsor always gets notified
    PERFORM public.notify_user(
      v_sponsor_id,
      'New sponsored member',
      v_full_name || ' joined your team',
      'generic',
      '/dashboard'
    );

    -- Walk upline and notify EVERY fund handler in the chain (team leaders up the tree)
    v_walker := v_sponsor_id;
    v_depth := 0;
    WHILE v_walker IS NOT NULL AND v_depth < 50 LOOP
      SELECT can_handle_funds, sponsor_id INTO v_walker_handles, v_walker_sponsor
      FROM public.profiles WHERE id = v_walker;
      IF v_walker_handles AND v_walker <> v_sponsor_id THEN
        PERFORM public.notify_user(
          v_walker,
          'New member in your team',
          v_full_name || ' joined under ' || (SELECT full_name FROM public.profiles WHERE id = v_sponsor_id),
          'generic',
          '/dashboard'
        );
      END IF;
      v_walker := v_walker_sponsor;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;

  RETURN new;
END;
$function$;
