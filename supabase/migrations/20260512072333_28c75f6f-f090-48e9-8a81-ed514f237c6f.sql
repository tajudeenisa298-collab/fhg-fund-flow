-- Referral hierarchy, signup hook, notifications, and fund-rule destinations

-- 1) Extend fund rules for destinations and optional rank-based upkeep.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fund_destination') THEN
    CREATE TYPE public.fund_destination AS ENUM ('office_support', 'team_leader', 'custom');
  END IF;
END $$;

ALTER TABLE public.fund_rules
  ADD COLUMN IF NOT EXISTS destination public.fund_destination NOT NULL DEFAULT 'office_support',
  ADD COLUMN IF NOT EXISTS target_rank text NULL;

CREATE INDEX IF NOT EXISTS idx_fund_rules_leader_destination ON public.fund_rules(leader_id, destination);
CREATE INDEX IF NOT EXISTS idx_fund_rules_rank_upkeep ON public.fund_rules(leader_id, target_rank) WHERE target_rank IS NOT NULL;

-- 2) Keep rank validation reusable and apply it to fund-rule target ranks.
CREATE OR REPLACE FUNCTION public.is_valid_rank(_rank text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _rank IN (
    'Member','Distributor','Manager','Senior Manager','Executive Manager',
    'Director','Emerald Director','Sapphire Director',
    '1 Ruby Director','2 Ruby Director','3 Ruby Director','4 Ruby Director','5 Ruby Director',
    '1 Diamond Director','2 Diamond Director','3 Diamond Director','4 Diamond Director','5 Diamond Director'
  );
$$;

CREATE OR REPLACE FUNCTION public.validate_profile_rank()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_valid_rank(NEW.rank) THEN
    RAISE EXCEPTION 'Invalid rank: %', NEW.rank;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fund_rule_target_rank()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.target_rank IS NOT NULL AND NOT public.is_valid_rank(NEW.target_rank) THEN
    RAISE EXCEPTION 'Invalid target rank: %', NEW.target_rank;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fund_rules_validate_target_rank ON public.fund_rules;
CREATE TRIGGER fund_rules_validate_target_rank
  BEFORE INSERT OR UPDATE OF target_rank ON public.fund_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_fund_rule_target_rank();

-- 3) Restore/ensure key triggers exist.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS transactions_snapshot_rate ON public.transactions;
CREATE TRIGGER transactions_snapshot_rate
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_snapshot_txn_rate();

DROP TRIGGER IF EXISTS transactions_apply_balance ON public.transactions;
CREATE TRIGGER transactions_apply_balance
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_to_balance();

DROP TRIGGER IF EXISTS transactions_apply_per_usd_rules ON public.transactions;
CREATE TRIGGER transactions_apply_per_usd_rules
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_apply_per_usd_rules();

DROP TRIGGER IF EXISTS transactions_notify_insert ON public.transactions;
CREATE TRIGGER transactions_notify_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_txn_insert();

DROP TRIGGER IF EXISTS withdrawal_requests_notify_insert ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_notify_insert
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_request_insert();

DROP TRIGGER IF EXISTS withdrawal_requests_notify_resolved ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_notify_resolved
  AFTER UPDATE OF status ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_request_resolved();

DROP TRIGGER IF EXISTS bank_accounts_notify_change ON public.bank_accounts;
CREATE TRIGGER bank_accounts_notify_change
  AFTER INSERT OR UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_bank_change();

DROP TRIGGER IF EXISTS fund_rules_touch_updated_at ON public.fund_rules;
CREATE TRIGGER fund_rules_touch_updated_at
  BEFORE UPDATE ON public.fund_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Invite validation now returns the direct sponsor, not necessarily a leader.
