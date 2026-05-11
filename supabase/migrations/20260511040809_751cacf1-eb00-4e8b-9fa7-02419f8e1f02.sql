
-- ============ 1. PROFILES ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender public.gender_kind,
  ADD COLUMN IF NOT EXISTS sponsor_id uuid;

UPDATE public.profiles SET sponsor_id = leader_id WHERE sponsor_id IS NULL AND leader_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_sponsor ON public.profiles(sponsor_id);

-- ============ 2. TRANSACTIONS ============
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS parent_txn_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_transaction_to_balance()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  if new.type::text in ('deposit','adjustment') then
    update public.profiles set balance_usd = balance_usd + new.amount_usd where id = new.member_id;
  elsif new.type::text in ('withdrawal','release','fund_deduction','bank_fee') then
    update public.profiles set balance_usd = balance_usd - new.amount_usd where id = new.member_id;
  end if;
  return new;
end $function$;

-- ============ 3. FX RATES ============
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS fx_rates jsonb NOT NULL DEFAULT '{"USD":1,"NGN":1600,"GBP":1.27,"EUR":1.08}'::jsonb;

-- ============ 4. PYRAMID HELPERS (must come before policies that use them) ============
CREATE OR REPLACE FUNCTION public.is_descendant_of(_descendant uuid, _ancestor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT id, sponsor_id, 1 AS depth FROM public.profiles WHERE id = _descendant
    UNION ALL
    SELECT p.id, p.sponsor_id, c.depth + 1 FROM public.profiles p
      JOIN chain c ON p.id = c.sponsor_id WHERE c.depth < 50
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE sponsor_id = _ancestor);
$$;

CREATE OR REPLACE FUNCTION public.nearest_fund_handler(_start uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := _start; v_handler boolean; v_sponsor uuid; v_depth int := 0;
BEGIN
  WHILE v_id IS NOT NULL AND v_depth < 50 LOOP
    SELECT can_handle_funds, sponsor_id INTO v_handler, v_sponsor FROM public.profiles WHERE id = v_id;
    IF v_handler THEN RETURN v_id; END IF;
    v_id := v_sponsor; v_depth := v_depth + 1;
  END LOOP;
  RETURN NULL;
END $$;

-- ============ 5. OFFICE LEDGER ============
CREATE TABLE IF NOT EXISTS public.office_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('support_in','expense_out')),
  amount_ngn numeric NOT NULL CHECK (amount_ngn > 0),
  category text,
  note text,
  source_txn_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_office_ledger_leader ON public.office_ledger(leader_id, created_at DESC);
ALTER TABLE public.office_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaders manage own office ledger" ON public.office_ledger;
CREATE POLICY "leaders manage own office ledger"
  ON public.office_ledger FOR ALL TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));

DROP POLICY IF EXISTS "downline views office ledger" ON public.office_ledger;
CREATE POLICY "downline views office ledger"
  ON public.office_ledger FOR SELECT TO authenticated
  USING (public.is_descendant_of(auth.uid(), leader_id));

-- ============ 6. LEADER PURSE LEDGER ============
CREATE TABLE IF NOT EXISTS public.leader_purse_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('credit','debit')),
  amount_usd numeric NOT NULL CHECK (amount_usd > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leader_purse_leader ON public.leader_purse_ledger(leader_id, created_at DESC);
ALTER TABLE public.leader_purse_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaders manage own purse" ON public.leader_purse_ledger;
CREATE POLICY "leaders manage own purse"
  ON public.leader_purse_ledger FOR ALL TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid() AND public.has_role(auth.uid(),'leader'));

-- ============ 7. RLS — downline visibility ============
DROP POLICY IF EXISTS "downline views profiles" ON public.profiles;
CREATE POLICY "downline views profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_descendant_of(id, auth.uid()));

DROP POLICY IF EXISTS "downline views transactions" ON public.transactions;
CREATE POLICY "downline views transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.is_descendant_of(member_id, auth.uid()));

-- ============ 8. INVITE CODES — anyone can create their own ============
DROP POLICY IF EXISTS "leaders create own codes" ON public.invite_codes;
DROP POLICY IF EXISTS "anyone creates own codes" ON public.invite_codes;
CREATE POLICY "anyone creates own codes" ON public.invite_codes FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid());

-- ============ 9. handle_new_user — pyramid-aware ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  v_invite_code text := nullif(new.raw_user_meta_data->>'invite_code','');
  v_gender public.gender_kind := nullif(new.raw_user_meta_data->>'gender','')::public.gender_kind;
  v_sponsor_id uuid := null;
  v_leader_id uuid := null;
  v_role public.app_role := 'leader';
  v_invite_id uuid := null;
  v_initial_rank text := 'Director';
  v_can_handle boolean := true;
  v_invite record;
  v_sponsor_handles boolean;
begin
  if v_invite_code is not null then
    select * into v_invite from public.invite_codes
      where code = v_invite_code and used_by is null and revoked = false and expires_at > now()
      limit 1;
    if not found then raise exception 'Invalid or expired invite code'; end if;
    v_sponsor_id := v_invite.leader_id;
    select can_handle_funds into v_sponsor_handles from public.profiles where id = v_sponsor_id;
    if v_sponsor_handles then
      v_leader_id := v_sponsor_id;
    else
      v_leader_id := public.nearest_fund_handler(v_sponsor_id);
    end if;
    v_role := 'member';
    v_invite_id := v_invite.id;
    v_initial_rank := 'Member';
    v_can_handle := false;
  end if;

  insert into public.profiles (id, full_name, email, sponsor_id, leader_id, rank, can_handle_funds, gender)
    values (new.id, v_full_name, new.email, v_sponsor_id, v_leader_id, v_initial_rank, v_can_handle, v_gender);

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  if v_role = 'leader' then
    insert into public.user_roles (user_id, role) values (new.id, 'member') on conflict do nothing;
  end if;

  if v_invite_id is not null then
    update public.invite_codes set used_by = new.id, used_at = now() where id = v_invite_id;
  end if;
  return new;
end $function$;

-- ============ 10. tg_apply_per_usd_rules — also credit office_ledger ============
CREATE OR REPLACE FUNCTION public.tg_apply_per_usd_rules()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare r record; v_rate numeric; v_ded_usd numeric; v_ded_ngn numeric; v_txn_id uuid;
begin
  if new.type::text <> 'deposit' or new.leader_id is null then return new; end if;
  select usd_to_ngn into v_rate from public.app_settings where id=1;
  if v_rate is null or v_rate <= 0 then return new; end if;

  for r in select * from public.fund_rules
           where leader_id = new.leader_id and active = true and kind = 'per_usd'
  loop
    v_ded_ngn := r.amount_ngn * new.amount_usd;
    v_ded_usd := round(v_ded_ngn / v_rate, 2);
    if v_ded_usd > 0 then
      insert into public.transactions (member_id, leader_id, type, amount_usd, note, parent_txn_id)
        values (new.member_id, new.leader_id, 'fund_deduction', v_ded_usd, r.name, new.id)
        returning id into v_txn_id;
      insert into public.office_ledger (leader_id, kind, amount_ngn, category, note, source_txn_id)
        values (new.leader_id, 'support_in', round(v_ded_ngn,2), r.name, 'Auto from deposit', v_txn_id);
    end if;
  end loop;
  return new;
end $function$;
