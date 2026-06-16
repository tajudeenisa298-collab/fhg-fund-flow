
-- 1) member_notes table for leader-only CRM notes per member
CREATE TABLE IF NOT EXISTS public.member_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_notes TO authenticated;
GRANT ALL ON public.member_notes TO service_role;

ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;

-- Leader can manage notes only for members where they are the leader_id
CREATE POLICY "leaders select own member notes"
  ON public.member_notes FOR SELECT TO authenticated
  USING (leader_id = auth.uid()
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = member_id AND p.leader_id = auth.uid()));

CREATE POLICY "leaders insert own member notes"
  ON public.member_notes FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = member_id AND p.leader_id = auth.uid()));

CREATE POLICY "leaders update own member notes"
  ON public.member_notes FOR UPDATE TO authenticated
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid());

CREATE POLICY "leaders delete own member notes"
  ON public.member_notes FOR DELETE TO authenticated
  USING (leader_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_member_notes_member ON public.member_notes(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_notes_leader ON public.member_notes(leader_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_member_notes_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_member_notes_touch ON public.member_notes;
CREATE TRIGGER trg_member_notes_touch
  BEFORE UPDATE ON public.member_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_member_notes_touch();

-- 2) include request id in the withdrawal notification link so the leader can
--    review with one tap from the notification bell
CREATE OR REPLACE FUNCTION public.tg_notify_request_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = new.member_id;
  PERFORM public.notify_user(
    new.leader_id,
    'New withdrawal request',
    COALESCE(v_name, 'Member') || ' requested $' || new.amount_usd,
    'request_new',
    '/dashboard?request=' || new.id::text
  );
  RETURN new;
END $$;
