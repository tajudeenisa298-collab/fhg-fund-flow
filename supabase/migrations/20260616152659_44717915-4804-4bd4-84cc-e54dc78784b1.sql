
-- 1. app_settings: configurable thresholds
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dual_approval_threshold_usd numeric NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS member_daily_withdrawal_cap_usd numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS member_weekly_withdrawal_cap_usd numeric NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS member_daily_upkeep_cap_usd numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS deposit_reversal_window_hours int NOT NULL DEFAULT 24;

-- 2. withdrawal_status: new state
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='awaiting_second_approval'
                 AND enumtypid = 'public.withdrawal_status'::regtype) THEN
    ALTER TYPE public.withdrawal_status ADD VALUE 'awaiting_second_approval';
  END IF;
END $$;

-- 3. withdrawal_requests: dual approval + receipt hash
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS first_approver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS first_approver_at timestamptz,
  ADD COLUMN IF NOT EXISTS second_approver_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS second_approver_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_sha256 text;

-- 4. transactions: receipt hash + reversal window
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS receipt_sha256 text,
  ADD COLUMN IF NOT EXISTS reversal_window_until timestamptz;

-- Set reversal window on deposits
CREATE OR REPLACE FUNCTION public.tg_set_reversal_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_hours int;
BEGIN
  IF NEW.type::text = 'deposit' AND NEW.reversal_window_until IS NULL THEN
    SELECT deposit_reversal_window_hours INTO v_hours FROM public.app_settings WHERE id = 1;
    NEW.reversal_window_until := now() + (coalesce(v_hours, 24) || ' hours')::interval;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_reversal_window ON public.transactions;
CREATE TRIGGER trg_set_reversal_window BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_reversal_window();

-- 5. Daily/weekly withdrawal cap trigger
CREATE OR REPLACE FUNCTION public.guard_withdrawal_request_caps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_day_cap numeric; v_week_cap numeric; v_day_sum numeric; v_week_sum numeric;
BEGIN
  SELECT member_daily_withdrawal_cap_usd, member_weekly_withdrawal_cap_usd
    INTO v_day_cap, v_week_cap FROM public.app_settings WHERE id = 1;

  IF v_day_cap IS NOT NULL AND v_day_cap > 0 THEN
    SELECT coalesce(sum(amount_usd),0) INTO v_day_sum FROM public.withdrawal_requests
    WHERE member_id = NEW.member_id AND status <> 'declined'
      AND created_at > now() - interval '1 day';
    IF v_day_sum + NEW.amount_usd > v_day_cap THEN
      RAISE EXCEPTION 'Daily withdrawal cap of $% reached. Try again tomorrow.', v_day_cap;
    END IF;
  END IF;

  IF v_week_cap IS NOT NULL AND v_week_cap > 0 THEN
    SELECT coalesce(sum(amount_usd),0) INTO v_week_sum FROM public.withdrawal_requests
    WHERE member_id = NEW.member_id AND status <> 'declined'
      AND created_at > now() - interval '7 days';
    IF v_week_sum + NEW.amount_usd > v_week_cap THEN
      RAISE EXCEPTION 'Weekly withdrawal cap of $% reached.', v_week_cap;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_request_caps ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request_caps BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request_caps();

-- 6. dispense_upkeep daily cap
CREATE OR REPLACE FUNCTION public.dispense_upkeep(_member_id uuid, _amount_usd numeric, _screenshot_path text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_id uuid; v_member record; v_leader_name text; v_dup_exists boolean;
  v_day_cap numeric; v_day_sum numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, leader_id, full_name, can_handle_funds, suspended_until, terminated_at INTO v_member
  FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;
  IF v_member.terminated_at IS NOT NULL THEN RAISE EXCEPTION 'Member is terminated'; END IF;
  IF v_member.suspended_until IS NOT NULL AND v_member.suspended_until > now() THEN
    RAISE EXCEPTION 'Member is suspended until %', to_char(v_member.suspended_until,'YYYY-MM-DD HH24:MI');
  END IF;

  SELECT member_daily_upkeep_cap_usd INTO v_day_cap FROM public.app_settings WHERE id = 1;
  IF v_day_cap IS NOT NULL AND v_day_cap > 0 THEN
    SELECT coalesce(sum(amount_usd),0) INTO v_day_sum FROM public.upkeep_dispensations
    WHERE member_id = _member_id AND status <> 'disputed'
      AND created_at > now() - interval '1 day';
    IF v_day_sum + _amount_usd > v_day_cap THEN
      RAISE EXCEPTION 'Daily upkeep cap of $% reached for this member.', v_day_cap;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.upkeep_dispensations
    WHERE leader_id = auth.uid() AND member_id = _member_id
      AND amount_usd = _amount_usd AND status = 'pending'
      AND created_at > now() - interval '2 minutes'
  ) INTO v_dup_exists;
  IF v_dup_exists THEN
    RAISE EXCEPTION 'Looks like a duplicate — an identical pending upkeep was just sent.';
  END IF;

  INSERT INTO public.upkeep_dispensations (leader_id, member_id, amount_usd, screenshot_path, note)
  VALUES (auth.uid(), _member_id, _amount_usd, _screenshot_path, _note)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_leader_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(_member_id, 'Upkeep awaiting your approval',
    coalesce(v_leader_name, 'Your leader') || ' sent $' || _amount_usd || ' upkeep. Please confirm receipt.',
    'upkeep', '/dashboard');
  RETURN v_id;
