-- 1. Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Unschedule any existing cron job with the same name if present
SELECT cron.unschedule('sync-insta-stories-daily-7am-ph')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-insta-stories-daily-7am-ph'
);

-- 3. Schedule daily trigger at 7:00 AM PH Time (23:00 UTC)
-- Cron expression: '0 23 * * *' (Minute: 0, Hour: 23 UTC, Every day)
SELECT cron.schedule(
  'sync-insta-stories-daily-7am-ph',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://aivitcomiywiysrfwqxt.supabase.co/functions/v1/sync-insta-stories',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
