-- Notify members when a fund rule is created or meaningfully changed
CREATE OR REPLACE FUNCTION public.tg_notify_fund_rule_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body  text;
  v_link  text := '/dashboard';
  v_should_notify boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.active THEN
      v_should_notify := true;
      v_title := 'New team rule added';
      v_body  := COALESCE(NEW.name, 'A fund rule') || ' — ₦' || NEW.amount_ngn::text || ' ' || NEW.frequency::text;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.active IS DISTINCT FROM OLD.active)
       OR (NEW.amount_ngn IS DISTINCT FROM OLD.amount_ngn)
       OR (NEW.frequency  IS DISTINCT FROM OLD.frequency)
       OR (NEW.name       IS DISTINCT FROM OLD.name) THEN
      v_should_notify := true;
      IF NEW.active = false AND OLD.active = true THEN
        v_title := 'Team rule paused';
        v_body  := COALESCE(NEW.name, 'A fund rule') || ' is no longer active.';
      ELSE
        v_title := 'Team rule updated';
        v_body  := COALESCE(NEW.name, 'A fund rule') || ' — ₦' || NEW.amount_ngn::text || ' ' || NEW.frequency::text;
      END IF;
    END IF;
  END IF;

  IF v_should_notify THEN
    INSERT INTO public.notifications (user_id, title, body, kind, link)
    SELECT p.id, v_title, v_body, 'fund_rule_changed'::notification_kind, v_link
    FROM public.profiles p
    WHERE p.leader_id = NEW.leader_id
      AND p.id <> NEW.leader_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fund_rule_notify ON public.fund_rules;
CREATE TRIGGER tg_fund_rule_notify
AFTER INSERT OR UPDATE ON public.fund_rules
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_fund_rule_change();


-- Notify everyone when USD/NGN rate changes by more than 0.5%
CREATE OR REPLACE FUNCTION public.tg_notify_fx_rate_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old numeric := COALESCE(OLD.usd_to_ngn, 0);
  v_new numeric := COALESCE(NEW.usd_to_ngn, 0);
  v_delta_pct numeric;
BEGIN
  IF v_new IS NULL OR v_new = 0 OR v_old IS NULL OR v_old = 0 THEN
    RETURN NEW;
  END IF;

  IF v_new = v_old THEN
    RETURN NEW;
  END IF;

  v_delta_pct := abs(v_new - v_old) / v_old * 100.0;
  IF v_delta_pct < 0.5 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  SELECT
    p.id,
    'Exchange rate updated',
    'USD ↔ NGN: ₦' || v_old::text || ' → ₦' || v_new::text,
    'fx_rate_changed'::notification_kind,
    '/dashboard'
  FROM public.profiles p;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_app_settings_fx_notify ON public.app_settings;
CREATE TRIGGER tg_app_settings_fx_notify
AFTER UPDATE OF usd_to_ngn ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_fx_rate_change();