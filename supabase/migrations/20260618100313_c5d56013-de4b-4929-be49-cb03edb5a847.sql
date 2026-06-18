
-- 1) Audit log for app_settings changes (especially NGN rate)
CREATE OR REPLACE FUNCTION public.tg_audit_app_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, target_id, details)
  VALUES (
    auth.uid(),
    'app_settings_updated',
    NULL,
    NULL,
    jsonb_build_object(
      'usd_to_ngn_old', OLD.usd_to_ngn,
      'usd_to_ngn_new', NEW.usd_to_ngn,
      'member_daily_upkeep_cap_usd_old', OLD.member_daily_upkeep_cap_usd,
      'member_daily_upkeep_cap_usd_new', NEW.member_daily_upkeep_cap_usd,
      'member_daily_withdrawal_cap_usd_old', OLD.member_daily_withdrawal_cap_usd,
      'member_daily_withdrawal_cap_usd_new', NEW.member_daily_withdrawal_cap_usd,
      'member_weekly_withdrawal_cap_usd_old', OLD.member_weekly_withdrawal_cap_usd,
      'member_weekly_withdrawal_cap_usd_new', NEW.member_weekly_withdrawal_cap_usd
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS app_settings_audit ON public.app_settings;
CREATE TRIGGER app_settings_audit
AFTER UPDATE ON public.app_settings
FOR EACH ROW
WHEN (OLD IS DISTINCT FROM NEW)
EXECUTE FUNCTION public.tg_audit_app_settings();

-- 2) Cron failure alerts: only notify root leaders (no upline leader / sponsor)
CREATE OR REPLACE FUNCTION public.check_cron_failures()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_job record; v_last record; v_prev record; v_leader uuid;
BEGIN
  FOR v_job IN SELECT jobid, jobname FROM cron.job LOOP
    SELECT * INTO v_last FROM cron.job_run_details
    WHERE jobid = v_job.jobid ORDER BY start_time DESC LIMIT 1;
    CONTINUE WHEN v_last IS NULL OR v_last.status = 'succeeded';

    SELECT * INTO v_prev FROM cron.job_run_details
    WHERE jobid = v_job.jobid AND runid <> v_last.runid
    ORDER BY start_time DESC LIMIT 1;
    CONTINUE WHEN v_prev IS NULL OR v_prev.status = 'succeeded';

    IF EXISTS (SELECT 1 FROM public.cron_failure_alerts WHERE jobid = v_job.jobid AND runid = v_last.runid) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.cron_failure_alerts (jobid, runid, jobname)
    VALUES (v_job.jobid, v_last.runid, v_job.jobname);

    -- Only notify root leaders (no sponsor / no upline leader) to avoid spamming sub-leaders
    FOR v_leader IN
      SELECT ur.user_id
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'leader'
        AND p.sponsor_id IS NULL
        AND p.terminated_at IS NULL
    LOOP
      PERFORM public.notify_user(
        v_leader, 'Cron job failing',
        'Job "' || coalesce(v_job.jobname, v_job.jobid::text) || '" has failed twice in a row. Check the cron health card.',
        'system', '/dashboard'
      );
    END LOOP;
  END LOOP;
END $function$;

-- 3) Org-wide pending withdrawals for a root leader
CREATE OR REPLACE FUNCTION public.get_org_pending_withdrawals(_root uuid)
RETURNS TABLE (
  id uuid,
  member_id uuid,
  member_name text,
  leader_id uuid,
  leader_name text,
  amount_usd numeric,
  status text,
  description text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.profiles WHERE id = _root
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
  ),
  sub_leaders AS (
    SELECT t.id FROM tree t
    JOIN public.profiles p ON p.id = t.id
    WHERE coalesce(p.can_handle_funds, false) = true
  )
  SELECT w.id, w.member_id, mp.full_name, w.leader_id, lp.full_name,
         w.amount_usd, w.status::text, w.description, w.created_at
  FROM public.withdrawal_requests w
  JOIN public.profiles mp ON mp.id = w.member_id
  JOIN public.profiles lp ON lp.id = w.leader_id
  WHERE w.leader_id IN (SELECT id FROM sub_leaders)
    AND w.status IN ('pending', 'awaiting_second_approval')
    AND (_root = auth.uid() OR public.has_role(auth.uid(), 'leader') AND public.is_descendant_of(_root, auth.uid()) OR _root = auth.uid())
  ORDER BY w.created_at ASC;
$$;

-- 4) Sub-leader purse / office summary for a root leader
CREATE OR REPLACE FUNCTION public.get_org_subleader_summary(_root uuid)
RETURNS TABLE (
  leader_id uuid,
  leader_name text,
  purse_balance_usd numeric,
  office_balance_ngn numeric,
  pending_withdrawal_count bigint,
  pending_upkeep_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.profiles WHERE sponsor_id = _root
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
  ),
  sub_leaders AS (
    SELECT t.id, p.full_name
    FROM tree t
    JOIN public.profiles p ON p.id = t.id
    WHERE coalesce(p.can_handle_funds, false) = true
      AND p.terminated_at IS NULL
  )
  SELECT
    sl.id,
    sl.full_name,
    coalesce((
      SELECT sum(CASE WHEN kind='credit' THEN amount_usd ELSE -amount_usd END)
      FROM public.leader_purse_ledger WHERE leader_id = sl.id
    ), 0)::numeric,
    coalesce((
      SELECT sum(CASE WHEN kind='support_in' THEN amount_ngn ELSE -amount_ngn END)
      FROM public.office_ledger WHERE leader_id = sl.id
    ), 0)::numeric,
    (SELECT count(*) FROM public.withdrawal_requests
       WHERE leader_id = sl.id AND status IN ('pending','awaiting_second_approval')),
    (SELECT count(*) FROM public.upkeep_dispensations
       WHERE leader_id = sl.id AND status = 'pending')
  FROM sub_leaders sl
  WHERE _root = auth.uid() OR public.has_role(auth.uid(), 'leader');
$$;

-- 5) Count how many members would be reparented when granting fund-handler to a member
CREATE OR REPLACE FUNCTION public.preview_reparent_count(_member_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT id, sponsor_id, can_handle_funds
    FROM public.profiles WHERE sponsor_id = _member_id
    UNION ALL
    SELECT p.id, p.sponsor_id, p.can_handle_funds
    FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
  )
  SELECT count(*)::int FROM tree
  WHERE coalesce(can_handle_funds, false) = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_pending_withdrawals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_subleader_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_reparent_count(uuid) TO authenticated;
