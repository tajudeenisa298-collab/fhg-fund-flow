
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_descendant_of(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "deny all broadcast/presence" ON realtime.messages';
    EXECUTE 'CREATE POLICY "deny all broadcast/presence" ON realtime.messages
             FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
  END IF;
END $$;
