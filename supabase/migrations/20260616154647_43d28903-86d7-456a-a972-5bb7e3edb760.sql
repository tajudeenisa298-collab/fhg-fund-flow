
DROP POLICY IF EXISTS "Audit visible to actor or target" ON public.admin_audit_log;
CREATE POLICY "Leaders read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'leader'));

CREATE POLICY "Leaders read cron alerts" ON public.cron_failure_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'leader'));

DROP POLICY IF EXISTS "upkeep_proofs_leader_read" ON storage.objects;
CREATE POLICY "upkeep_proofs_leader_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'upkeep-proofs'
    AND EXISTS (
      SELECT 1 FROM public.upkeep_dispensations d
      WHERE d.leader_id = auth.uid() AND d.screenshot_path = storage.objects.name
    )
  );

CREATE POLICY "Leaders read downline roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'leader')
    AND (user_id = auth.uid() OR public.is_descendant_of(user_id, auth.uid()))
  );

REVOKE EXECUTE ON FUNCTION public.guard_withdrawal_request_caps() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_set_reversal_window() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_transaction_receipt_hash(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_notify_dispute_message() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_withdrawal_receipt_hash(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_recent_deposit(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_login_device(text, text, text) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.tg_admin_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION 'admin_audit_log is append-only'; END $function$;