CREATE OR REPLACE FUNCTION public.validate_invite_code(_code text)
RETURNS TABLE(leader_id uuid, leader_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ic.leader_id, p.full_name
  FROM public.invite_codes ic
  JOIN public.profiles p ON p.id = ic.leader_id
  WHERE ic.code = upper(trim(_code))
    AND ic.used_by IS NULL
    AND ic.revoked = false
    AND ic.expires_at > now()
  LIMIT 1;
$$;

-- 5) Full downline helper for UI queries.
CREATE OR REPLACE FUNCTION public.get_downline(_root uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  leader_id uuid,
  sponsor_id uuid,
  rank text,
  balance_usd numeric,
  can_handle_funds boolean,
  gender public.gender_kind,
  created_at timestamptz,
  updated_at timestamptz,
  depth integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE tree AS (
    SELECT p.*, 1 AS depth
    FROM public.profiles p
    WHERE p.sponsor_id = _root
    UNION ALL
    SELECT p.*, tree.depth + 1
    FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
    WHERE tree.depth < 50
  )
  SELECT tree.id, tree.full_name, tree.email, tree.leader_id, tree.sponsor_id, tree.rank,
         tree.balance_usd, tree.can_handle_funds, tree.gender, tree.created_at, tree.updated_at, tree.depth
  FROM tree
  WHERE _root = auth.uid() OR public.has_role(auth.uid(), 'leader') OR public.is_descendant_of(tree.id, auth.uid());
$$;

-- 6) Signup must use an active invite code unless this is the first/root account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
  v_invite_code text := nullif(upper(trim(new.raw_user_meta_data->>'invite_code')), '');
  v_gender public.gender_kind := nullif(new.raw_user_meta_data->>'gender','')::public.gender_kind;
  v_sponsor_id uuid := null;
  v_leader_id uuid := null;
  v_role public.app_role := 'leader';
  v_invite_id uuid := null;
  v_initial_rank text := 'Director';
  v_can_handle boolean := true;
  v_invite record;
  v_sponsor_handles boolean := false;
  v_has_profiles boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) INTO v_has_profiles;

  IF v_invite_code IS NULL AND v_has_profiles THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  IF v_invite_code IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.invite_codes
    WHERE code = v_invite_code
      AND used_by IS NULL
      AND revoked = false
      AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    v_sponsor_id := v_invite.leader_id;
    SELECT can_handle_funds INTO v_sponsor_handles FROM public.profiles WHERE id = v_sponsor_id;

    IF v_sponsor_handles THEN
      v_leader_id := v_sponsor_id;
    ELSE
      v_leader_id := public.nearest_fund_handler(v_sponsor_id);
    END IF;

    v_role := 'member';
    v_invite_id := v_invite.id;
    v_initial_rank := 'Member';
    v_can_handle := false;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, sponsor_id, leader_id, rank, can_handle_funds, gender)
  VALUES (new.id, v_full_name, new.email, v_sponsor_id, v_leader_id, v_initial_rank, v_can_handle, v_gender);

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'member') ON CONFLICT DO NOTHING;

  IF v_invite_id IS NOT NULL THEN
    UPDATE public.invite_codes SET used_by = new.id, used_at = now() WHERE id = v_invite_id;

    PERFORM public.notify_user(
      v_sponsor_id,
      'New sponsored member',
      v_full_name || ' joined your team',
      'generic',
      '/dashboard'
    );

    IF v_leader_id IS NOT NULL AND v_leader_id <> v_sponsor_id THEN
      PERFORM public.notify_user(
        v_leader_id,
        'New member to manage',
        v_full_name || ' joined under your fund management',
        'generic',
        '/dashboard'
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- 7) Promotions keep sponsorship hierarchy but change who can handle funds.
CREATE OR REPLACE FUNCTION public.promote_member(_member_id uuid, _new_rank text, _grant_fund_handler boolean DEFAULT false, _note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member record;
  v_director_ranks text[] := array['Director','Emerald Director','Sapphire Director',
    '1 Ruby Director','2 Ruby Director','3 Ruby Director','4 Ruby Director','5 Ruby Director',
    '1 Diamond Director','2 Diamond Director','3 Diamond Director','4 Diamond Director','5 Diamond Director'];
  v_is_director boolean;
  v_new_handler boolean;
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

  v_is_director := _new_rank = ANY(v_director_ranks);
  v_new_handler := v_is_director OR _grant_fund_handler;

  UPDATE public.profiles
  SET rank = _new_rank,
      can_handle_funds = CASE WHEN v_new_handler THEN true ELSE can_handle_funds END,
      leader_id = CASE WHEN v_new_handler THEN id ELSE leader_id END
  WHERE id = _member_id;

  IF v_new_handler THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_member_id, 'leader')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  PERFORM public.notify_user(
    _member_id,
    'Rank updated',
    'Your rank is now ' || _new_rank,
    'generic',
    '/dashboard'
  );
END;
$$;

