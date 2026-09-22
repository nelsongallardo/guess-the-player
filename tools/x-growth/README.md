# derabona X growth automation

Automated daily career puzzle on [@derabona_club](https://x.com/derabona_club), plus
approval-gated replies. Built to gain followers before any creator outreach.

Plan and rationale: `projects/derabona/2026-09-20-x-follower-growth-automation.md` in the Obsidian vault.

## Status

**LIVE, approval-first.** Original posts/reveals use the API. The engineering-profile pre-dispatch Telegram plugin queues explicitly approved replies for the browser worker. The worker runs every two minutes; automatic approval remains disabled. Runtime uses a verified release snapshot under the engineering profile, not this editable checkout.

Use the `PAUSE` file kill switch below to stop X reads and writes immediately.

## What runs

| Job | Schedule (London) | What it does |
|---|---|---|
| `derabona-daily-puzzle` | `0 17 * * *` | Posts `Carrera del día #N` with a career-card image |
| `derabona-daily-reveal` | `0 22 * * *` | Self-replies with the answer on that thread |
| `derabona-scout` | `30 13 * * *` | Drafts reply candidates, sends them to Telegram for approval |
| `derabona-weekly-metrics` | `0 9 * * 1` | Follower count, streak, spend, gate progress |

### ⚠️ BST hazard

Schedules are **London time**; the plan is written in Buenos Aires time.
`0 17` London = 13:00 BA **only during BST**.

**When BST ends on 25 October 2026, change the puzzle job to `0 16` and the reveal
job to `0 21`**, or both posts drift an hour.

## Going live

1. Create an X developer app for `@derabona_club` with **OAuth 1.0a user context**
   (read + write). Load credits and set a hard spending cap of **$6/month** in the console.
2. Write the credentials yourself — no agent should ever handle them:
   ```sh
   cat > ~/.hermes/secrets/derabona-x.json <<'EOF'
   { "appKey": "...", "appSecret": "...", "accessToken": "...", "accessSecret": "..." }
   EOF
   chmod 600 ~/.hermes/secrets/derabona-x.json
   ```
   The client refuses to run if the file is not `0600`.
3. Review the watchlist at `~/.hermes/profiles/engineering/state/derabona/watchlist.json`. It currently has
   **20 handles**: the original 17 verified live on 2026-09-20 plus `@sudanalytics_`,
   `@Promiedos`, and `@TigreDatos`. Fit is a judgement call — prune freely. The scout
   reads five accounts per daily run, so 20 accounts exactly fill its 96-hour freshness
   window. Adding more without increasing the run size or window makes posts age out.
4. Dry run everything first:
   ```sh
   node post-daily.mjs  --dry-run
   node post-reveal.mjs --dry-run
   node scout.mjs       --dry-run
   ```
5. Go live: `rm ~/.hermes/profiles/engineering/state/derabona/PAUSE`
6. Halt instantly at any time: `touch ~/.hermes/profiles/engineering/state/derabona/PAUSE`

## Cost control and the link policy

Verified X pay-per-usage rates: post `$0.015`, **post containing a URL `$0.200`**,
read `$0.005`, user read `$0.010`.

A real link every day costs `30 × $0.205 = $6.15/month` in posts alone — more than
the entire cap, before a single reply. So:

- **Sundays** (`DERABONA_LINK_DAYS`, default `0`) carry a full `https://derabona.club/`.
- **Every other day** ends with a bare `derabona.club`, which X still auto-links in the
  rendered post. The route to the game survives; the $0.20 charge does not.
- The reveal never carries a paid link.

`post-daily.mjs` asserts the computed cost matches the policy and refuses to post on
mismatch. The recurring worst-case plan budgets a 31-day month with five Sunday
links, five account timelines per day (X's five-post minimum), and up to five
approved replies including each approval's source-post read: **$5.985** against the
**$6.00** cap. Five replies/day remains a safety ceiling, not a funded daily target;
reserve floors stop optional replies and reads before they can starve the daily puzzle.

> Unverified: whether X bills a bare `derabona.club` as a URL is not documented.
> We assume not. **Check the first real invoice against `spend.json`** — if bare
> domains are billed at the URL rate, set `DERABONA_LINK_DAYS=` (empty) or accept
> a higher cap.

Spend priority, enforced by reserve floors — the daily post is the last thing to die:

| Priority | What | Refused above |
|---|---|---|
| 1 | daily puzzle | hard cap only |
| 2 | reveal reply | $5.80 |
| 3 | approved replies | $5.40 |
| 4 | scout reads | $5.00 |

## Reply approval

The scout **filters in code before any model call** — the blocklist (deaths, injuries,
politics, referee rows, misconduct) is a regex, not a judgement call. The 96-hour age
window matches the four-day watchlist cycle; topic keywords tag candidates but do not
hard-reject ordinary football conversation. Surviving posts are drafted with an explicit
Hermes model (`gpt-5.6-terra` via `openai-codex`, low reasoning by default) and sent to
Telegram topic for approval. Override without editing code with
`DERABONA_DRAFT_MODEL`, `DERABONA_DRAFT_PROVIDER`, and `DERABONA_DRAFT_REASONING`.
An LLM transport/auth failure is distinct from the model answering `SKIP`: if every draft
call fails, the scout exits nonzero so cron failure delivery can alert instead of reporting
a silent successful run.

The scout includes a batch-bound command: `derabona BATCH_ID 1` (or `1,3` / `skip`). Copy it from the message and change the selection. The engineering plugin accepts it only from the configured owner in the explicit Derabona chat/topic. Bare numbers do not trigger this browser integration. Approval expires after 12 hours.

Caps enforced in `approve.mjs`, not just the scout: 5 replies/day, never two to the same
account in a day, and anything ≥85% similar to a reply from the last 14 days is rejected.

## Browser reply queue — approval-first integration active

`DERABONA_REPLY_TRANSPORT=browser` makes an approved reply enter
`reply-jobs.json`; it does not claim the reply was sent. The queue is atomic JSON state
with source-post deduplication and an append-only event history. A single worker owns
`reply-jobs.json.worker.lock` while a browser is open. If a submit cannot be verified,
the job becomes `uncertain` and is never automatically retried.

The engineering runner `derabona-replies.sh check` performs a read-only session preflight.
`derabona-reply-worker` (`5b6b86fa43b2`) runs `derabona-replies.sh` every two minutes,
script-only with explicit project-topic normal/failure delivery. Approval only queues the
selected drafts; the worker publishes on its next tick. A service lock prevents parallel consumers. Automatic
admission is disabled, and the service rejects non-approved queue entries.

Runtime configuration: `~/.hermes/profiles/engineering/derabona-replies.json`.
State and PAUSE: `~/.hermes/profiles/engineering/state/derabona/`.
The old shared-state directory is retained as a migration backup, not live state.
Engineering scout/daily/reveal/metrics wrappers all use the new state. The legacy
other-profile approval hook was not modified; use the new scout's explicit command
in the engineering bot's Derabona topic, not bare-number approvals in another bot.

The local fixture tests exercise mock X only. Before any production enablement, follow
the live validation gates in the vault plan: dedicated-profile login, read-only DOM
inspection, composer-without-send, then one explicitly authorized controlled reply with
parent/author/text/public-URL readback and restart duplicate check.

## Why the X API and not Buffer

Buffer's `createPost` has no reply or thread field, so the reveal self-reply and every
scout reply are impossible through it. Buffer stays the manual composer for ad-hoc posts.

Browser-scripting `x.com` is prohibited by X's automation rules and carries account-policy risk. The browser adapter is now enabled only for explicit, topic-bound approvals; autonomous approval remains disabled.

### Controlled browser verification — 22 September 2026

One explicitly approved reply was published and read back at
`https://x.com/derabona_club/status/2102309438061416573`.
The public conversation verified the exact author/text and immediate parent
`2102276714747359520`. Queue recovery found no job eligible for resend.

The composer now waits for the innermost visible reply dialog, verifies its parent,
requires one editable element and one scoped submit button, rejects unexpected existing
text, and does not type again when the exact approved text is already present. Tests
include delayed/nested dialogs with a competing inline editor.

The controlled CLI run initially failed after submission because its sandbox did not
provide Node's URL global. The job stayed uncertain; read-only permalink reconciliation
verified the existing reply without resubmission. URL parsing now runs in the browser
realm, with a no-URL-global regression. This was a controlled run with reconciliation,
not an uninterrupted scheduled end-to-end pass.

X displayed its graduated-access notice (limited discovery/search and DM access until
normal account activity establishes trust). Do not automate account warming or evade
that restriction. At this stage the controlled test's draft projection was reconciled
explicitly. Subsequently the hook, durable reporting and queue worker were integrated:
22 test files passed against the installed release, standalone authenticated preflight
passed, the engineering gateway loaded the hook, and an empty real drain completed
silently. No new live reply was posted during integration activation. The next genuine
Telegram approval subsequently exposed the two defects documented below.

### Approval consistency repair — 22 September 2026

The first real Telegram approval was falsely blocked because an API `t.co` link
rendered as an X broadcast card. The same approval also reached the conversational
agent, which answered using unrelated old project context. No X reply was sent for
that blocked job. These were integration defects, not incorrect user approval.

- `plugins/derabona-approvals` uses Hermes's supported synchronous
  `pre_gateway_dispatch` directive and returns `skip` before agent/session dispatch.
  It enforces owner + chat + topic itself because this hook precedes Hermes auth.
  The retired `agent:start` hook is a no-op and is archived during activation.
- A Telegram message-ID receipt is consumed durably before approval mutations.
  Redelivery cannot become fresh authority; a new message can reapprove an unchanged,
  unexpired job blocked specifically by the known pre-submit `source_changed` check.
  Published/uncertain jobs never retry. No blocked job is requeued during installation.
- Approvals and skips never drain the queue. Selection is resolved in the named
  batch, not via a global draft lookup. Existing queue payloads are immutable.
- Source body and links are checked consistently in the detail view, reply dialog,
  and public-parent verification. New scouts retain API URL entities. A legacy short
  URL is resolved by one public HEAD redirect without following its destination;
  a missing trailing link must match a rendered card exactly. The dialog's separate
  decorative ellipsis is removed while preserving its full hidden URL characters.
  No blanket URL stripping or arbitrary appended-URL exception is allowed.
- Queue expiry is fixed to the original batch timestamp plus 12 hours, not enqueue
  time. It is checked when claiming work and again at the browser submit boundary.
  Uncertain and published-but-unprojected replies participate in duplicate protection.
- Outcome deduplication includes the attempt number, so a newly approved attempt
  reports its result even if it fails with the same error as the previous attempt.
- Outcomes identify the batch and draft number. Receipts, draft/queue mutation and
  worker execution share the service lock. Notifications do not authorize publication.

Verification: run every focused test using the Hermes Python environment:
`/path/to/hermes/venv/bin/python ops/test.py`. This includes actual installed Hermes
message dispatch with fixture input, a real approval subprocess and durable queue,
and real Chromium against mock X through one submit + verified parent + one history
record + one report. Telegram/X transport fixtures are not a new public publication.
`HERMES_HOME=/path/to/engineering node ops/verify-source.mjs JOB_ID` verifies the
real authenticated source and dialog without typing or submitting.

Release procedure: `python3 ops/install-release.py stage`; install dependencies and
Chromium and run `ops/test.py` inside the returned release; then `activate RELEASE`.
Activation verifies the manifest and complete installed suite, preserves state, and
leaves ingress disabled. Pause the owning engineering worker before maintenance.
Enable the plugin explicitly with `hermes --profile engineering plugins enable
derabona-approvals`; restart only that gateway, and verify registration in
`logs/agent.log`. Verify the installed runtime, exact topic delivery/failure routes
and empty drain before resuming the worker and enabling approval ingress. A disabled
maintenance drain exits silently with code zero; actual failures still fail. Never
run two consumers or re-send the blocked job as an installation test. If activation
fails, leave both gates disabled; the printed engineering backup contains the prior
config/plugin/runtime for controlled restoration, not an automatic unsafe resume.

## Data — we post the game's REAL daily

The game ships a **Daily Rabona**: a frozen 220-slot schedule (`DAILY_SCHEDULE_V1`)
that gives every player the same three careers each day, with streaks and sharing
(see `docs/adr/0021-*`). `lib/daily.mjs` recomputes the day's challenge number and
three players from that same schedule and UTC epoch, so the post always matches what
a player actually sees on the site.

`test/daily-parity.test.mjs` extracts the game's own schedule literal and `EPOCH_DAY`
from `index.html` and asserts 40 consecutive days match exactly. **If the site's daily
and our post ever diverge, that test fails** — do not weaken it.

Careers and crests come from the `roster-data` and `crest-data` blocks — 220 players,
482 crest entries, **1647/1647 club slots resolve**. Crests are base64 data URLs, so
card rendering is fully offline.

Do **not** use `research/crests.json`: it is keyed by club name and misses most clubs.

Nothing is ever generated from a model's memory. The reveal's colour line is derived only
from the dataset (repeat spells, club count) — the `position`/`country` fields are English
and must never be pasted into a Spanish post.

## Tests

```sh
node test/daily-parity.test.mjs  # our daily == the game's daily, 40 days
node test/dry-run.test.mjs       # 40-day sim, char limits, link policy, budget vs cap
node test/state.test.mjs         # atomic writes, kill switch, spend priorities, idempotency
node test/scout-filter.test.mjs  # safety blocklist, age window, topic tagging
node test/copy.test.mjs          # public copy and bot-tell rejection rules
node test/draft-failure.test.mjs # empty Hermes output is an alertable failure
node test/card-layout.test.mjs   # card never overflows, 6 to 19 clubs
python3 test/hook-guard.test.py  # portable bare-number guard; no live-profile imports
```

## Layout

```
lib/roster.mjs     roster + crest extraction from index.html
lib/daily.mjs      recomputes the game's real Rabona Diaria for a date
lib/queue.mjs      seeded, non-repeating, difficulty-mixed player order
lib/state.mjs      atomic state, kill switch, spend ledger
lib/x-client.mjs   X API v2, OAuth 1.0a signed with node:crypto, no deps
lib/telegram.mjs   thread-addressed Telegram sends
lib/draft.mjs      reply drafting via the Hermes CLI
render-card.mjs    career card PNG (Playwright, offline)
post-daily.mjs     the puzzle
post-reveal.mjs    the answer
scout.mjs          read, filter, draft, queue
approve.mjs        post an approved draft
metrics.mjs        weekly numbers
```

Live state lives in `~/.hermes/profiles/engineering/state/derabona/`; the existing API credential location is unchanged.
Neither is in this repo, and neither should ever be committed.
