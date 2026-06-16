
-- =========================================================
-- 1) Lock down SECURITY DEFINER function EXECUTE
-- =========================================================
-- Revoke broad EXECUTE on every function in public from anon and PUBLIC,
-- then explicitly grant the ones that should be callable.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- Functions intentionally callable by anonymous users (signup flow):
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;

-- Functions callable by signed-in users:
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_descendant_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearest_fund_handler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_downline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_member(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_member(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pardon_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispense_upkeep(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_upkeep(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_upkeep(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_member(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_member_to_leader(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leader_purse_withdraw(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_office_expense(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_managed_transaction(uuid, text, numeric, text, text, numeric, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal_request(uuid, text, text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal_request(uuid, text, text, text, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_fund_handlers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, public.notification_kind, text) TO authenticated;

-- Service-role / cron-only RPCs (no anon, no authenticated):
GRANT EXECUTE ON FUNCTION public.run_due_upkeep() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_due_fund_rules() TO service_role;

-- =========================================================
-- 2) pv_logs: drop self-update policy
-- =========================================================
DROP POLICY IF EXISTS pv_logs_own_update ON public.pv_logs;

-- =========================================================
-- 3) Avatars storage: scope reads to owner or their leader
-- =========================================================
DROP POLICY IF EXISTS "Avatars are viewable by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_or_leader_read ON storage.objects;

CREATE POLICY avatars_owner_or_leader_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.leader_id = auth.uid()
      )
    )
  );

-- =========================================================
-- 4) Withdrawal requests: prevent inserts when leader_id is NULL
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_withdrawal_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_leader uuid;
BEGIN
  IF NEW.member_id IS NULL OR NEW.leader_id IS NULL THEN
    RAISE EXCEPTION 'Member and leader are required';
  END IF;
  SELECT leader_id INTO v_leader FROM public.profiles WHERE id = NEW.member_id;
  IF v_leader IS NULL THEN
    RAISE EXCEPTION 'Your account is not attached to a team leader yet';
  END IF;
  IF v_leader <> NEW.leader_id THEN
    RAISE EXCEPTION 'Leader mismatch';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.guard_withdrawal_request_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_request_insert ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request_insert
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request_insert();

-- =========================================================
-- 5) Audit log for suspend / terminate / pardon
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.member_status_action AS ENUM ('suspended','terminated','pardoned','finalized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.member_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action public.member_status_action NOT NULL,
  reason text,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.member_status_log TO authenticated;
GRANT ALL ON public.member_status_log TO service_role;

ALTER TABLE public.member_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_status_log_leader_read ON public.member_status_log;
CREATE POLICY member_status_log_leader_read ON public.member_status_log
  FOR SELECT TO authenticated
  USING (leader_id = auth.uid() OR member_id = auth.uid());

CREATE INDEX IF NOT EXISTS member_status_log_leader_created_idx
  ON public.member_status_log (leader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_status_log_member_created_idx
  ON public.member_status_log (member_id, created_at DESC);

-- =========================================================
-- 6) profiles.finalized_at — permanent termination marker
-- =========================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- Extend the self-update guard to also protect finalized_at
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  NEW.finalized_at     := OLD.finalized_at;
  RETURN NEW;
END;
$$;

-- =========================================================
-- 7) Suspend / Terminate / Pardon — write audit rows
-- =========================================================
CREATE OR REPLACE FUNCTION public.suspend_member(_member_id uuid, _until timestamptz, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  UPDATE public.upkeep_plans SET active = false WHERE member_id = _member_id;

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action, reason, effective_until)
  VALUES (_member_id, auth.uid(), auth.uid(), 'suspended', nullif(trim(coalesce(_reason,'')),''), _until);

  PERFORM public.notify_user(_member_id, 'Account suspended',
    'Your account has been suspended until ' || to_char(_until,'YYYY-MM-DD HH24:MI')
      || coalesce(' — ' || _reason, ''),
    'generic', '/dashboard');
END;
$$;

CREATE OR REPLACE FUNCTION public.terminate_member(_member_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action, reason)
  VALUES (_member_id, auth.uid(), auth.uid(), 'terminated', nullif(trim(coalesce(_reason,'')),''));

  PERFORM public.notify_user(_member_id, 'Account terminated',
    'Your account has been terminated' || coalesce(' — ' || _reason, '')
      || '. You have 90 days to be pardoned.',
    'generic', '/dashboard');
END;
$$;

CREATE OR REPLACE FUNCTION public.pardon_member(_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT * INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your member'; END IF;
  IF v_member.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Termination is permanent — already finalized';
  END IF;
  IF v_member.terminated_at IS NOT NULL AND v_member.terminated_at < now() - interval '90 days' THEN
    RAISE EXCEPTION 'Termination is permanent — the 90-day pardon window has passed';
  END IF;

  UPDATE public.profiles
    SET suspended_until = NULL,
        suspended_reason = NULL,
        terminated_at = NULL,
        terminated_reason = NULL
    WHERE id = _member_id;

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action)
  VALUES (_member_id, auth.uid(), auth.uid(), 'pardoned');

  PERFORM public.notify_user(_member_id, 'Account reinstated',
    'Your account has been pardoned and is active again.',
    'generic', '/dashboard');
END;
$$;

GRANT EXECUTE ON FUNCTION public.suspend_member(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_member(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pardon_member(uuid) TO authenticated;

-- =========================================================
-- 8) 90-day finalize-terminations job
-- =========================================================
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
    -- Revoke all roles so the user can no longer act in the app
    DELETE FROM public.user_roles WHERE user_id = r.id;
    INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action)
    VALUES (r.id, coalesce(r.leader_id, r.id), NULL, 'finalized');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.finalize_terminated_members() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_terminated_members() TO service_role;
