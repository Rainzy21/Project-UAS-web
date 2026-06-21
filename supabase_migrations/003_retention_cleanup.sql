-- Retention cleanup for recommendation_logs (12-month policy per privacy.html).
-- Requires pg_cron extension (Supabase Pro). On Free tier, run manually:
--   SELECT public.cleanup_old_recommendation_logs();

CREATE OR REPLACE FUNCTION public.cleanup_old_recommendation_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.recommendation_logs
  WHERE created_at < now() - interval '12 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Schedule monthly cleanup (1st of each month at 03:00 UTC).
-- Idempotent: unschedule first if re-applying migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup-recommendation-logs';

    PERFORM cron.schedule(
      'cleanup-recommendation-logs',
      '0 3 1 * *',
      $$SELECT public.cleanup_old_recommendation_logs()$$
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron not available; enable extension in Supabase Dashboard or run cleanup manually';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END;
$$;
