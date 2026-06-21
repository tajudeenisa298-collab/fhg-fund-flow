ALTER TABLE public.login_devices
  ADD COLUMN IF NOT EXISTS mfa_trusted_until timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_trusted_at timestamptz;

CREATE OR REPLACE FUNCTION public.trust_login_device_for_mfa(_hash text, _days int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _safe_days int := LEAST(GREATEST(COALESCE(_days, 30), 1), 30);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.login_devices (
    user_id,
    device_hash,
    user_agent,
    label,
    mfa_trusted_at,
    mfa_trusted_until
  )
  VALUES (
    _uid,
    _hash,
    NULL,
    NULL,
    now(),
    now() + (_safe_days || ' days')::interval
  )
  ON CONFLICT (user_id, device_hash) DO UPDATE
    SET mfa_trusted_at = now(),
        mfa_trusted_until = now() + (_safe_days || ' days')::interval,
        last_seen_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trust_login_device_for_mfa(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trust_login_device_for_mfa(text, int) TO authenticated;