-- 8) Reassign unmanaged descendants to the nearest fund handler after profile hierarchy/fund-handler changes.
CREATE OR REPLACE FUNCTION public.recompute_fund_handlers(_root uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH RECURSIVE tree AS (
    SELECT id, sponsor_id, can_handle_funds, 1 AS depth
    FROM public.profiles
    WHERE sponsor_id = _root
    UNION ALL
    SELECT p.id, p.sponsor_id, p.can_handle_funds, tree.depth + 1
    FROM public.profiles p
    JOIN tree ON p.sponsor_id = tree.id
    WHERE tree.depth < 50
  )
  UPDATE public.profiles p
  SET leader_id = public.nearest_fund_handler(p.sponsor_id)
  FROM tree
  WHERE p.id = tree.id
    AND p.can_handle_funds = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_fund_handlers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (NEW.can_handle_funds IS DISTINCT FROM OLD.can_handle_funds OR NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id) THEN
    PERFORM public.recompute_fund_handlers(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_recompute_fund_handlers ON public.profiles;
CREATE TRIGGER profiles_recompute_fund_handlers
  AFTER UPDATE OF can_handle_funds, sponsor_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_fund_handlers();

-- 9) Fund-rule auto deductions route money to office support, team leader purse, or custom ledger notes.
CREATE OR REPLACE FUNCTION public.tg_apply_per_usd_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_rate numeric;
  v_ded_usd numeric;
  v_ded_ngn numeric;
  v_txn_id uuid;
BEGIN
  IF new.type::text <> 'deposit' OR new.leader_id IS NULL THEN RETURN new; END IF;
  SELECT usd_to_ngn INTO v_rate FROM public.app_settings WHERE id = 1;
  IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1600; END IF;

  FOR r IN SELECT * FROM public.fund_rules
           WHERE leader_id = new.leader_id
             AND active = true
             AND kind = 'per_usd'
             AND (target_rank IS NULL OR target_rank = (SELECT rank FROM public.profiles WHERE id = new.member_id))
  LOOP
    v_ded_ngn := r.amount_ngn * new.amount_usd;
    v_ded_usd := round(v_ded_ngn / v_rate, 2);
    IF v_ded_usd > 0 THEN
      INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, parent_txn_id)
      VALUES (new.member_id, new.leader_id, 'fund_deduction', v_ded_usd, 'NGN', v_rate, round(v_ded_ngn, 2), r.name, new.id)
      RETURNING id INTO v_txn_id;

      IF r.destination = 'team_leader' THEN
        INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
        VALUES (new.leader_id, 'credit', v_ded_usd, r.name || ' from deposit');
      ELSE
        INSERT INTO public.office_ledger (leader_id, kind, amount_ngn, category, note, source_txn_id)
        VALUES (new.leader_id, 'support_in', round(v_ded_ngn, 2), r.name,
                CASE WHEN r.destination = 'custom' THEN 'Custom fund from deposit' ELSE 'Office support from deposit' END,
                v_txn_id);
      END IF;
    END IF;
  END LOOP;
  RETURN new;
END;
$$;

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

-- 10) Lock manual leader purse credits to trusted backend functions/triggers only.
CREATE OR REPLACE FUNCTION public.validate_leader_purse_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid leader purse entry type';
  END IF;
  IF NEW.amount_usd <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leader_purse_validate_entry ON public.leader_purse_ledger;
CREATE TRIGGER leader_purse_validate_entry
  BEFORE INSERT OR UPDATE ON public.leader_purse_ledger
  FOR EACH ROW EXECUTE FUNCTION public.validate_leader_purse_entry();

DROP POLICY IF EXISTS "leaders manage own purse" ON public.leader_purse_ledger;
CREATE POLICY "leaders view and withdraw own purse"
  ON public.leader_purse_ledger FOR SELECT TO authenticated
  USING (leader_id = auth.uid());

CREATE POLICY "leaders withdraw own purse"
  ON public.leader_purse_ledger FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid() AND kind = 'debit' AND public.has_role(auth.uid(), 'leader'));

-- 11) Improve visibility policies for hierarchy and fund management.
DROP POLICY IF EXISTS "members view leader rules" ON public.fund_rules;
CREATE POLICY "members view fund handler rules"
  ON public.fund_rules FOR SELECT TO authenticated
  USING (
    leader_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.leader_id = fund_rules.leader_id)
    OR public.is_descendant_of(auth.uid(), leader_id)
  );

DROP POLICY IF EXISTS "leaders create team transactions" ON public.transactions;
CREATE POLICY "fund handlers create managed transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    leader_id = auth.uid()
    AND public.has_role(auth.uid(), 'leader')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = transactions.member_id
        AND p.leader_id = auth.uid()
        AND p.can_handle_funds = false
    )
  );

DROP POLICY IF EXISTS "members create own requests" ON public.withdrawal_requests;
CREATE POLICY "members create own requests"
  ON public.withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
    AND status = 'pending'::public.withdrawal_status
    AND leader_id = (SELECT profiles.leader_id FROM public.profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "leaders view downline bank" ON public.bank_accounts;
CREATE POLICY "fund handlers view managed bank"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = bank_accounts.user_id
        AND p.leader_id = auth.uid()
    )
  );

-- Existing used/expired codes can cause confusion; keep history but make future generated codes longer-lived.
ALTER TABLE public.invite_codes ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');