END $$;

-- 7. resolve_withdrawal_request with dual-approval support
CREATE OR REPLACE FUNCTION public.resolve_withdrawal_request(_id uuid, _status text, _note text DEFAULT NULL, _currency text DEFAULT NULL, _exchange_rate numeric DEFAULT NULL, _local_amount numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_req record; v_member_balance numeric; v_threshold numeric; v_needs_dual boolean;
BEGIN
  IF _status NOT IN ('approved','declined') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = _id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.leader_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF v_req.status NOT IN ('pending','awaiting_second_approval') THEN
    RAISE EXCEPTION 'Already resolved';
  END IF;

  SELECT dual_approval_threshold_usd INTO v_threshold FROM public.app_settings WHERE id = 1;
  v_needs_dual := _status = 'approved' AND v_threshold IS NOT NULL AND v_threshold > 0 AND v_req.amount_usd >= v_threshold;

  -- Declines: any team leader of the request can decline at any stage
  IF _status = 'declined' THEN
    IF v_req.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your request'; END IF;
    UPDATE public.withdrawal_requests
      SET status='declined', leader_note=_note, resolved_at=now()
      WHERE id=_id;
    RETURN;
  END IF;

  -- Approve flow
  IF v_needs_dual AND v_req.status = 'pending' THEN
    -- first approval
    IF v_req.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Only the team leader can give first approval'; END IF;
    UPDATE public.withdrawal_requests
      SET status='awaiting_second_approval',
          first_approver_id = auth.uid(),
          first_approver_at = now(),
          leader_note = coalesce(_note, leader_note)
      WHERE id=_id;
    PERFORM public.log_admin_action('withdrawal_first_approval', v_req.member_id, _id,
      jsonb_build_object('amount_usd', v_req.amount_usd, 'threshold', v_threshold));
    PERFORM public.notify_user(v_req.member_id, 'Withdrawal awaiting 2nd approval',
      'Your $'||v_req.amount_usd||' request needs a second leader approval.', 'generic', '/dashboard');
    RETURN;
  END IF;

  IF v_req.status = 'awaiting_second_approval' THEN
    IF v_req.first_approver_id = auth.uid() THEN
      RAISE EXCEPTION 'Second approval must come from a different leader';
    END IF;
    IF NOT public.has_role(auth.uid(), 'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  END IF;

  -- final approve
  SELECT balance_usd INTO v_member_balance FROM public.profiles WHERE id = v_req.member_id;
  IF v_member_balance < v_req.amount_usd THEN RAISE EXCEPTION 'Member balance insufficient'; END IF;

  UPDATE public.withdrawal_requests
    SET status='approved',
        leader_note = coalesce(_note, leader_note),
        resolved_at = now(),
        second_approver_id = CASE WHEN v_needs_dual THEN auth.uid() ELSE second_approver_id END,
        second_approver_at = CASE WHEN v_needs_dual THEN now() ELSE second_approver_at END
    WHERE id=_id;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, request_id)
  VALUES (v_req.member_id, v_req.leader_id, 'withdrawal', v_req.amount_usd,
          coalesce(_currency,'NGN'), _exchange_rate, _local_amount, _note, _id);

  PERFORM public.log_admin_action(
    CASE WHEN v_needs_dual THEN 'withdrawal_second_approval' ELSE 'withdrawal_approval' END,
    v_req.member_id, _id,
    jsonb_build_object('amount_usd', v_req.amount_usd, 'dual', v_needs_dual));
END $$;

-- 8. undo recent deposit (within reversal window)
CREATE OR REPLACE FUNCTION public.undo_recent_deposit(_txn_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_t record; v_new uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'leader') THEN RAISE EXCEPTION 'Leaders only'; END IF;
  SELECT * INTO v_t FROM public.transactions WHERE id=_txn_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_t.leader_id <> auth.uid() THEN RAISE EXCEPTION 'Not your transaction'; END IF;
  IF v_t.type::text <> 'deposit' THEN RAISE EXCEPTION 'Only deposits can be undone'; END IF;
  IF v_t.reversal_window_until IS NULL OR v_t.reversal_window_until < now() THEN
    RAISE EXCEPTION 'Reversal window has closed for this deposit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE parent_txn_id=_txn_id AND note LIKE 'Undo of%') THEN
    RAISE EXCEPTION 'Already undone';
  END IF;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, currency, exchange_rate, local_amount, note, parent_txn_id)
  VALUES (v_t.member_id, v_t.leader_id, 'fund_deduction', v_t.amount_usd,
          v_t.currency, v_t.exchange_rate, v_t.local_amount,
          'Undo of deposit (within window)', _txn_id)
  RETURNING id INTO v_new;

  PERFORM public.notify_user(v_t.member_id, 'Deposit undone',
    'A $'||v_t.amount_usd||' deposit was undone by your leader within the reversal window.',
    'generic', '/dashboard');
  PERFORM public.log_admin_action('undo_recent_deposit', v_t.member_id, _txn_id,
    jsonb_build_object('amount_usd', v_t.amount_usd, 'reversal_txn_id', v_new));
  RETURN v_new;
