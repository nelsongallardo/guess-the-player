-- MANUAL, OWNER-APPROVED RELEASE STEP ONLY (ADR 0030, docs/email-reminders.md).
-- This file is deliberately NOT in supabase/migrations/: applying migrations
-- must never start a scheduler. Run it in the SQL editor of the exact,
-- confirmed project only after the release preview has been approved.
--
-- Prerequisites (Database -> Extensions): pg_cron and pg_net enabled.
-- Vault secrets (Project Settings -> Vault), never pasted into this file:
--   reminder_worker_url    = https://<project-ref>.supabase.co/functions/v1/email-reminders-worker
--   reminder_worker_secret = the same value as the Edge secret REMINDER_WORKER_SECRET (>= 32 random chars)
--
-- One scheduler, every five minutes, all day (UTC). Each tick reconciles
-- addresses, synchronizes contacts and reads vendor state; it only queues
-- reminders while reminder_private.settings.dispatch_enabled is true AND the
-- time is inside the send window (default 16:00-20:00 UTC).
select cron.schedule(
  'derabona-email-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Worker-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_worker_secret')),
    body := '{"task":"tick"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Rollback / pause (either is sufficient to stop new sends):
--   select cron.unschedule('derabona-email-reminders');
--   select public.email_reminders_admin('{"action":"setDispatch","enabled":false}'::jsonb);
