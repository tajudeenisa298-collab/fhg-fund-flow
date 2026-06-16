
-- ============================================================
-- 1. Audit log table
-- ============================================================
CREATE TABLE public.admin_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_actor_idx  ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON public.admin_audit_log (target_user_id, created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL    ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Actor and target can read their own audit rows; no insert/update/delete from clients.
CREATE POLICY "Audit visible to actor or target"
  ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = actor_id OR auth.uid() = target_user_id);

-- Block any update/delete from non-superuser roles
CREATE OR REPLACE FUNCTION public.tg_admin_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END $$;
CREATE TRIGGER admin_audit_log_no_update BEFORE UPDATE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_audit_immutable();
CREATE TRIGGER admin_audit_log_no_delete BEFORE DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_admin_audit_immutable();

-- Helper to write rows (SECURITY DEFINER so SECURITY DEFINER RPCs can call it)
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action TEXT, _target_user_id UUID, _target_id UUID, _details JSONB
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, target_id, details)
  VALUES (auth.uid(), _action, _target_user_id, _target_id, COALESCE(_details, '{}'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, UUID, JSONB) TO service_role;

-- ============================================================
-- 2. Instrument existing RPCs with audit logging
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_member(
  _member_id uuid, _new_rank text, _grant_fund_handler boolean DEFAULT false, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member record;
  v_director_ranks text[] := array['Director','Emerald Director','Sapphire Director',
    '1 Ruby Director','2 Ruby Director','3 Ruby Director','4 Ruby Director','5 Ruby Director',
    '1 Diamond Director','2 Diamond Director','3 Diamond Director','4 Diamond Director','5 Diamond Director'];
  v_is_director boolean;
  v_new_handler boolean;
  v_old_rank text;
BEGIN
  SELECT * INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id IS NULL OR v_member.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the member''s current team leader can promote them';
  END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Only team leaders can promote members';
  END IF;
  IF NOT public.is_valid_rank(_new_rank) THEN
    RAISE EXCEPTION 'Invalid rank: %', _new_rank;
  END IF;

  v_old_rank := v_member.rank;
  v_is_director := _new_rank = ANY(v_director_ranks);
  v_new_handler := v_is_director OR _grant_fund_handler;

  UPDATE public.profiles
  SET rank = _new_rank,
      can_handle_funds = CASE WHEN v_new_handler THEN true ELSE can_handle_funds END,
      leader_id = CASE WHEN v_new_handler THEN id ELSE leader_id END
  WHERE id = _member_id;

  IF v_new_handler THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_member_id, 'leader')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  PERFORM public.notify_user(_member_id, 'Rank updated', 'Your rank is now ' || _new_rank, 'generic', '/dashboard');

  PERFORM public.log_admin_action('promote_member', _member_id, NULL,
    jsonb_build_object('old_rank', v_old_rank, 'new_rank', _new_rank,
                       'granted_fund_handler', v_new_handler, 'note', _note));
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_member_to_leader(_member_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member record;
BEGIN
  SELECT * INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id IS NULL OR v_member.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the member''s current leader can promote them';
  END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Only leaders can promote members';
  END IF;

  IF v_member.balance_usd > 0 THEN
    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
    VALUES (_member_id, auth.uid(), 'release', v_member.balance_usd,
            coalesce(_note, 'Funds released on promotion to Team Leader'));
  END IF;

  UPDATE public.profiles SET rank = 'Director', leader_id = NULL WHERE id = _member_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (_member_id, 'leader')
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.log_admin_action('promote_member_to_leader', _member_id, NULL,
    jsonb_build_object('released_balance_usd', v_member.balance_usd, 'note', _note));
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_withdrawal_request(
  _id uuid, _status text, _note text DEFAULT NULL, _currency text DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL, _local_amount numeric DEFAULT NULL,
  _platform_fee_usd numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req record;
  v_member_balance numeric;
  v_fee numeric := COALESCE(_platform_fee_usd, 0);
  v_currency text;
  v_rate numeric;
  v_local numeric;
BEGIN
  IF _status NOT IN ('approved','declined') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF v_fee < 0 THEN RAISE EXCEPTION 'Fee cannot be negative'; END IF;
  IF v_fee >= v_req.amount_usd THEN RAISE EXCEPTION 'Fee must be less than the withdrawal amount'; END IF;

  v_currency := COALESCE(_currency, v_req.snapshot_currency, 'NGN');
  v_rate     := COALESCE(_exchange_rate, v_req.snapshot_rate);
  v_local    := COALESCE(_local_amount, CASE WHEN v_rate IS NOT NULL THEN round(v_req.amount_usd * v_rate, 2) ELSE NULL END);

  UPDATE public.withdrawal_requests
    SET status = _status::withdrawal_status, leader_note = _note, resolved_at = now()
    WHERE id = _id;

  IF _status = 'approved' THEN
    SELECT balance_usd INTO v_member_balance
      FROM public.profiles WHERE id = v_req.member_id FOR UPDATE;
    IF v_member_balance < v_req.amount_usd THEN
      RAISE EXCEPTION 'Member balance insufficient';
    END IF;

    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, request_id)
    VALUES (v_req.member_id, v_req.leader_id, 'withdrawal', v_req.amount_usd,
            v_currency, v_rate, v_local, _note, _id);

    IF v_fee > 0 THEN
      INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, note)
      VALUES (v_req.member_id, v_req.leader_id, 'bank_fee', v_fee, 'USD',
              'Platform fee on withdrawal of $' || v_req.amount_usd);
    END IF;
  END IF;

  PERFORM public.log_admin_action('resolve_withdrawal_request', v_req.member_id, _id,
    jsonb_build_object('status', _status, 'amount_usd', v_req.amount_usd,
                       'currency', v_currency, 'rate', v_rate, 'local_amount', v_local,
                       'platform_fee_usd', v_fee, 'note', _note));
END;
$$;

CREATE OR REPLACE FUNCTION public.leader_purse_withdraw(_amount_usd numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric; v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT coalesce(sum(CASE WHEN kind='credit' THEN amount_usd ELSE -amount_usd END), 0)
    INTO v_balance FROM public.leader_purse_ledger WHERE leader_id = auth.uid();

  IF _amount_usd > v_balance THEN RAISE EXCEPTION 'Insufficient purse balance'; END IF;

  INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
  VALUES (auth.uid(), 'debit', _amount_usd, _note)
  RETURNING id INTO v_id;

  PERFORM public.log_admin_action('leader_purse_withdraw', auth.uid(), v_id,
    jsonb_build_object('amount_usd', _amount_usd, 'note', _note));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_transaction(_txn_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t record; v_new uuid; v_reverse_type public.txn_type; v_already uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT * INTO v_t FROM public.transactions WHERE id = _txn_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_t.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your transaction'; END IF;
  IF v_t.type::text NOT IN ('deposit','fund_deduction','bank_fee') THEN
    RAISE EXCEPTION 'This transaction type cannot be reversed';
  END IF;

  SELECT id INTO v_already FROM public.transactions
    WHERE parent_txn_id = _txn_id AND note LIKE 'Reversal of%' LIMIT 1;
  IF v_already IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;

  v_reverse_type := CASE v_t.type::text
    WHEN 'deposit' THEN 'fund_deduction'
    WHEN 'fund_deduction' THEN 'deposit'
    WHEN 'bank_fee' THEN 'deposit'
  END::public.txn_type;

  PERFORM 1 FROM public.profiles WHERE id = v_t.member_id FOR UPDATE;

  INSERT INTO public.transactions
    (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, parent_txn_id)
  VALUES
    (v_t.member_id, v_t.leader_id, v_reverse_type, v_t.amount_usd,
     v_t.currency, v_t.exchange_rate, v_t.local_amount,
     'Reversal of ' || coalesce(v_t.note, v_t.type::text)
       || coalesce(' — ' || nullif(trim(coalesce(_reason,'')),''), ''),
     _txn_id)
  RETURNING id INTO v_new;

  IF v_t.type::text = 'fund_deduction' THEN
    INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
    SELECT v_t.leader_id, 'debit', v_t.amount_usd,
           'Reversal of fund deduction txn ' || _txn_id
    WHERE EXISTS (
      SELECT 1 FROM public.leader_purse_ledger
      WHERE leader_id = v_t.leader_id AND note LIKE '%' || _txn_id::text || '%'
    );
  END IF;

  PERFORM public.notify_user(v_t.member_id, 'Transaction reversed',
    'A ' || v_t.type::text || ' of $' || v_t.amount_usd || ' was reversed by your leader.',
    'generic', '/dashboard');

  PERFORM public.log_admin_action('reverse_transaction', v_t.member_id, _txn_id,
    jsonb_build_object('amount_usd', v_t.amount_usd, 'original_type', v_t.type::text,
                       'reverse_type', v_reverse_type::text, 'reason', _reason,
                       'reversal_txn_id', v_new));

  RETURN v_new;
END $$;

-- New: thin RPC for recording an office expense WITH audit
CREATE OR REPLACE FUNCTION public.record_office_expense(
  _amount_ngn numeric, _category text, _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _amount_ngn IS NULL OR _amount_ngn <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _category IS NULL OR length(trim(_category)) = 0 THEN RAISE EXCEPTION 'Category required'; END IF;

  INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note)
  VALUES (auth.uid(), 'expense_out', _amount_ngn, trim(_category), _note)
  RETURNING id INTO v_id;

  PERFORM public.log_admin_action('record_office_expense', auth.uid(), v_id,
    jsonb_build_object('amount_ngn', _amount_ngn, 'category', _category, 'note', _note));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_office_expense(numeric, text, text) TO authenticated;

-- ============================================================
-- 3. Retention policy: anonymize finalized members after 2 years
-- ============================================================
CREATE OR REPLACE FUNCTION public.anonymize_finalized_members()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE finalized_at IS NOT NULL
      AND finalized_at < now() - interval '2 years'
      AND (full_name <> 'Former member' OR email IS NOT NULL OR whatsapp_number IS NOT NULL OR avatar_url IS NOT NULL)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.profiles
      SET full_name = 'Former member',
          email = NULL,
          whatsapp_number = NULL,
          avatar_url = NULL,
          suspended_reason = NULL,
          terminated_reason = NULL
      WHERE id = r.id;
    DELETE FROM public.bank_accounts WHERE user_id = r.id;
    DELETE FROM public.login_devices WHERE user_id = r.id;
    DELETE FROM public.notifications WHERE user_id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.anonymize_finalized_members() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.anonymize_finalized_members() TO service_role;

-- Schedule daily at 03:15 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('anonymize-finalized-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'anonymize-finalized-daily',
  '15 3 * * *',
  $$ SELECT public.anonymize_finalized_members(); $$
);
