ALTER TABLE public.invite_codes
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '2 minutes');

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TABLE (
  id uuid,
  code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text;
  v_attempts integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to generate an invite code'
      USING errcode = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user_id) THEN
    RAISE EXCEPTION 'Your profile is not ready yet'
      USING errcode = '23503';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := 'FHG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    BEGIN
      INSERT INTO public.invite_codes (code, leader_id, expires_at)
      VALUES (v_code, v_user_id, now() + interval '2 minutes')
      RETURNING invite_codes.id, invite_codes.code, invite_codes.expires_at
      INTO id, code, expires_at;

      RETURN NEXT;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'Could not create a unique invite code. Please try again.';
        END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;
