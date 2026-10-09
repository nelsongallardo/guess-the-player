# ADR 0030 — Daily email reminders through EmailOctopus

Date: 2026-10-09

Status: accepted for implementation; **delivery inactive** until the owner approves a release with the real sender, cohort count, schedule and rendered emails. Does not change any gameplay, scoring, clock, nickname, group or analytics contract.

## Context

The owner asked for a daily reminder email for Derabona using EmailOctopus. New accounts get an optional choice. The current accounts are the owner's friends, and the owner asked for them to be included. Retention data is small and next-day return is weak, so a reminder is a reasonable experiment, but it must not cost guest/offline play, gameplay integrity or the existing privacy commitments.

EmailOctopus API v2 (retrieved 2026-10-09) supports contact create/read/update/delete and `POST /automations/{id}/queue` with `{"contact_id"}`, which returns 204 on acceptance. Campaign endpoints are read-only, so there is no API to compose and send a campaign. Repeating automations are allowed, but a contact cannot start the same automation again within 24 hours or while it is still in progress. Webhooks are signed with `EmailOctopus-Signature: sha256=<hex HMAC-SHA256 of the raw body>`, carry a unique event `id`, `occurred_at`, the contact address and, on some events, its status (`SUBSCRIBED`, `PENDING`, `UNSUBSCRIBED`, `BOUNCED`, `COMPLAINED`).

## Decision

- **Server scheduler + vendor automation.** One simple "Started via API" automation per language (ES, EN), with repeats allowed and no wait steps. A server worker queues each eligible contact into its language's automation at most once per UTC date. EmailOctopus owns rendering, the unsubscribe link, the sender footer and suppression.
- **Private state in `reminder_private`** (migration `202610090001_email_reminders.sql`), with four separate responsibilities:
  1. `preferences`: intent, language, version, enrollment provenance and the last observed vendor state;
  2. `sync_jobs`: a versioned contact outbox with bounded leases, backoff and attempts;
  3. `dispatches`: one ledger row per (destination, UTC date);
  4. `suppressed_destinations`: hashed addresses with a vendor unsubscribe, bounce or complaint.
  Only three `security definer` RPCs exist, all `service_role`-only: `email_preferences` (browser endpoint), `email_reminders_worker` and `email_reminders_admin`.
- **Two separately recorded enrollment sources.**
  - `user_opt_in` is set only when the signed-in account submits the unchecked-by-default choice. It stores the consent wording version and server time.
  - `owner_requested_existing_friends` covers a single frozen cohort: accounts that existed at an explicit server-time cutoff, enrolled because the owner asked. The schema rejects a consent timestamp or version on these rows, so user consent can never be fabricated for them. They are recorded as an owner instruction, not as a legal determination or vendor approval.
- **Frozen cohort.**
  - `freezeCohort` copies the account IDs created at or before the cutoff into private `cohort_members` and returns only counts and a SHA-256 manifest digest.
  - `applyCohort` requires that digest and runs once; a rerun reports the stored result. Later accounts can never enter it.
  - Apply never overrides an existing preference, a suppressed destination, an unverified or missing address, or a duplicate destination. Missing language defaults to Spanish.
- **Identity and addresses.** The browser endpoint passes only the verified Auth user. The address always comes from `auth.users` (confirmed, non-anonymous, not soft-deleted).
  - Normalization trims and lowercases only; plus tags and dots are kept.
  - An address change disables reminders and retires the old destination at the vendor. The new address needs a fresh enrollment.
  - Account deletion removes the preference row immediately and queues vendor cleanup that keeps the address only until the job finishes.
- **Suppression wins.** Vendor unsubscribe, bounce and complaint switch reminders off locally.
  - Bounce and complaint are permanent for the account and the address.
  - An unsubscribe can be reversed only by a new explicit opt-in, which stays `pending` until the vendor reports `subscribed`.
  - Events older than the latest explicit enrollment cannot change it, and old "subscribed" events never restore delivery.
  - Contact sync reads vendor state before writing and never upserts to subscribed blindly. Owner-cohort sync never resubscribes a contact the vendor holds as unsubscribed.
- **At most one attempted dispatch per destination and UTC date**, not exactly-once delivery.
  - A claim is a ledger insert keyed by (destination, date). `startDispatch` re-runs every eligibility check just before the vendor call and marks the row `sending`.
  - An expired `claimed` row becomes `skipped`, because no call was made. An expired `sending` row becomes `uncertain` and is never retried that day, and its start counts toward the 24-hour gap.
  - A completion that races the last check can still produce a reminder.
- **Eligibility is read-only.** Daily completion means three `ranked_private.daily_results` rows for the server's UTC date. The scheduler never calls `dailyProgress`, `start` or any other action that creates timed state.
- **Delivery ships off.** `settings.dispatch_enabled=false`, and the cron schedule is a separate manual SQL file. Proposed default window: 16:00–20:00 UTC (13:00–17:00 in Argentina), with a 24h + 2 min gap. Because of the gap and the five-minute cadence, the send time drifts later by up to about five minutes a day and a date is occasionally skipped. Missed days are never backfilled and no date gets two sends.
- **Short generic content.** One call to action, `https://derabona.club/?lang=es|en`, and campaign UTMs from the existing allowlist. No clue, answer, score, challenge number or personal identifier.
- **Browser surface.** An unchecked checkbox in the first-sign-in nickname dialog, and an "Email reminders" section in Account on `index.html` and `leaderboard.html`. Nickname completion never waits on or fails because of reminders. No vendor request is ever made from a browser, and portable `file:` play makes no reminder request.

## Consequences

- Live sends need owner setup: an EmailOctopus account, list, language field, two automations, an authenticated sender domain, a webhook endpoint and secrets. They also need an explicit release decision. See [docs/email-reminders.md](../email-reminders.md).
- **Amended 2026-10-09: single opt-in.** The owner's EmailOctopus list has double opt-in off, so an API-created `pending` contact would never receive anything. Explicit opt-ins, and explicit re-opt-ins after an unsubscribe, are therefore created or updated as `subscribed`. The address is the account's verified Auth email and the account ticked the box itself. The owner cohort still never resubscribes a vendor unsubscribe. After a re-opt-in, delivery resumes once the vendor's `contact.updated` webhook confirms `subscribed`.
- The legacy cohort's vendor eligibility, including any attestation EmailOctopus requires for contacts added without a confirmation form, is an owner/vendor question, not something this code asserts.
- A reminder can still arrive after a completion that races the final eligibility check, or not arrive on a day skipped by the vendor gap or an `uncertain` outcome.
