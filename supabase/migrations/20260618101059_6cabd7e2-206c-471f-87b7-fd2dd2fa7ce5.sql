-- 1) Invite codes: hide raw used_by UUID, expose only a boolean.
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS is_used boolean
  GENERATED ALWAYS AS (used_by IS NOT NULL) STORED;

REVOKE SELECT (used_by, used_at) ON public.invite_codes FROM authenticated;
GRANT SELECT (id, code, leader_id, expires_at, revoked, created_at, is_used)
  ON public.invite_codes TO authenticated;

-- 2) Snapshot trigger: require an exchange rate; do not silently fall back to 1600.
CREATE OR REPLACE FUNCTION public.tg_snapshot_txn_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare v_rate numeric;
begin
  if new.exchange_rate is null then
    select usd_to_ngn into v_rate from public.app_settings where id = 1;
    if v_rate is null or v_rate <= 0 then
      raise exception 'USD↔NGN exchange rate is not configured. An admin must set app_settings.usd_to_ngn before any transaction can be recorded.'
        using errcode = '22023';
    end if;
    new.exchange_rate := v_rate;
  end if;
  if new.local_amount is null then
    new.local_amount := round(new.amount_usd * new.exchange_rate, 2);
  end if;
  if new.currency is null or new.currency = '' then
    new.currency := 'NGN';
  end if;
  return new;
end $$;

-- 3) Scheduled fund rules: same — raise instead of falling back to 1600.
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
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'USD↔NGN exchange rate is not configured. Scheduled fund rules cannot run until an admin sets app_settings.usd_to_ngn.'
      USING errcode = '22023';
  END IF;

  FOR r IN SELECT * FROM public.fund_rules
           WHERE active = true
             AND kind = 'fixed'
             AND frequency IS NOT NULL
             AND next_run_at IS NOT NULL
             AND next_run_at <= now()
           FOR UPDATE SKIP LOCKED
  LOOP
    v_ded_usd := round(r.amount_ngn / v_rate, 2);

    FOR m IN
      SELECT id FROM public.profiles
       WHERE leader_id = r.leader_id
         AND can_handle_funds = false
         AND (r.target_rank IS NULL OR rank = r.target_rank)
         AND (
           r.member_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.fund_rules o
             WHERE o.leader_id = r.leader_id AND o.active AND o.kind = 'fixed'
               AND o.member_id = public.profiles.id
               AND lower(o.name) = lower(r.name)
           )
           OR r.member_id = public.profiles.id
         )
    LOOP
      IF r.destination = 'member_upkeep' THEN
        INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note)
        VALUES (m.id, r.leader_id, 'deposit', v_ded_usd, 'NGN', v_rate, r.amount_ngn,
                coalesce(r.name, 'Rank upkeep'));
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

-- 4) Race-safe balance updates: lock the member row before mutating.
CREATE OR REPLACE FUNCTION public.apply_transaction_to_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_new_balance numeric;
begin
  -- Lock the profile row so concurrent deposit + fund_deduction can't race.
  PERFORM 1 FROM public.profiles WHERE id = new.member_id FOR UPDATE;

  if new.type::text in ('deposit','adjustment') then
    update public.profiles set balance_usd = balance_usd + new.amount_usd where id = new.member_id;
  elsif new.type::text in ('withdrawal','release','fund_deduction','bank_fee') then
    update public.profiles
       set balance_usd = balance_usd - new.amount_usd
     where id = new.member_id
    returning balance_usd into v_new_balance;
    if v_new_balance < 0 then
      raise exception 'Insufficient member balance for % of $% (would go to $%). Reverse or reduce the charge.',
        new.type, new.amount_usd, v_new_balance
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- 5) As-of balance reconstruction for disputes and historical statements.
CREATE OR REPLACE FUNCTION public.get_balance_as_of(_member_id uuid, _as_of timestamptz)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_total numeric;
BEGIN
  -- Authorization: member can call for themselves; a leader can call for any member
  -- that is in their downline (sponsor chain) or that they directly manage.
  IF _member_id <> auth.uid()
     AND NOT (public.has_role(auth.uid(), 'leader')
              AND (EXISTS (SELECT 1 FROM public.profiles
                            WHERE id = _member_id AND leader_id = auth.uid())
                   OR public.is_descendant_of(_member_id, auth.uid())))
  THEN
    RAISE EXCEPTION 'Not authorised to view this member''s historical balance';
  END IF;

  SELECT coalesce(sum(
           CASE WHEN type::text IN ('deposit','adjustment') THEN amount_usd
                WHEN type::text IN ('withdrawal','release','fund_deduction','bank_fee') THEN -amount_usd
                ELSE 0 END
         ), 0)
    INTO v_total
  FROM public.transactions
  WHERE member_id = _member_id
    AND created_at <= _as_of;

  RETURN v_total;
END $$;

GRANT EXECUTE ON FUNCTION public.get_balance_as_of(uuid, timestamptz) TO authenticated;
