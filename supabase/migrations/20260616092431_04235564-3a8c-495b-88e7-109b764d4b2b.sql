
-- ── Table for upkeep dispensations awaiting member acknowledgement ──
CREATE TYPE public.upkeep_ack_status AS ENUM ('pending', 'acknowledged', 'disputed');

CREATE TABLE public.upkeep_dispensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_usd numeric(12,2) NOT NULL CHECK (amount_usd > 0),
  screenshot_path text,
  note text,
  status public.upkeep_ack_status NOT NULL DEFAULT 'pending',
  dispute_note text,
  txn_id uuid REFERENCES public.transactions(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.upkeep_dispensations TO authenticated;
GRANT ALL ON public.upkeep_dispensations TO service_role;

ALTER TABLE public.upkeep_dispensations ENABLE ROW LEVEL SECURITY;

-- Members see their own; leaders see those they dispensed
CREATE POLICY "upkeep_dispensations_select" ON public.upkeep_dispensations
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR leader_id = auth.uid());

-- All write paths go through RPCs (no direct INSERT/UPDATE policies)

CREATE TRIGGER upkeep_dispensations_touch
  BEFORE UPDATE ON public.upkeep_dispensations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RPC: leader dispenses upkeep with optional proof ──
CREATE OR REPLACE FUNCTION public.dispense_upkeep(
  _member_id uuid,
  _amount_usd numeric,
  _screenshot_path text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_member record;
  v_leader_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;
  IF _amount_usd IS NULL OR _amount_usd <= 0 OR _amount_usd > 1000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, leader_id, full_name, can_handle_funds INTO v_member
  FROM public.profiles WHERE id = _member_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.leader_id <> auth.uid() OR v_member.can_handle_funds THEN
    RAISE EXCEPTION 'Not your managed member';
  END IF;

  INSERT INTO public.upkeep_dispensations (leader_id, member_id, amount_usd, screenshot_path, note)
  VALUES (auth.uid(), _member_id, _amount_usd, _screenshot_path, _note)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_leader_name FROM public.profiles WHERE id = auth.uid();

  PERFORM public.notify_user(
    _member_id,
    'Upkeep awaiting your approval',
    coalesce(v_leader_name, 'Your leader') || ' sent $' || _amount_usd || ' upkeep. Please confirm receipt.',
    'upkeep',
    '/dashboard'
  );

  RETURN v_id;
END;
$$;

-- ── RPC: member acknowledges upkeep, credits balance ──
CREATE OR REPLACE FUNCTION public.acknowledge_upkeep(_dispensation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_disp record;
  v_txn_id uuid;
  v_member_name text;
BEGIN
  SELECT * INTO v_disp FROM public.upkeep_dispensations WHERE id = _dispensation_id FOR UPDATE;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_disp.member_id <> auth.uid() THEN RAISE EXCEPTION 'Not your upkeep'; END IF;
  IF v_disp.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  INSERT INTO public.transactions (member_id, leader_id, type, amount_usd, note)
  VALUES (v_disp.member_id, v_disp.leader_id, 'deposit', v_disp.amount_usd,
          coalesce(v_disp.note, 'Upkeep') || ' · approved by member')
  RETURNING id INTO v_txn_id;

  UPDATE public.upkeep_dispensations
  SET status = 'acknowledged', acknowledged_at = now(), txn_id = v_txn_id
  WHERE id = _dispensation_id;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(
    v_disp.leader_id,
    'Upkeep approved',
    coalesce(v_member_name, 'Member') || ' confirmed $' || v_disp.amount_usd || ' upkeep',
    'upkeep',
    '/dashboard'
  );

  RETURN v_txn_id;
END;
$$;

-- ── RPC: member disputes upkeep (no balance change) ──
CREATE OR REPLACE FUNCTION public.dispute_upkeep(_dispensation_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_disp record;
  v_member_name text;
BEGIN
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Please explain the dispute';
  END IF;
  SELECT * INTO v_disp FROM public.upkeep_dispensations WHERE id = _dispensation_id FOR UPDATE;
  IF v_disp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_disp.member_id <> auth.uid() THEN RAISE EXCEPTION 'Not your upkeep'; END IF;
  IF v_disp.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  UPDATE public.upkeep_dispensations
  SET status = 'disputed', dispute_note = trim(_reason), acknowledged_at = now()
  WHERE id = _dispensation_id;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = auth.uid();
  PERFORM public.notify_user(
    v_disp.leader_id,
    'Upkeep disputed',
    coalesce(v_member_name, 'Member') || ' disputed $' || v_disp.amount_usd || ' upkeep: ' || trim(_reason),
    'upkeep',
    '/dashboard'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispense_upkeep FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acknowledge_upkeep FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dispute_upkeep FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispense_upkeep TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_upkeep TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_upkeep TO authenticated;

-- ── Storage RLS on upkeep-proofs bucket ──
-- File path convention: {leader_id}/{dispensation_id}.{ext}

CREATE POLICY "upkeep_proofs_leader_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'upkeep-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "upkeep_proofs_leader_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'upkeep-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "upkeep_proofs_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'upkeep-proofs'
    AND EXISTS (
      SELECT 1 FROM public.upkeep_dispensations d
      WHERE d.member_id = auth.uid()
        AND d.screenshot_path = storage.objects.name
    )
  );

CREATE POLICY "upkeep_proofs_leader_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'upkeep-proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
