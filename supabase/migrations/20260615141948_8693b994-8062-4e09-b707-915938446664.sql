
-- 1) Protect sensitive profile columns from self-update via a BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard when an authenticated end-user is updating their OWN row.
  -- service_role / SECURITY DEFINER functions (auth.uid() IS NULL or != id) are unaffected.
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  NEW.rank             := OLD.rank;
  NEW.balance_usd      := OLD.balance_usd;
  NEW.can_handle_funds := OLD.can_handle_funds;
  NEW.sponsor_id       := OLD.sponsor_id;
  NEW.leader_id        := OLD.leader_id;
  NEW.email            := OLD.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_self_update();

-- 2) Restrict app_settings UPDATE to the root leader (founder: sponsor_id IS NULL + leader role).
DROP POLICY IF EXISTS "leaders update settings" ON public.app_settings;

CREATE POLICY "root leader updates settings"
ON public.app_settings
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'leader')
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND sponsor_id IS NULL
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'leader')
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND sponsor_id IS NULL
  )
);
