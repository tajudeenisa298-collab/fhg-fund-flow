
-- Cron health RPC for leaders: surface last run / status of our scheduled jobs.
CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS TABLE(
  jobname text,
  schedule text,
  active boolean,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_return text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'leader') THEN
    RAISE EXCEPTION 'Leaders only';
  END IF;

  RETURN QUERY
  SELECT j.jobname::text,
         j.schedule::text,
         j.active,
         d.start_time,
         d.end_time,
         d.status::text,
         d.return_message::text
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, end_time, status, return_message
    FROM cron.job_run_details d2
    WHERE d2.jobid = j.jobid
    ORDER BY start_time DESC NULLS LAST
    LIMIT 1
  ) d ON true
  WHERE j.jobname IN (
    'run-due-upkeep-every-minute',
    'run-due-fund-rules-hourly',
    'finalize-terminations-daily'
  )
  ORDER BY j.jobname;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cron_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_health() TO authenticated;
