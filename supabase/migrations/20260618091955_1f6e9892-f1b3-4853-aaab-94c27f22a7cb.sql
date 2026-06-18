
-- Replace the release trigger: still zero the personal balance via a 'release' transaction,
-- and additionally credit the released amount to the leader's purse so it can be paid out.
CREATE OR REPLACE FUNCTION public.release_balance_on_leader_flip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount numeric;
BEGIN
  IF coalesce(OLD.can_handle_funds, false) = false
     AND coalesce(NEW.can_handle_funds, false) = true
     AND coalesce(NEW.balance_usd, 0) > 0 THEN
    v_amount := NEW.balance_usd;

    -- 1. Zero the personal balance via a 'release' transaction (decrements via apply_transaction_to_balance trigger)
    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
    VALUES (NEW.id, coalesce(auth.uid(), NEW.id), 'release', v_amount,
            'Personal balance released on promotion to Team Leader');

    -- 2. Credit the same amount to the new leader's own purse so they can withdraw it as a payout
    INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
    VALUES (NEW.id, 'credit', v_amount,
            'Personal balance carried over on promotion to Team Leader');

    -- 3. Notify the new leader
    PERFORM public.notify_user(NEW.id, 'Personal balance moved to your purse',
      '$' || v_amount || ' from your personal balance is now in your leader purse and available for payout.',
      'generic', '/dashboard');
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: previous version of the trigger zeroed balances but did not credit the purse.
-- Find leaders whose only 'release' transaction was from that backfill/promotion and credit their purse now.
INSERT INTO public.leader_purse_ledger (leader_id, kind, amount_usd, note)
SELECT t.member_id, 'credit', t.amount_usd,
       'Personal balance carried over on promotion (retroactive)'
FROM public.transactions t
JOIN public.profiles p ON p.id = t.member_id
WHERE t.type = 'release'
  AND coalesce(p.can_handle_funds, false) = true
  AND (
    t.note = 'Backfill: personal balance zeroed for fund-handling leader'
    OR t.note = 'Personal balance released on promotion to Team Leader'
    OR t.note = 'Funds released on promotion to Team Leader'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.leader_purse_ledger lpl
    WHERE lpl.leader_id = t.member_id
      AND lpl.kind = 'credit'
      AND lpl.amount_usd = t.amount_usd
      AND lpl.note LIKE 'Personal balance carried over on promotion%'
  );
