
-- 1) Withdrawal request rate limit (5/min/member)
CREATE OR REPLACE FUNCTION public.guard_withdrawal_request_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.withdrawal_requests
  WHERE member_id = NEW.member_id AND created_at > now() - interval '1 minute';
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Too many withdrawal requests. Please wait a minute and try again.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_withdrawal_request_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_withdrawal_request_rate_limit ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request_rate_limit
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request_rate_limit();

-- 2) acknowledge_upkeep rate limit (10/min/member)
CREATE OR REPLACE FUNCTION public.acknowledge_upkeep(_dispensation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
          coalesce(v_disp.note, 'Upkeep') || ' · approved by member')
  RETURNING id INTO v_txn_id;

  UPDATE public.upkeep_dispensations
  SET status = 'acknowledged', acknowledged_at = now(), txn_id = v_txn_id
  WHERE id = _dispensation_id;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(
    v_disp.leader_id, 'Upkeep approved',
    coalesce(v_member_name, 'Member') || ' confirmed $' || v_disp.amount_usd || ' upkeep',
    'upkeep', '/dashboard'
  );
  RETURN v_txn_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.acknowledge_upkeep(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_upkeep(uuid) TO authenticated;

-- 3) cron_failure_alerts dedupe table
CREATE TABLE IF NOT EXISTS public.cron_failure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jobid bigint NOT NULL,
  runid bigint NOT NULL,
  jobname text,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jobid, runid)
);
GRANT ALL ON public.cron_failure_alerts TO service_role;
ALTER TABLE public.cron_failure_alerts ENABLE ROW LEVEL SECURITY;

-- 4) check_cron_failures
CREATE OR REPLACE FUNCTION public.check_cron_failures()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

    FOR v_leader IN SELECT user_id FROM public.user_roles WHERE role = 'leader' LOOP
      PERFORM public.notify_user(
        v_leader, 'Cron job failing',
        'Job "' || coalesce(v_job.jobname, v_job.jobid::text) || '" has failed twice in a row. Check the cron health card.',
        'system', '/dashboard'
      );
    END LOOP;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_cron_failures() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_failures() TO service_role;

DO $$ DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'check-cron-failures';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;
END $$;
SELECT cron.schedule('check-cron-failures', '*/5 * * * *', $$ SELECT public.check_cron_failures(); $$);

-- 5) run_due_upkeep with per-plan error capture
DROP FUNCTION IF EXISTS public.run_due_upkeep();
CREATE OR REPLACE FUNCTION public.run_due_upkeep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan record; v_count int := 0; v_next timestamptz;
  v_status record; v_member_name text; v_err text;
BEGIN
  FOR v_plan IN
    SELECT up.* FROM public.upkeep_plans up
    WHERE up.active = true AND up.next_run_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT suspended_until, terminated_at, full_name
        INTO v_status FROM public.profiles WHERE id = v_plan.member_id;

      IF v_status.terminated_at IS NOT NULL
         OR (v_status.suspended_until IS NOT NULL AND v_status.suspended_until > now()) THEN
        v_member_name := coalesce(v_status.full_name, 'A member');
        PERFORM public.notify_user(
          v_plan.leader_id, 'Upkeep skipped',
          v_member_name || ' is '
            || CASE WHEN v_status.terminated_at IS NOT NULL THEN 'terminated' ELSE 'suspended' END
            || ' — $' || v_plan.amount_usd || ' upkeep was not dispensed.',
          'upkeep', '/dashboard'
        );
        v_next := CASE v_plan.frequency
          WHEN 'every_3_days' THEN v_plan.next_run_at + interval '3 days'
          WHEN 'weekly' THEN v_plan.next_run_at + interval '7 days'
          WHEN 'biweekly' THEN v_plan.next_run_at + interval '14 days'
          WHEN 'monthly' THEN v_plan.next_run_at + interval '1 month'
          WHEN 'custom_days' THEN v_plan.next_run_at + (coalesce(v_plan.custom_days,7) || ' days')::interval
        END;
        UPDATE public.upkeep_plans SET next_run_at = v_next WHERE id = v_plan.id;
        CONTINUE;
      END IF;

      INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
      VALUES (v_plan.member_id, v_plan.leader_id, 'deposit', v_plan.amount_usd, 'Upkeep stipend');

      v_next := CASE v_plan.frequency
        WHEN 'every_3_days' THEN v_plan.next_run_at + interval '3 days'
        WHEN 'weekly' THEN v_plan.next_run_at + interval '7 days'
        WHEN 'biweekly' THEN v_plan.next_run_at + interval '14 days'
        WHEN 'monthly' THEN v_plan.next_run_at + interval '1 month'
        WHEN 'custom_days' THEN v_plan.next_run_at + (coalesce(v_plan.custom_days,7) || ' days')::interval
      END;
      UPDATE public.upkeep_plans SET next_run_at = v_next WHERE id = v_plan.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
      VALUES (NULL, 'cron_run_due_upkeep_error', v_plan.id,
        jsonb_build_object('plan_id', v_plan.id, 'leader_id', v_plan.leader_id, 'error', v_err, 'at', now()));
    END;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.run_due_upkeep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_due_upkeep() TO service_role;
