# Daily email reminders (EmailOctopus)

Decision record: [ADR 0030](adr/0030-emailoctopus-daily-reminders.md). This page is the operating runbook. **Delivery ships inactive.** Merging or deploying this code sends no email, imports no contact and starts no schedule.

## What runs where

| Piece | Where | Purpose |
|---|---|---|
| `supabase/migrations/202610090001_email_reminders.sql` | Postgres, private `reminder_private` schema | Preferences, frozen owner cohort, sync outbox, dispatch ledger and suppression; `service_role`-only RPCs |
| `email-preferences` | Edge Function, `verify_jwt=false`, checks `getUser()` | Browser `get`/`set` for the signed-in account only |
| `email-reminders-worker` | Edge Function, `verify_jwt=false`, checks `X-Reminder-Worker-Secret` | Address reconciliation, contact sync, periodic vendor reads and dispatch |
| `emailoctopus-webhook` | Edge Function, `verify_jwt=false`, checks `EmailOctopus-Signature` | Unsubscribe/bounce/complaint/confirmation events; only hashed addresses reach the database |
| `supabase/manual/email-reminders-schedule.sql` | Manual SQL (pg_cron + pg_net) | The one scheduler: a worker tick every five minutes |
| `scripts/email-reminders-cohort.mjs` | Operator machine | Freeze, preview and apply the owner-requested cohort; settings and dispatch preview |
| `emails/daily-reminder.{es,en}.{html,txt}` | Pasted into EmailOctopus | Reminder content; not deployed to Pages |
| `index.html`, `leaderboard.html` | Browser | Unchecked first-sign-in choice, plus the Account section on both pages |

Gameplay is untouched. Eligibility reads `ranked_private.daily_results` directly for the server's UTC date. Nothing calls `dailyProgress`, `start` or any other action that creates timed state.

## Secrets and configuration (exact names)

Edge Function secrets (`supabase secrets set`, never in git or HTML):

| Name | Value |
|---|---|
| `EMAILOCTOPUS_API_KEY` | A v2 API key. Keys labelled "legacy" must be regenerated. |
| `EMAILOCTOPUS_LIST_ID` | The reminders list ID. The webhook ignores events for any other list. |
| `EMAILOCTOPUS_AUTOMATION_ES`, `EMAILOCTOPUS_AUTOMATION_EN` | IDs of the two "Started via API" automations |
| `EMAILOCTOPUS_LANGUAGE_FIELD` | Optional; the list's language field tag. Defaults to `Language`. |
| `EMAILOCTOPUS_WEBHOOK_SECRET` | The webhook endpoint's signing secret from the EmailOctopus dashboard |
| `REMINDER_WORKER_SECRET` | 32 or more random characters; also stored as the Vault secret `reminder_worker_secret` |

If any EmailOctopus value is missing, the worker makes no vendor request and only reconciles locally. If the webhook secret or list ID is missing, the webhook returns 503.

## Current setup (2026-10-09)

- **EmailOctopus:**
  - List "derabona · recordatorio diario" (`f501b9d2-c3ca-11f1-8bf3-db0a513fea80`), with a `Language` field and double opt-in off.
  - Draft automations "Recordatorio diario (ES)" (`4df682d0-c3d4-11f1-91de-03d5a6c835c4`) and "Daily reminder (EN)" (`de8cfbb2-c3d4-11f1-ab94-03ff1672a0f6`). Both are "Manually via the API", allow repeats, have Google Analytics link tracking off, and send one email from "derabona" <contact@derabona.club> using the repo templates.
  - Webhook "derabona reminders" pointing at the `emailoctopus-webhook` function, for contact created/updated/deleted plus bounced, complained and unsubscribed.
  - The owner verified the domain; the sender-info postal address is set and private.
- **Supabase secrets set:** `EMAILOCTOPUS_API_KEY`, `EMAILOCTOPUS_LIST_ID`, `EMAILOCTOPUS_LANGUAGE_FIELD`, `EMAILOCTOPUS_AUTOMATION_ES`, `EMAILOCTOPUS_AUTOMATION_EN` and `REMINDER_WORKER_SECRET`.
- **Daily card:** the public `daily-card` function draws today's first-player card from the live site, and the worker writes `DailyCard`/`DailyNumber` onto the contact before each send. Both are EmailOctopus list fields, and both automations use the redesigned templates.
- **Still open:** the owner must set `EMAILOCTOPUS_WEBHOOK_SECRET` and click Start on both automations.

## Owner/vendor setup (reference)

1. **EmailOctopus account and plan.** Check contact and send limits for about 25 contacts × 30 emails a month. On the free Starter plan the template must keep `{{RewardsURL}}`; remove it on a paid plan.
2. **Sender.** Choose the From name, From address and Reply-To (for example `contact@derabona.club`). Authenticate `derabona.club` in EmailOctopus using only the records it generates. **Keep the existing ImprovMX MX records and root SPF.** If EmailOctopus needs an SPF include, merge it into the one existing SPF record instead of adding a second. ImprovMX forwarding does not verify an outgoing sender. DNS changes need separate authorization.
3. **`{{SenderInfo}}`.** EmailOctopus requires a physical postal address in account settings for its sender-info footer. The owner must supply one: a business address, PO box or mail-forwarding address.
4. **List** (done 2026-10-09: list `f501b9d2-c3ca-11f1-8bf3-db0a513fea80`, "derabona · recordatorio diario", with a `Language` text field). **Double opt-in is off**, so the worker uses single opt-in and creates explicit opt-ins as `subscribed` (ADR 0030 amendment). The notes below applied to the earlier double-opt-in design:
   - New explicit opt-ins are created as `pending`. EmailOctopus documents that double opt-in emails are sent to contacts added through the API when double opt-in is on for the list.
   - **Prove this on a test list with an approved test recipient before enabling delivery.** Confirm that `pending` triggers the confirmation email and that confirming moves the contact to `subscribed`. Until a contact is `subscribed`, nothing is sent.
   - The owner cohort is created as `subscribed` through the API. Confirm with EmailOctopus whether a list with double opt-in still sends those contacts a confirmation, and whether any attestation is required for contacts added without a form. Report the vendor's answer; do not attest on the owner's behalf.
