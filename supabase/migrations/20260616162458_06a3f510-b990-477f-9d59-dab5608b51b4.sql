DROP POLICY IF EXISTS "Leaders read cron alerts" ON public.cron_failure_alerts;

CREATE POLICY "Root leader reads cron alerts"
ON public.cron_failure_alerts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'leader'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.sponsor_id IS NULL
  )
);