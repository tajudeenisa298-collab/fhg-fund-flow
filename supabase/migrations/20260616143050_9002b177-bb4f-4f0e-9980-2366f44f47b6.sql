
CREATE OR REPLACE FUNCTION public.suspend_member(_member_id uuid, _until timestamp with time zone, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _member_id = auth.uid() THEN RAISE EXCEPTION 'You cannot suspend your own account'; END IF;
  IF _until IS NULL OR _until <= now() THEN RAISE EXCEPTION 'Suspension end must be in the future'; END IF;
  SELECT id, leader_id, can_handle_funds INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;
  IF coalesce(v_member.can_handle_funds, false) THEN
    RAISE EXCEPTION 'Cannot suspend a fund-handling leader';
  END IF;

  UPDATE public.profiles
    SET suspended_until = _until,
        suspended_reason = nullif(trim(coalesce(_reason,'')),'')
    WHERE id = _member_id;

  UPDATE public.upkeep_plans SET active = false WHERE member_id = _member_id;

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action, reason, effective_until)
  VALUES (_member_id, auth.uid(), auth.uid(), 'suspended', nullif(trim(coalesce(_reason,'')),''), _until);

  PERFORM public.notify_user(_member_id, 'Account suspended',
    'Your account has been suspended until ' || to_char(_until,'YYYY-MM-DD HH24:MI')
      || coalesce(' — ' || _reason, ''),
    'generic', '/dashboard');
END;
$function$;

CREATE OR REPLACE FUNCTION public.terminate_member(_member_id uuid, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _member_id = auth.uid() THEN RAISE EXCEPTION 'You cannot terminate your own account'; END IF;
  SELECT id, leader_id, can_handle_funds INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;
  IF coalesce(v_member.can_handle_funds, false) THEN
    RAISE EXCEPTION 'Cannot terminate a fund-handling leader';
  END IF;

  UPDATE public.profiles
    SET terminated_at = now(),
        terminated_reason = nullif(trim(coalesce(_reason,'')),''),
        suspended_until = NULL,
        suspended_reason = NULL
    WHERE id = _member_id;

  UPDATE public.upkeep_plans SET active = false WHERE member_id = _member_id;

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action, reason)
  VALUES (_member_id, auth.uid(), auth.uid(), 'terminated', nullif(trim(coalesce(_reason,'')),''));

  PERFORM public.notify_user(_member_id, 'Account terminated',
    'Your account has been terminated' || coalesce(' — ' || _reason, '')
      || '. You have 90 days to be pardoned.',
    'generic', '/dashboard');
END;
$function$;
