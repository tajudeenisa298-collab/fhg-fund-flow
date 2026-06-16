CREATE OR REPLACE FUNCTION public.create_managed_transaction(_member_id uuid, _type text, _amount_usd numeric, _note text DEFAULT NULL::text, _currency text DEFAULT 'USD'::text, _exchange_rate numeric DEFAULT NULL::numeric, _local_amount numeric DEFAULT NULL::numeric, _parent_txn_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  VALUES (_member_id, auth.uid(), _type::public.txn_type, _amount_usd,
          coalesce(_currency,'USD'), _exchange_rate, _local_amount, _note, _parent_txn_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;