END $$;

-- 9. Signed receipt hash setters
CREATE OR REPLACE FUNCTION public.set_transaction_receipt_hash(_txn_id uuid, _sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_t record;
BEGIN
  IF _sha256 IS NULL OR length(_sha256) <> 64 THEN RAISE EXCEPTION 'Invalid sha256'; END IF;
  SELECT * INTO v_t FROM public.transactions WHERE id=_txn_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_t.member_id <> auth.uid() AND v_t.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_t.receipt_sha256 IS NOT NULL AND v_t.receipt_sha256 <> _sha256 THEN
    RAISE EXCEPTION 'Receipt hash already set';
  END IF;
  UPDATE public.transactions SET receipt_sha256 = _sha256 WHERE id=_txn_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_withdrawal_receipt_hash(_id uuid, _sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_r record;
BEGIN
  IF _sha256 IS NULL OR length(_sha256) <> 64 THEN RAISE EXCEPTION 'Invalid sha256'; END IF;
  SELECT * INTO v_r FROM public.withdrawal_requests WHERE id=_id FOR UPDATE;
  IF v_r IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_r.member_id <> auth.uid() AND v_r.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF v_r.receipt_sha256 IS NOT NULL AND v_r.receipt_sha256 <> _sha256 THEN
    RAISE EXCEPTION 'Receipt hash already set';
  END IF;
  UPDATE public.withdrawal_requests SET receipt_sha256 = _sha256 WHERE id=_id;
END $$;

-- 10. upkeep_dispute_messages
CREATE TABLE IF NOT EXISTS public.upkeep_dispute_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensation_id uuid NOT NULL REFERENCES public.upkeep_dispensations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upkeep_dispute_messages_dispensation_idx
  ON public.upkeep_dispute_messages(dispensation_id, created_at);

GRANT SELECT, INSERT ON public.upkeep_dispute_messages TO authenticated;
GRANT ALL ON public.upkeep_dispute_messages TO service_role;

ALTER TABLE public.upkeep_dispute_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties view dispute messages" ON public.upkeep_dispute_messages
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.upkeep_dispensations d
          WHERE d.id = dispensation_id
            AND (d.member_id = auth.uid() OR d.leader_id = auth.uid()))
);

CREATE POLICY "parties post dispute messages" ON public.upkeep_dispute_messages
FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.upkeep_dispensations d
              WHERE d.id = dispensation_id
                AND (d.member_id = auth.uid() OR d.leader_id = auth.uid())
                AND d.status = 'disputed')
);

-- Notify the counterparty on new dispute message
CREATE OR REPLACE FUNCTION public.tg_notify_dispute_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_disp record; v_target uuid; v_author_name text;
BEGIN
  SELECT * INTO v_disp FROM public.upkeep_dispensations WHERE id = NEW.dispensation_id;
  IF v_disp IS NULL THEN RETURN NEW; END IF;
  v_target := CASE WHEN NEW.author_id = v_disp.member_id THEN v_disp.leader_id ELSE v_disp.member_id END;
  SELECT full_name INTO v_author_name FROM public.profiles WHERE id = NEW.author_id;
  PERFORM public.notify_user(v_target, 'Dispute message',
    coalesce(v_author_name,'Someone') || ': ' || left(NEW.body, 120),
    'upkeep', '/dashboard');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_dispute_message ON public.upkeep_dispute_messages;
CREATE TRIGGER trg_notify_dispute_message AFTER INSERT ON public.upkeep_dispute_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_dispute_message();
