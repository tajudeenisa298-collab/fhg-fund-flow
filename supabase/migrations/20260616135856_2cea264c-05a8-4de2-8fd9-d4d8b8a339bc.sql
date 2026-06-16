
-- Suspension / termination support on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_reason text;

-- Update self-update guard to also lock these fields from the user themself
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;
  NEW.rank             := OLD.rank;
  NEW.balance_usd      := OLD.balance_usd;
  NEW.can_handle_funds := OLD.can_handle_funds;
  NEW.sponsor_id       := OLD.sponsor_id;
  NEW.leader_id        := OLD.leader_id;
  NEW.email            := OLD.email;
  NEW.suspended_until  := OLD.suspended_until;
  NEW.suspended_reason := OLD.suspended_reason;
  NEW.terminated_at    := OLD.terminated_at;
  NEW.terminated_reason := OLD.terminated_reason;
  RETURN NEW;
END;
$function$;

-- Suspend a member (leader only, must be their managed member)
CREATE OR REPLACE FUNCTION public.suspend_member(_member_id uuid, _until timestamptz, _reason text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _until IS NULL OR _until <= now() THEN RAISE EXCEPTION 'Suspension end must be in the future'; END IF;
  SELECT id, leader_id INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;

  UPDATE public.profiles
    SET suspended_until = _until,
        suspended_reason = nullif(trim(coalesce(_reason,'')),'')
    WHERE id = _member_id;

  -- Pause upkeep plans
  UPDATE public.upkeep_plans SET active = false WHERE member_id = _member_id;

  PERFORM public.notify_user(_member_id, 'Account suspended',
    'Your account has been suspended until ' || to_char(_until,'YYYY-MM-DD HH24:MI')
      || coalesce(' — ' || _reason, ''),
    'generic', '/dashboard');
END;
$$;

-- Terminate a member permanently (90-day pardon window enforced in pardon_member)
CREATE OR REPLACE FUNCTION public.terminate_member(_member_id uuid, _reason text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT id, leader_id INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;

  UPDATE public.profiles
    SET terminated_at = now(),
        terminated_reason = nullif(trim(coalesce(_reason,'')),''),
        suspended_until = NULL,
        suspended_reason = NULL
    WHERE id = _member_id;

  UPDATE public.upkeep_plans SET active = false WHERE member_id = _member_id;

  PERFORM public.notify_user(_member_id, 'Account terminated',
    'Your account has been terminated' || coalesce(' — ' || _reason, '')
      || '. You have 90 days to be pardoned.',
    'generic', '/dashboard');
END;
$$;

-- Pardon: lifts suspension or termination (termination only within 90 days)
CREATE OR REPLACE FUNCTION public.pardon_member(_member_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT * INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;

  IF v_member.terminated_at IS NOT NULL AND v_member.terminated_at < now() - interval '90 days' THEN
    RAISE EXCEPTION 'Termination is permanent — the 90-day pardon window has passed';
  END IF;

  UPDATE public.profiles
    SET suspended_until = NULL,
        suspended_reason = NULL,
        terminated_at = NULL,
        terminated_reason = NULL
    WHERE id = _member_id;

  PERFORM public.notify_user(_member_id, 'Account reinstated',
    'Your account has been pardoned and is active again.',
    'generic', '/dashboard');
END;
$$;

-- Block upkeep dispensation & scheduled runs for suspended/terminated members
CREATE OR REPLACE FUNCTION public.dispense_upkeep(_member_id uuid, _amount_usd numeric, _screenshot_path text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  SELECT id, leader_id, full_name, can_handle_funds, suspended_until, terminated_at INTO v_member
  FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;
  IF v_member.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Member is terminated';
  END IF;
  IF v_member.suspended_until IS NOT NULL AND v_member.suspended_until > now() THEN
    RAISE EXCEPTION 'Member is suspended until %', to_char(v_member.suspended_until,'YYYY-MM-DD HH24:MI');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.upkeep_dispensations
    WHERE leader_id = auth.uid() AND member_id = _member_id
      AND amount_usd = _amount_usd AND status = 'pending'
      AND created_at > now() - interval '2 minutes'
  ) INTO v_dup_exists;
  IF v_dup_exists THEN
    RAISE EXCEPTION 'Looks like a duplicate — an identical pending upkeep was just sent. Wait a moment or cancel the previous one.';
  END IF;

  INSERT INTO public.upkeep_dispensations (leader_id, member_id, amount_usd, screenshot_path, note)
  VALUES (auth.uid(), _member_id, _amount_usd, _screenshot_path, _note)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_leader_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(_member_id, 'Upkeep awaiting your approval',
    coalesce(v_leader_name, 'Your leader') || ' sent $' || _amount_usd || ' upkeep. Please confirm receipt.',
    'upkeep', '/dashboard');
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_due_upkeep()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_plan record; v_count int := 0; v_next timestamptz; v_status record;
begin
  for v_plan in
    select up.* from public.upkeep_plans up
    where up.active = true and up.next_run_at <= now()
    for update skip locked
  loop
    select suspended_until, terminated_at into v_status from public.profiles where id = v_plan.member_id;
    if v_status.terminated_at is not null
       or (v_status.suspended_until is not null and v_status.suspended_until > now()) then
      -- skip; bump next_run_at so we don't spin
      v_next := case v_plan.frequency
        when 'every_3_days' then v_plan.next_run_at + interval '3 days'
        when 'weekly' then v_plan.next_run_at + interval '7 days'
        when 'biweekly' then v_plan.next_run_at + interval '14 days'
        when 'monthly' then v_plan.next_run_at + interval '1 month'
        when 'custom_days' then v_plan.next_run_at + (coalesce(v_plan.custom_days,7) || ' days')::interval
      end;
      update public.upkeep_plans set next_run_at = v_next where id = v_plan.id;
      continue;
    end if;

    insert into public.transactions (member_id, leader_id, type, amount_usd, note)
      values (v_plan.member_id, v_plan.leader_id, 'deposit', v_plan.amount_usd, 'Upkeep stipend');

    v_next := case v_plan.frequency
      when 'every_3_days' then v_plan.next_run_at + interval '3 days'
      when 'weekly' then v_plan.next_run_at + interval '7 days'
      when 'biweekly' then v_plan.next_run_at + interval '14 days'
      when 'monthly' then v_plan.next_run_at + interval '1 month'
      when 'custom_days' then v_plan.next_run_at + (coalesce(v_plan.custom_days,7) || ' days')::interval
    end;
    update public.upkeep_plans set next_run_at = v_next where id = v_plan.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;
