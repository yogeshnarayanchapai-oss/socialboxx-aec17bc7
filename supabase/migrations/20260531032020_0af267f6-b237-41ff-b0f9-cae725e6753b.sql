
-- Remove old daily-followup hourly cron jobs (and any followup-related crons except retry-unreplied)
DO $$
DECLARE
  j RECORD;
BEGIN
  FOR j IN SELECT jobid, jobname, command FROM cron.job
  LOOP
    IF j.command ILIKE '%/functions/v1/daily-followup%'
       OR j.command ILIKE '%/functions/v1/automation-followup%'
       OR j.jobname ILIKE '%daily-followup%'
       OR j.jobname ILIKE '%automation-followup%' THEN
      PERFORM cron.unschedule(j.jobid);
    END IF;
  END LOOP;
END $$;
