
-- ============================================================================
-- 1. LEADER POWER: adjust member balance (credit / debit) with reason
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leader_adjust_balance(
  _member_id uuid,
  _amount_usd numeric,
  _direction text,           -- 'credit' or 'debit'
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member record;
  v_txn_id uuid;
  v_recent int;
  v_day_member numeric;
  v_day_leader numeric;
  v_type text;
  v_member_cap numeric := 500;
  v_leader_cap numeric := 2000;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Please provide a reason (at least 10 characters)';
  END IF;
  IF _direction NOT IN ('credit','debit') THEN
    RAISE EXCEPTION 'Direction must be credit or debit';
  END IF;

  SELECT id, leader_id, balance_usd, can_handle_funds, full_name, terminated_at
    INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;
  IF v_member.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Member is terminated';
  END IF;

  -- Rate limit: max 10 adjustments / leader / minute
  SELECT count(*) INTO v_recent FROM public.transactions
   WHERE leader_id = auth.uid()
     AND type IN ('adjustment','fund_deduction')
     AND note LIKE 'Leader adjustment:%'
     AND created_at > now() - interval '1 minute';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'Too many adjustments. Please wait a minute.';
  END IF;

  -- Daily caps
  SELECT coalesce(sum(amount_usd),0) INTO v_day_member FROM public.transactions
   WHERE member_id = _member_id AND note LIKE 'Leader adjustment:%'
     AND created_at > now() - interval '1 day';
  IF v_day_member + _amount_usd > v_member_cap THEN
    RAISE EXCEPTION 'Daily adjustment cap of $% reached for this member. Use the withdrawal request flow for larger amounts.', v_member_cap;
  END IF;

  SELECT coalesce(sum(amount_usd),0) INTO v_day_leader FROM public.transactions
   WHERE leader_id = auth.uid() AND note LIKE 'Leader adjustment:%'
     AND created_at > now() - interval '1 day';
  IF v_day_leader + _amount_usd > v_leader_cap THEN
    RAISE EXCEPTION 'Your daily adjustment cap of $% has been reached.', v_leader_cap;
  END IF;

  IF _direction = 'debit' AND _amount_usd > v_member.balance_usd THEN
    RAISE EXCEPTION 'Debit amount exceeds member balance';
  END IF;

  v_type := CASE WHEN _direction = 'credit' THEN 'adjustment' ELSE 'fund_deduction' END;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
  VALUES (_member_id, auth.uid(), v_type::public.txn_type, _amount_usd,
          'Leader adjustment: ' || trim(_reason))
  RETURNING id INTO v_txn_id;

  PERFORM public.notify_user(
    _member_id,
    CASE WHEN _direction='credit' THEN 'Balance credited by leader' ELSE 'Balance debited by leader' END,
    '$' || _amount_usd || ' — ' || trim(_reason),
    'generic',
    '/dashboard'
  );

  PERFORM public.log_admin_action('leader_adjust_balance', _member_id, v_txn_id,
    jsonb_build_object('amount_usd', _amount_usd, 'direction', _direction, 'reason', _reason));

  RETURN v_txn_id;
END $$;

REVOKE ALL ON FUNCTION public.leader_adjust_balance(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leader_adjust_balance(uuid, numeric, text, text) TO authenticated;

-- ============================================================================
-- 2. LEADER POWER: override member rank with reason
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leader_override_rank(
  _member_id uuid,
  _new_rank text,
  _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_member record; v_old_rank text;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Please provide a reason (at least 10 characters)';
  END IF;
  IF NOT public.is_valid_rank(_new_rank) THEN
    RAISE EXCEPTION 'Invalid rank: %', _new_rank;
  END IF;

  SELECT id, leader_id, rank, full_name, terminated_at
    INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;
  IF v_member.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Member is terminated';
  END IF;

  v_old_rank := v_member.rank;
  IF v_old_rank = _new_rank THEN RETURN; END IF;

  -- Bypass guard_profile_self_update by going through SECURITY DEFINER
  UPDATE public.profiles SET rank = _new_rank WHERE id = _member_id;

  INSERT INTO public.member_status_log (member_id, leader_id, actor_id, action, note)
  VALUES (_member_id, auth.uid(), auth.uid(), 'rank_override',
          v_old_rank || ' → ' || _new_rank || ': ' || trim(_reason));

  PERFORM public.notify_user(_member_id, 'Your rank was updated',
    'New rank: ' || _new_rank || '. Reason: ' || trim(_reason),
    'generic', '/dashboard');

  PERFORM public.log_admin_action('leader_override_rank', _member_id, NULL,
    jsonb_build_object('old_rank', v_old_rank, 'new_rank', _new_rank, 'reason', _reason));
END $$;

REVOKE ALL ON FUNCTION public.leader_override_rank(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leader_override_rank(uuid, text, text) TO authenticated;

-- Allow member_status_log to accept 'rank_override' if action is constrained
-- (action column is plain text per current schema, no constraint to widen)

-- ============================================================================
-- 3. EDIT LOCKS: prevent silent rewrites once money has moved
-- ============================================================================

-- 3a. pv_logs: once linked to a transaction, money fields are frozen
CREATE OR REPLACE FUNCTION public.tg_guard_pv_logs_locked()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.txn_id IS NOT NULL THEN
    IF NEW.pv          IS DISTINCT FROM OLD.pv
    OR NEW.price_usd   IS DISTINCT FROM OLD.price_usd
    OR NEW.price_ngn   IS DISTINCT FROM OLD.price_ngn
    OR NEW.member_id   IS DISTINCT FROM OLD.member_id
    OR NEW.period_month IS DISTINCT FROM OLD.period_month
    OR NEW.txn_id      IS DISTINCT FROM OLD.txn_id THEN
      RAISE EXCEPTION 'This PV entry is linked to a deduction and cannot be edited. Reverse the transaction first.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pv_logs_guard_locked ON public.pv_logs;
CREATE TRIGGER pv_logs_guard_locked
  BEFORE UPDATE ON public.pv_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_pv_logs_locked();

-- 3b. upkeep_dispensations: lock money fields once linked to a txn
CREATE OR REPLACE FUNCTION public.tg_guard_dispensation_locked()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.txn_id IS NOT NULL THEN
    IF NEW.amount_usd     IS DISTINCT FROM OLD.amount_usd
    OR NEW.member_id      IS DISTINCT FROM OLD.member_id
    OR NEW.leader_id      IS DISTINCT FROM OLD.leader_id
    OR NEW.screenshot_path IS DISTINCT FROM OLD.screenshot_path THEN
      RAISE EXCEPTION 'This dispensation is linked to a transaction and cannot be edited. Reverse the transaction first.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dispensations_guard_locked ON public.upkeep_dispensations;
CREATE TRIGGER dispensations_guard_locked
  BEFORE UPDATE ON public.upkeep_dispensations
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_dispensation_locked();

-- 3c. transactions: prevent silent edits to money-relevant fields.
-- Reversals/undos still go through reverse_transaction / undo_recent_deposit
-- which INSERT a new row — they do not UPDATE the original.
CREATE OR REPLACE FUNCTION public.tg_guard_transaction_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.member_id     IS DISTINCT FROM OLD.member_id
  OR NEW.leader_id     IS DISTINCT FROM OLD.leader_id
  OR NEW.type          IS DISTINCT FROM OLD.type
  OR NEW.amount_usd    IS DISTINCT FROM OLD.amount_usd
  OR NEW.currency      IS DISTINCT FROM OLD.currency
  OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
  OR NEW.local_amount  IS DISTINCT FROM OLD.local_amount
  OR NEW.parent_txn_id IS DISTINCT FROM OLD.parent_txn_id THEN
    RAISE EXCEPTION 'Transactions are immutable. Use reverse_transaction to correct a posted entry.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS transactions_guard_immutable ON public.transactions;
CREATE TRIGGER transactions_guard_immutable
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_transaction_immutable();
