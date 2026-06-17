
ALTER TABLE public.pv_logs
  ADD COLUMN IF NOT EXISTS price_usd numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_ngn numeric(14,2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14,4),
  ADD COLUMN IF NOT EXISTS txn_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Members may no longer insert/update/delete their own PV — only the team leader can.
-- Existing policies already do that: `pv_logs_leader_manage` (ALL for leader) and SELECT-only for member/upline.
-- No policy changes needed.

-- RPC: leader logs PV + price; deducts price from member balance in one shot
CREATE OR REPLACE FUNCTION public.log_pv_with_deduction(
  _member_id uuid,
  _period_month date,
  _pv numeric,
  _price_usd numeric DEFAULT 0,
  _price_ngn numeric DEFAULT NULL,
  _exchange_rate numeric DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member record;
  v_rate numeric;
  v_local numeric;
  v_txn_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF _pv IS NULL OR _pv < 0 OR _pv > 1000000 THEN
    RAISE EXCEPTION 'Invalid PV value';
  END IF;
  IF _price_usd IS NULL OR _price_usd < 0 OR _price_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  SELECT id, leader_id, balance_usd, can_handle_funds, full_name
    INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;

  v_rate := coalesce(_exchange_rate, (SELECT usd_to_ngn FROM public.app_settings WHERE id = 1), 1600);
  v_local := coalesce(_price_ngn, round(_price_usd * v_rate, 2));

  IF _price_usd > 0 THEN
    IF _price_usd > v_member.balance_usd THEN
      RAISE EXCEPTION 'Price exceeds member balance ($%)', v_member.balance_usd;
    END IF;
    INSERT INTO public.transactions
      (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
    VALUES
      (_member_id, auth.uid(), 'fund_deduction', _price_usd,
       'NGN', v_rate, v_local,
       coalesce(_note, 'NeoLife PV purchase') || ' · ' || _pv::text || ' PV')
    RETURNING id INTO v_txn_id;
  END IF;

  INSERT INTO public.pv_logs (member_id, period_month, pv, note, price_usd, price_ngn, exchange_rate, txn_id)
  VALUES (_member_id, date_trunc('month', _period_month)::date, _pv,
          _note, _price_usd, v_local, v_rate, v_txn_id)
  ON CONFLICT (member_id, period_month) DO UPDATE
    SET pv = EXCLUDED.pv,
        note = EXCLUDED.note,
        -- never overwrite an existing deduction; price is locked to original txn
        price_usd = CASE WHEN public.pv_logs.txn_id IS NULL THEN EXCLUDED.price_usd ELSE public.pv_logs.price_usd END,
        price_ngn = CASE WHEN public.pv_logs.txn_id IS NULL THEN EXCLUDED.price_ngn ELSE public.pv_logs.price_ngn END,
        exchange_rate = CASE WHEN public.pv_logs.txn_id IS NULL THEN EXCLUDED.exchange_rate ELSE public.pv_logs.exchange_rate END,
        txn_id = coalesce(public.pv_logs.txn_id, EXCLUDED.txn_id),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_pv_with_deduction(uuid, date, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_pv_with_deduction(uuid, date, numeric, numeric, numeric, numeric, text) TO authenticated;
