
-- ============ #3 Notify leader when upkeep is skipped ============
CREATE OR REPLACE FUNCTION public.run_due_upkeep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_plan record;
  v_count int := 0;
  v_next timestamptz;
  v_status record;
  v_member_name text;
begin
  for v_plan in
    select up.* from public.upkeep_plans up
    where up.active = true and up.next_run_at <= now()
    for update skip locked
  loop
    select suspended_until, terminated_at, full_name
      into v_status from public.profiles where id = v_plan.member_id;

    if v_status.terminated_at is not null
       or (v_status.suspended_until is not null and v_status.suspended_until > now()) then
      v_member_name := coalesce(v_status.full_name, 'A member');
      perform public.notify_user(
        v_plan.leader_id,
        'Upkeep skipped',
        v_member_name || ' is '
          || case when v_status.terminated_at is not null then 'terminated' else 'suspended' end
          || ' — $' || v_plan.amount_usd || ' upkeep was not dispensed.',
        'upkeep',
        '/dashboard'
      );

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
end $$;

REVOKE EXECUTE ON FUNCTION public.run_due_upkeep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_upkeep() TO service_role;

-- ============ #5 Reassign orphaned members on finalize ============
CREATE OR REPLACE FUNCTION public.reassign_members_from(_old_leader uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_walker uuid;
  v_walker_handles boolean;
  v_walker_sponsor uuid;
  v_walker_term timestamptz;
  v_walker_final timestamptz;
  v_new_leader uuid;
  v_depth int;
  v_count int := 0;
BEGIN
  FOR m IN
    SELECT id, sponsor_id, full_name
    FROM public.profiles
    WHERE leader_id = _old_leader
      AND id <> _old_leader
      AND coalesce(can_handle_funds, false) = false
  LOOP
    v_walker := m.sponsor_id;
    v_depth := 0;
    v_new_leader := NULL;
    WHILE v_walker IS NOT NULL AND v_depth < 50 LOOP
      SELECT can_handle_funds, sponsor_id, terminated_at, finalized_at
        INTO v_walker_handles, v_walker_sponsor, v_walker_term, v_walker_final
      FROM public.profiles WHERE id = v_walker;
      IF v_walker <> _old_leader
         AND coalesce(v_walker_handles, false)
         AND v_walker_term IS NULL
         AND v_walker_final IS NULL THEN
        v_new_leader := v_walker;
        EXIT;
      END IF;
      v_walker := v_walker_sponsor;
      v_depth := v_depth + 1;
    END LOOP;

    UPDATE public.profiles SET leader_id = v_new_leader WHERE id = m.id;
    UPDATE public.upkeep_plans SET leader_id = v_new_leader WHERE member_id = m.id AND v_new_leader IS NOT NULL;

    IF v_new_leader IS NOT NULL THEN
      PERFORM public.notify_user(
        v_new_leader,
        'New member assigned to you',
        coalesce(m.full_name, 'A member') || ' was reassigned because their previous leader''s account was finalized.',
        'generic',
        '/dashboard'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.reassign_members_from(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_members_from(uuid) TO service_role;

-- Call it from finalize
CREATE OR REPLACE FUNCTION public.finalize_terminated_members()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_count int := 0;
BEGIN
  FOR r IN
    SELECT id, leader_id
    FROM public.profiles
    WHERE terminated_at IS NOT NULL
      AND finalized_at IS NULL
      AND terminated_at < now() - interval '90 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.profiles SET finalized_at = now() WHERE id = r.id;
    DELETE FROM public.user_roles WHERE user_id = r.id;
    PERFORM public.reassign_members_from(r.id);
    INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action)
    VALUES (r.id, coalesce(r.leader_id, r.id), NULL, 'finalized');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.finalize_terminated_members() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_terminated_members() TO service_role;
