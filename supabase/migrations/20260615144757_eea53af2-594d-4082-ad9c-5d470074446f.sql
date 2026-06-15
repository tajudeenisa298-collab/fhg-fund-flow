
-- 1) Withdrawal requests: drop broad UPDATE policy, add controlled RPC
DROP POLICY IF EXISTS "leaders update team requests" ON public.withdrawal_requests;

CREATE OR REPLACE FUNCTION public.resolve_withdrawal_request(
  _id uuid,
  _status text,
  _note text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL,
  _local_amount numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_member_balance numeric;
BEGIN
  IF _status NOT IN ('approved','declined') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;

  UPDATE public.withdrawal_requests
    SET status = _status::withdrawal_status,
        leader_note = _note,
        resolved_at = now()
    WHERE id = _id;

  IF _status = 'approved' THEN
    SELECT balance_usd INTO v_member_balance FROM public.profiles WHERE id = v_req.member_id;
    IF v_member_balance < v_req.amount_usd THEN
      RAISE EXCEPTION 'Member balance insufficient';
    END IF;
    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, request_id)
    VALUES (v_req.member_id, v_req.leader_id, 'withdrawal', v_req.amount_usd,
            coalesce(_currency,'NGN'), _exchange_rate, _local_amount, _note, _id);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_withdrawal_request(uuid,text,text,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal_request(uuid,text,text,text,numeric,numeric) TO authenticated;

-- 2) Office ledger: restrict to SELECT, route inserts through RPC
DROP POLICY IF EXISTS "leaders manage own office ledger" ON public.office_ledger;
CREATE POLICY "leaders read own office ledger"
  ON public.office_ledger FOR SELECT
  USING (leader_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_office_expense(
  _amount_ngn numeric,
  _category text,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _amount_ngn IS NULL OR _amount_ngn <= 0 OR _amount_ngn > 1000000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF _category IS NULL OR length(trim(_category)) = 0 THEN
    RAISE EXCEPTION 'Category required';
  END IF;
  INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note)
  VALUES (auth.uid(), 'expense_out', _amount_ngn, trim(_category), _note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_office_expense(numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_office_expense(numeric,text,text) TO authenticated;

-- 3) Transactions: drop direct INSERT, controlled RPC
DROP POLICY IF EXISTS "fund handlers create managed transactions" ON public.transactions;

CREATE OR REPLACE FUNCTION public.create_managed_transaction(
  _member_id uuid,
  _type text,
  _amount_usd numeric,
  _note text DEFAULT NULL,
  _currency text DEFAULT 'USD',
  _exchange_rate numeric DEFAULT NULL,
  _local_amount numeric DEFAULT NULL,
  _parent_txn_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_member record;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _type NOT IN ('deposit','fund_deduction','bank_fee','adjustment') THEN
    RAISE EXCEPTION 'Type not allowed via this RPC';
  END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, leader_id, balance_usd, can_handle_funds INTO v_member
  FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;
  IF _type IN ('fund_deduction','bank_fee') AND _amount_usd > v_member.balance_usd THEN
    RAISE EXCEPTION 'Amount exceeds member balance';
  END IF;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, parent_txn_id)
  VALUES (_member_id, auth.uid(), _type::transaction_type, _amount_usd,
          coalesce(_currency,'USD'), _exchange_rate, _local_amount, _note, _parent_txn_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_managed_transaction(uuid,text,numeric,text,text,numeric,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_managed_transaction(uuid,text,numeric,text,text,numeric,numeric,uuid) TO authenticated;

-- 4) Leader purse: drop direct INSERT, controlled RPC with balance check
DROP POLICY IF EXISTS "leaders withdraw own purse" ON public.leader_purse_ledger;

CREATE OR REPLACE FUNCTION public.leader_purse_withdraw(
  _amount_usd numeric,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT coalesce(sum(CASE WHEN kind='credit' THEN amount_usd ELSE -amount_usd END), 0)
    INTO v_balance
  FROM public.leader_purse_ledger
  WHERE leader_id = auth.uid();

  IF _amount_usd > v_balance THEN
    RAISE EXCEPTION 'Insufficient purse balance';
  END IF;

  INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
  VALUES (auth.uid(), 'debit', _amount_usd, _note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leader_purse_withdraw(numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leader_purse_withdraw(numeric,text) TO authenticated;
