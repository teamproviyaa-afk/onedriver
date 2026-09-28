-- SMS fallback timer: every 15 s the `notify` function sends SMS for WhatsApp messages that were
-- not delivered before their deadline, and encrypted fallback payloads are purged hourly.
--
-- The function URL and the shared secret are read from Supabase Vault when the job runs
-- (supabase/setup-messaging.sh stores them), so no secret is kept in this migration. Until
-- they exist the job does nothing.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname in ('notify-sweep', 'purge-message-payloads');

select cron.schedule('notify-sweep', '15 seconds', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_api_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'notify_sweep_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'notify_api_secret');
$job$);

select cron.schedule('purge-message-payloads', '17 * * * *', $job$ select public.purge_message_payloads(); $job$);
