-- 1) Restrict ancestor profile reads to safe fields only via a SECURITY DEFINER helper.
DROP POLICY IF EXISTS "members view upline profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_upline_safe(_member uuid)
RETURNS TABLE(id uuid, full_name text, rank text, avatar_url text, can_handle_funds boolean, depth int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT p.id, p.sponsor_id, p.full_name, p.rank, p.avatar_url, p.can_handle_funds, 0 AS depth
    FROM public.profiles p
    WHERE p.id = _member
    UNION ALL
    SELECT p.id, p.sponsor_id, p.full_name, p.rank, p.avatar_url, p.can_handle_funds, c.depth + 1
    FROM public.profiles p
    JOIN chain c ON p.id = c.sponsor_id
    WHERE c.depth < 50
  )
  SELECT c.id, c.full_name, c.rank, c.avatar_url, c.can_handle_funds, c.depth
  FROM chain c
  WHERE c.depth > 0
    AND (_member = auth.uid() OR public.has_role(auth.uid(), 'leader'));
$$;

GRANT EXECUTE ON FUNCTION public.get_upline_safe(uuid) TO authenticated;

-- 2) Notify members when promotion of an upline reparents them onto a new fund handler.
CREATE OR REPLACE FUNCTION public.recompute_fund_handlers(_root uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_new uuid;
  v_new_name text;
BEGIN
  FOR r IN
    WITH RECURSIVE tree AS (
      SELECT id, sponsor_id, can_handle_funds, leader_id, full_name, 1 AS depth
      FROM public.profiles WHERE sponsor_id = _root
      UNION ALL
      SELECT p.id, p.sponsor_id, p.can_handle_funds, p.leader_id, p.full_name, t.depth + 1
      FROM public.profiles p JOIN tree t ON p.sponsor_id = t.id
      WHERE t.depth < 50
    )
    SELECT id, leader_id AS old_leader, full_name FROM tree WHERE coalesce(can_handle_funds, false) = false
  LOOP
    v_new := public.nearest_fund_handler(
      (SELECT sponsor_id FROM public.profiles WHERE id = r.id)
    );
    IF v_new IS DISTINCT FROM r.old_leader THEN
      UPDATE public.profiles SET leader_id = v_new WHERE id = r.id;
      IF v_new IS NOT NULL THEN
        SELECT full_name INTO v_new_name FROM public.profiles WHERE id = v_new;
        PERFORM public.notify_user(
          r.id,
          'Your fund handler changed',
          'Your funds are now held by ' || coalesce(v_new_name, 'a new leader') ||
            '. They will handle your deposits, withdrawals and upkeep going forward.',
          'generic',
          '/dashboard'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;