5. **Two automations**, one per language. Each has trigger "Started via API", **Allow contacts to repeat** turned on, and a single immediate email with no wait steps. Paste `emails/daily-reminder.<lang>.html` (and the `.txt` version as plain text). Subject: `Tu desafío diario de derabona` / `Your daily Derabona challenge`. Check the open/click-tracking defaults and record them.
6. **Webhook.** Endpoint `https://<project-ref>.supabase.co/functions/v1/emailoctopus-webhook`, with events `contact.unsubscribed`, `contact.bounced`, `contact.complained`, `contact.updated`, `contact.created` and `contact.deleted`. Copy its secret into `EMAILOCTOPUS_WEBHOOK_SECRET`.

## Deployment (each step needs explicit authorization; none happens on push)

1. Confirm the project ref and the checked-out migration set. Run `supabase migration list` and `supabase db push --linked --dry-run`, and review `202610090001_email_reminders.sql`. Apply it through the manual `supabase-deploy.yml` workflow or the CLI (see [leaderboards.md](leaderboards.md)). Then read back that `reminder_private.settings.dispatch_enabled` is `false`.
2. Deploy the functions: `supabase functions deploy email-preferences email-reminders-worker emailoctopus-webhook` (`config.toml` sets `verify_jwt=false`; every function authenticates itself).
3. Set the secrets above. With dispatch still disabled, the Account section works end to end, so `pending` opt-ins can be tested before any reminder is sent.

## Owner cohort (dry run by default)

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the operator's environment. All output is aggregate: no addresses and no account IDs.

```sh
node scripts/email-reminders-cohort.mjs freeze  --cohort existing-friends-20261009 --cutoff <ISO instant, not in the future>
node scripts/email-reminders-cohort.mjs preview --cohort existing-friends-20261009
node scripts/email-reminders-cohort.mjs apply   --cohort existing-friends-20261009 --manifest <digest>            # still a dry run
node scripts/email-reminders-cohort.mjs apply   --cohort existing-friends-20261009 --manifest <digest> --execute  # after approval
```

- `freeze` stores the account IDs created at or before the cutoff in `reminder_private.cohort_members`, which stays private in the database. Only one owner cohort can exist, and a different cutoff for the same cohort is refused.
- `apply --execute` runs once. A rerun reports the stored summary and writes nothing. It never overrides an existing preference (including an earlier opt-out), a suppressed destination, a missing or unverified address, or a duplicate destination. Rows are recorded as `owner_requested_existing_friends` with no consent timestamp, and the schema rejects one. Language defaults to Spanish and is editable in Account.

## Release preview (present all of this before activation)

- Sender name and address, Reply-To, the authenticated domain and the `{{SenderInfo}}` address.
- Cohort: cutoff, frozen member count, manifest digest and the dry-run breakdown (`enroll`, `deleted`, `no_verified_email`, `existing_preference`, `destination_suppressed`, `duplicate_destination`). State the Spanish default.
- The `dispatch-preview` counts by reason.
- The schedule: one tick every 5 minutes. The send window is 16:00–20:00 UTC (13:00–17:00 Argentina), a proposed default that the owner has not chosen. The vendor gap rule (24h + 2 min) makes the send time drift later by up to about five minutes a day, and a date is occasionally skipped. Missed days are never backfilled.
- Rendered emails in both languages, taken from the vendor's test send to an approved recipient, plus a confirmation that the double opt-in flow works.

## Activation and rollback

Activation needs explicit owner approval of the preview:

```sql
select public.email_reminders_admin('{"action":"setDispatch","enabled":true,"confirmation":"ENABLE_DAILY_REMINDERS"}'::jsonb);
-- then run supabase/manual/email-reminders-schedule.sql
```

Pause or roll back with either `select public.email_reminders_admin('{"action":"setDispatch","enabled":false}'::jsonb);` or `select cron.unschedule('derabona-email-reminders');`.

**Readback before claiming anything is live:** `cron.job` contains the job; `cron.job_run_details` shows successful ticks; `reminder_private.dispatches` has `accepted` rows for the date; and EmailOctopus shows each automation's sends. A 204 from the queue endpoint means *accepted*, not delivered.

## Guarantees and limits

- At most one *attempted* dispatch per destination and UTC date. An unknown outcome is recorded as `uncertain` and never retried that date. This is not exactly-once delivery.
- A Daily completed after the final eligibility check can still receive that day's reminder.
- Vendor suppression always wins:
  - Bounce and complaint are permanent for the account and the address.
  - An unsubscribe needs a new explicit opt-in followed by vendor confirmation.
  - Old events never restore delivery.
- Account deletion makes the account ineligible immediately. Vendor cleanup is queued and keeps the address only until it completes.
- An address change disables reminders and retires the old destination; the new address needs a fresh opt-in.
- The EmailOctopus API reports contact statuses as `pending`, `subscribed` or `unsubscribed` only. Bounces and complaints reach us through webhooks, so the webhook must be configured before activation.
