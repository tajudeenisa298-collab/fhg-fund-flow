
-- 1. Auto-release leader's personal balance when can_handle_funds flips false -> true
CREATE OR REPLACE FUNCTION public.release_balance_on_leader_flip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(OLD.can_handle_funds, false) = false
     AND coalesce(NEW.can_handle_funds, false) = true
     AND coalesce(NEW.balance_usd, 0) > 0 THEN
    INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
    VALUES (NEW.id, coalesce(auth.uid(), NEW.id), 'release', NEW.balance_usd,
            'Personal balance released on promotion to Team Leader');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_balance_on_leader_flip ON public.profiles;
CREATE TRIGGER trg_release_balance_on_leader_flip
  AFTER UPDATE OF can_handle_funds ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.release_balance_on_leader_flip();

-- 2. promote_member_to_leader: drop explicit release, set can_handle_funds=true so the trigger handles release once
CREATE OR REPLACE FUNCTION public.promote_member_to_leader(_member_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member record;
BEGIN
  SELECT * INTO v_member FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id IS NULL OR v_member.leader_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the member''s current leader can promote them';
  END IF;
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Only leaders can promote members';
  END IF;

  UPDATE public.profiles
    SET rank = 'Director', leader_id = NULL, can_handle_funds = true
    WHERE id = _member_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (_member_id, 'leader')
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.notify_user(_member_id, 'Promoted to Team Leader',
    'You have been promoted to Team Leader. Your personal balance was released.',
    'generic', '/dashboard');

  PERFORM public.log_admin_action('promote_member_to_leader', _member_id, NULL,
    jsonb_build_object('released_balance_usd', v_member.balance_usd, 'note', _note));
END;
$$;

-- 3. Backfill: zero out any existing fund-handling leaders who still have a positive personal balance
INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
SELECT p.id, p.id, 'release', p.balance_usd,
       'Backfill: personal balance zeroed for fund-handling leader'
FROM public.profiles p
WHERE coalesce(p.can_handle_funds, false) = true
  AND coalesce(p.balance_usd, 0) > 0;
