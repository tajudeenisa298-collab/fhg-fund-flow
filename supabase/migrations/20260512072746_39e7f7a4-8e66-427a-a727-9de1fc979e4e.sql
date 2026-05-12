CREATE OR REPLACE FUNCTION public.run_due_fund_rules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  m record;
  cnt int := 0;
  v_rate numeric;
  v_ded_usd numeric;
  v_next timestamptz;
  v_txn_id uuid;
BEGIN
  SELECT usd_to_ngn INTO v_rate FROM public.app_settings WHERE id = 1;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1600; END IF;

  FOR r IN SELECT * FROM public.fund_rules
           WHERE active = true
             AND kind = 'fixed'
             AND frequency IS NOT NULL
             AND next_run_at IS NOT NULL
             AND next_run_at <= now()
           FOR UPDATE SKIP LOCKED
  LOOP
    v_ded_usd := round(r.amount_ngn / v_rate, 2);
    FOR m IN SELECT id FROM public.profiles
             WHERE leader_id = r.leader_id
               AND can_handle_funds = false
               AND (r.target_rank IS NULL OR rank = r.target_rank)
    LOOP
      IF r.destination = 'member_upkeep' THEN
        INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
        VALUES (m.id, r.leader_id, 'deposit', v_ded_usd, 'NGN', v_rate, r.amount_ngn,
                coalesce(r.name, 'Rank upkeep') || CASE WHEN r.target_rank IS NOT NULL THEN ' · ' || r.target_rank ELSE '' END);
      ELSE
        INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
        VALUES (m.id, r.leader_id, 'fund_deduction', v_ded_usd, 'NGN', v_rate, r.amount_ngn, r.name)
        RETURNING id INTO v_txn_id;

        IF r.destination = 'team_leader' THEN
          INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
          VALUES (r.leader_id, 'credit', v_ded_usd, r.name || ' scheduled fund rule');
        ELSE
          INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note, source_txn_id)
          VALUES (r.leader_id, 'support_in', r.amount_ngn, r.name,
                  CASE WHEN r.destination = 'custom' THEN 'Custom scheduled fund rule' ELSE 'Office support scheduled fund rule' END,
                  v_txn_id);
        END IF;
      END IF;
      cnt := cnt + 1;
    END LOOP;

    v_next := CASE r.frequency
      WHEN 'weekly' THEN r.next_run_at + interval '7 days'
      WHEN 'biweekly' THEN r.next_run_at + interval '14 days'
      WHEN 'monthly' THEN r.next_run_at + interval '1 month'
      WHEN 'custom_days' THEN r.next_run_at + (coalesce(r.custom_days, 7) || ' days')::interval
      WHEN 'one_time' THEN null
    END;

    UPDATE public.fund_rules
    SET next_run_at = v_next,
        active = CASE WHEN r.frequency = 'one_time' THEN false ELSE active END
    WHERE id = r.id;
  END LOOP;
  RETURN cnt;
END;
$$;