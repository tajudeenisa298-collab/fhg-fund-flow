CREATE OR REPLACE FUNCTION public.is_root_signup_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.is_root_signup_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_root_signup_available() TO anon, authenticated;
