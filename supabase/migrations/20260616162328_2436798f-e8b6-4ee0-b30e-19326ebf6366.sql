DROP POLICY IF EXISTS "Leaders read audit log" ON public.admin_audit_log;

CREATE POLICY "Leaders read own audit log"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'leader'::app_role)
  AND (
    actor_id = auth.uid()
    OR (target_user_id IS NOT NULL AND public.is_descendant_of(auth.uid(), target_user_id))
  )
);