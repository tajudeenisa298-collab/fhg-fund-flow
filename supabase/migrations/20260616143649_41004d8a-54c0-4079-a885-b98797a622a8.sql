
-- 1) Snapshot exchange rate on withdrawal requests at submission time
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS snapshot_currency text,
  ADD COLUMN IF NOT EXISTS snapshot_rate numeric,
  ADD COLUMN IF NOT EXISTS snapshot_local_amount numeric;

CREATE OR REPLACE FUNCTION public.tg_withdrawal_request_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_rate numeric;
BEGIN
  IF NEW.snapshot_rate IS NULL THEN
    SELECT usd_to_ngn INTO v_rate FROM public.app_settings WHERE id = 1;
    NEW.snapshot_rate := coalesce(v_rate, 1600);
  END IF;
  IF NEW.snapshot_currency IS NULL OR NEW.snapshot_currency = '' THEN
    NEW.snapshot_currency := 'NGN';
  END IF;
  IF NEW.snapshot_local_amount IS NULL THEN
    NEW.snapshot_local_amount := round(NEW.amount_usd * NEW.snapshot_rate, 2);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS withdrawal_request_snapshot ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_request_snapshot
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_withdrawal_request_snapshot();

-- Backfill existing rows
UPDATE public.withdrawal_requests
SET snapshot_rate = coalesce((SELECT usd_to_ngn FROM public.app_settings WHERE id = 1), 1600),
    snapshot_currency = 'NGN'
WHERE snapshot_rate IS NULL;

UPDATE public.withdrawal_requests
SET snapshot_local_amount = round(amount_usd * snapshot_rate, 2)
WHERE snapshot_local_amount IS NULL;


-- 2) resolve_withdrawal_request: lock profile row + use snapshot rate as default
CREATE OR REPLACE FUNCTION public.resolve_withdrawal_request(_id uuid, _status text, _note text DEFAULT NULL::text, _currency text DEFAULT NULL::text, _exchange_rate numeric DEFAULT NULL::numeric, _local_amount numeric DEFAULT NULL::numeric, _platform_fee_usd numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SET status = _status::withdrawal_status,
        leader_note = _note,
        resolved_at = now()
    WHERE id = _id;

  IF _status = 'approved' THEN
    -- Lock the member's profile so concurrent approvals can't double-spend.
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
END;
$function$;


-- 3) reverse_transaction — leader-only paired correcting entry
CREATE OR REPLACE FUNCTION public.reverse_transaction(_txn_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t record;
  v_new uuid;
  v_reverse_type public.txn_type;
  v_already uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT * INTO v_t FROM public.transactions WHERE id = _txn_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_t.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your transaction'; END IF;

  IF v_t.type::text NOT IN ('deposit','fund_deduction','bank_fee') THEN
    RAISE EXCEPTION 'This transaction type cannot be reversed';
  END IF;

  -- Prevent double reversal
  SELECT id INTO v_already FROM public.transactions
    WHERE parent_txn_id = _txn_id AND note LIKE 'Reversal of%' LIMIT 1;
  IF v_already IS NOT NULL THEN
    RAISE EXCEPTION 'Already reversed';
  END IF;

  v_reverse_type := CASE v_t.type::text
    WHEN 'deposit' THEN 'fund_deduction'
    WHEN 'fund_deduction' THEN 'deposit'
    WHEN 'bank_fee' THEN 'deposit'
  END::public.txn_type;

  -- Lock member balance row
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

  -- If the original credited the leader's purse, debit it back
  IF v_t.type::text = 'fund_deduction' THEN
    -- Best-effort offset: insert a matching debit if the leader has enough balance
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

  RETURN v_new;
END $$;

REVOKE EXECUTE ON FUNCTION public.reverse_transaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid, text) TO authenticated;


-- 4) Monthly reconciliation summary for a leader
CREATE OR REPLACE FUNCTION public.get_leader_monthly_reconciliation(_month_start date)
RETURNS TABLE(
  deposits_usd numeric,
  withdrawals_usd numeric,
  fund_deductions_usd numeric,
  bank_fees_usd numeric,
  adjustments_usd numeric,
  releases_usd numeric,
  upkeep_acknowledged_usd numeric,
  upkeep_pending_usd numeric,
  upkeep_disputed_usd numeric,
  office_support_in_ngn numeric,
  office_expense_out_ngn numeric,
  purse_credits_usd numeric,
  purse_debits_usd numeric,
  team_balance_usd numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz := date_trunc('month', _month_start)::timestamptz;
  v_end   timestamptz := (date_trunc('month', _month_start) + interval '1 month')::timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;

  RETURN QUERY
  SELECT
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'deposit' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'withdrawal' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'fund_deduction' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'bank_fee' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'adjustment' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.transactions WHERE leader_id = auth.uid() AND type = 'release' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.upkeep_dispensations WHERE leader_id = auth.uid() AND status = 'acknowledged' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.upkeep_dispensations WHERE leader_id = auth.uid() AND status = 'pending' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.upkeep_dispensations WHERE leader_id = auth.uid() AND status = 'disputed' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_ngn) FROM public.office_ledger WHERE leader_id = auth.uid() AND kind = 'support_in' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_ngn) FROM public.office_ledger WHERE leader_id = auth.uid() AND kind = 'expense_out' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.leader_purse_ledger WHERE leader_id = auth.uid() AND kind = 'credit' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(amount_usd) FROM public.leader_purse_ledger WHERE leader_id = auth.uid() AND kind = 'debit' AND created_at >= v_start AND created_at < v_end), 0),
    coalesce((SELECT sum(balance_usd) FROM public.profiles WHERE leader_id = auth.uid()), 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_leader_monthly_reconciliation(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leader_monthly_reconciliation(date) TO authenticated;
