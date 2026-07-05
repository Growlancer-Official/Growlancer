-- Schedule subscription-billing-cron to run daily at midnight
-- Uses pg_cron extension (enabled by default on Supabase Pro)

-- Grant the service_role ability to invoke the function
GRANT USAGE ON SCHEMA cron TO service_role;

-- Schedule the cron job to run daily at 00:00 UTC
SELECT cron.schedule(
  'subscription-billing-daily',  -- job name
  '0 0 * * *',                   -- every day at midnight UTC
  $$SELECT net.http_post(
    url:='https://zttwsjehcgaicziqyxpq.supabase.co/functions/v1/subscription-billing-cron',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
