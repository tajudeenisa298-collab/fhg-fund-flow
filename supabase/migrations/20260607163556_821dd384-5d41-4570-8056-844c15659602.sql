CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_code_unique_idx
ON public.invite_codes (code);

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

    PERFORM public.notify_user(
      v_sponsor_id,
      'New sponsored member',
      v_full_name || ' joined your team',
      'generic',
      '/dashboard'
    );

    IF v_leader_id IS NOT NULL AND v_leader_id <> v_sponsor_id THEN
      PERFORM public.notify_user(
        v_leader_id,
        'New member to manage',
        v_full_name || ' joined under your fund management',
        'generic',
        '/dashboard'
      );
    END IF;
  END IF;

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE
  u record;
  v_full_name text;
  v_invite_code text;
  v_gender public.gender_kind;
  v_sponsor_id uuid;
  v_leader_id uuid;
  v_sponsor_handles boolean;
  v_invite record;
  v_role public.app_role;
  v_rank text;
  v_can_handle boolean;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data, au.created_at
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
    ORDER BY au.created_at
  LOOP
    v_full_name := coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1));
    v_invite_code := nullif(upper(trim(u.raw_user_meta_data->>'invite_code')), '');
    v_gender := nullif(u.raw_user_meta_data->>'gender','')::public.gender_kind;
    v_sponsor_id := null;
    v_leader_id := null;
    v_sponsor_handles := false;
    v_role := 'leader';
    v_rank := 'Director';
    v_can_handle := true;
    v_invite := null;

    IF v_invite_code IS NOT NULL THEN
      SELECT * INTO v_invite
      FROM public.invite_codes
      WHERE code = v_invite_code
      ORDER BY created_at DESC
      LIMIT 1;

      IF FOUND THEN
        v_sponsor_id := v_invite.leader_id;
        SELECT coalesce(can_handle_funds, false) INTO v_sponsor_handles FROM public.profiles WHERE id = v_sponsor_id;
        IF v_sponsor_handles THEN
          v_leader_id := v_sponsor_id;
        ELSE
          v_leader_id := public.nearest_fund_handler(v_sponsor_id);
        END IF;
        v_role := 'member';
        v_rank := 'Member';
        v_can_handle := false;
      END IF;
    END IF;

    INSERT INTO public.profiles (id, full_name, email, sponsor_id, leader_id, rank, can_handle_funds, gender, created_at)
    VALUES (u.id, v_full_name, u.email, v_sponsor_id, v_leader_id, v_rank, v_can_handle, v_gender, u.created_at)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role) VALUES (u.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'member')
    ON CONFLICT (user_id, role) DO NOTHING;

    IF v_invite_code IS NOT NULL AND v_invite.id IS NOT NULL AND v_invite.used_by IS NULL THEN
      UPDATE public.invite_codes SET used_by = u.id, used_at = coalesce(u.created_at, now()) WHERE id = v_invite.id;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_upkeep_plan_from_rank_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_default record;
  v_existing uuid;
BEGIN
  IF NEW.leader_id IS NULL OR coalesce(NEW.can_handle_funds, false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_default
  FROM public.rank_upkeep_defaults
  WHERE leader_id = NEW.leader_id
    AND rank = NEW.rank
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing
  FROM public.upkeep_plans
  WHERE member_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.upkeep_plans (leader_id, member_id, amount_usd, frequency, custom_days, next_run_at, active)
    VALUES (NEW.leader_id, NEW.id, v_default.amount_usd, v_default.frequency, v_default.custom_days, now(), true);
  ELSE
    UPDATE public.upkeep_plans
    SET leader_id = NEW.leader_id,
        amount_usd = v_default.amount_usd,
        frequency = v_default.frequency,
        custom_days = v_default.custom_days,
        active = true,
        updated_at = now()
    WHERE id = v_existing;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_sync_rank_upkeep ON public.profiles;
CREATE TRIGGER profiles_sync_rank_upkeep
AFTER INSERT OR UPDATE OF rank, leader_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_upkeep_plan_from_rank_default();