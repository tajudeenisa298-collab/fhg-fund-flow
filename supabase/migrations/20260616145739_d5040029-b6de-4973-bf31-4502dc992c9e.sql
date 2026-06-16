
CREATE TABLE public.login_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  user_agent TEXT,
  label TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_devices TO authenticated;
GRANT ALL ON public.login_devices TO service_role;

ALTER TABLE public.login_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own devices select" ON public.login_devices
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own devices delete" ON public.login_devices
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_login_device(_hash TEXT, _ua TEXT, _label TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existed BOOLEAN;
  _leader UUID;
  _name TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT TRUE INTO _existed FROM public.login_devices
   WHERE user_id = _uid AND device_hash = _hash;

  IF _existed THEN
    UPDATE public.login_devices SET last_seen_at = now(), user_agent = _ua, label = COALESCE(_label, label)
     WHERE user_id = _uid AND device_hash = _hash;
    RETURN FALSE;
  END IF;

  INSERT INTO public.login_devices (user_id, device_hash, user_agent, label)
  VALUES (_uid, _hash, _ua, _label);

  -- Notify the user
  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (_uid, 'New device signed in',
          'A new sign-in to your account was recorded from: ' || COALESCE(_label, _ua, 'unknown device') || '. If this wasn''t you, change your password immediately.',
          'security');

  -- Notify their leader, if any
  SELECT leader_id, full_name INTO _leader, _name FROM public.profiles WHERE id = _uid;
  IF _leader IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (_leader, 'New device for team member',
            COALESCE(_name, 'A member') || ' signed in from a new device: ' || COALESCE(_label, _ua, 'unknown'),
            'security');
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_device(TEXT, TEXT, TEXT) TO authenticated;
