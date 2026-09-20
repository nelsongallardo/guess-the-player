# derabona X growth automation

Automated daily career puzzle on [@derabona_club](https://x.com/derabona_club), plus
approval-gated replies. Built to gain followers before any creator outreach.

Plan and rationale: `projects/derabona/2026-09-20-x-follower-growth-automation.md` in the Obsidian vault.

## Status

**PAUSED.** `~/.hermes/state/derabona/PAUSE` exists, so every job exits immediately
without posting, reading or spending. Credentials are not configured yet.

## What runs

| Job | Schedule (London) | What it does |
|---|---|---|
| `derabona-daily-puzzle` | `0 17 * * *` | Posts `Carrera del día #N` with a career-card image |
| `derabona-daily-reveal` | `0 1 * * *` | Self-replies with the answer on that thread |
| `derabona-scout` | `30 13 * * *` | Drafts reply candidates, sends them to Telegram for approval |
| `derabona-weekly-metrics` | `0 9 * * 1` | Follower count, streak, spend, gate progress |

### ⚠️ BST hazard

Schedules are **London time**; the plan is written in Buenos Aires time.
`0 17` London = 13:00 BA **only during BST**.

**When BST ends on 25 October 2026, change the puzzle job to `0 16` and the reveal
job to `0 0`**, or both posts drift an hour.

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
3. Review the watchlist at `~/.hermes/state/derabona/watchlist.json`. It is seeded with
   **17 handles, each verified live on 2026-09-20** (the account exists, follower count
   is real). Fit is a judgement call — prune freely. Tiers: `1` = Paren la Mano cast
   (origin story), `2` = nostalgia/retro/career-database accounts (best format fit),
   `3` = mass-reach news feeds (high noise, the blocklist rejects most of their posts).
4. Dry run everything first:
   ```sh
   node post-daily.mjs  --dry-run
   node post-reveal.mjs --dry-run
   node scout.mjs       --dry-run
   ```
5. Go live: `rm ~/.hermes/state/derabona/PAUSE`
6. Halt instantly at any time: `touch ~/.hermes/state/derabona/PAUSE`

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
mismatch. Verified 30-day budget: **$5.54** against the **$6.00** cap.

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
politics, referee rows, misconduct) is a regex, not a judgement call. Surviving posts get
one drafted reply each, sent to Telegram General (thread 2156).

Reply `1`, `1,3`, or `skip`. The hook at `~/.hermes/hooks/derabona-approvals/` only acts
when `drafts.json` has a pending batch under 12 hours old — otherwise a stray number in
conversation would publish a live reply.

Caps enforced in `approve.mjs`, not just the scout: 5 replies/day, never two to the same
account in a day, and anything ≥85% similar to a reply from the last 14 days is rejected.

## Why the X API and not Buffer

Buffer's `createPost` has no reply or thread field, so the reveal self-reply and every
scout reply are impossible through it. Buffer stays the manual composer for ad-hoc posts.

Browser-scripting `x.com` is prohibited by X's automation rules and is not used anywhere here.

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
node test/scout-filter.test.mjs  # blocklist/allowlist, blocklist wins ties
node test/card-layout.test.mjs   # card never overflows, 6 to 19 clubs
python3 test/hook-guard.test.py  # stray-number guard on the Telegram hook
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

State lives in `~/.hermes/state/derabona/`; secrets in `~/.hermes/secrets/derabona-x.json`.
Neither is in this repo, and neither should ever be committed.
