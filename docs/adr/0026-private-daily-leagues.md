# 26. Private Daily leagues with weekly trophies

Status: Accepted — implemented locally 2026-10-08 on `feat/private-daily-leagues`; not yet deployed. Builds on [ADR 0021](0021-daily-rabona-server-authoritative-for-accounts.md) (server-authoritative Daily for accounts), [ADR 0006](0006-accounts-and-ranked-progress.md), [ADR 0007](0007-automatic-animal-aliases.md), [ADR 0008](0008-standalone-leaderboard-page.md) and [ADR 0024](0024-mandatory-nickname-prompt.md). Approved design: [`docs/superpowers/specs/2026-10-08-private-daily-leagues-design.md`](../superpowers/specs/2026-10-08-private-daily-leagues-design.md).

## Context

Friends wanted a private, recurring competition on the Daily Rabona they already play. The public leaderboard is permanent and global, and DESIGN.md forbids weekly seasons on it. Nelson approved a private friends-league design: Today and This week standings, a weekly champion with trophies, joining by invitation link after Google sign-in, and new members starting at zero.

## Decision

**Leagues read the existing Daily results; they never create scores.** Live standings are derived on each read from `ranked_private.daily_results`. One Daily attempt counts independently in every league its player belongs to, and the global leaderboard and account totals are unchanged.

**Strict eligibility by membership interval.** A result counts in a league only if its server `finished_at` falls inside one of the member's half-open `[joined_at, left_at)` intervals. The period is chosen by the result's challenge `date`. Joining grants no replay and carries in nothing: not the global total, not earlier days, not results finished earlier on the joining day. Leaving or removal closes the interval immediately. Earned current-week points stay visible as *former member*, so removal cannot erase a rival's score. Rejoining opens a new interval under the same member identity, with no backfill.

**Weeks are Monday 00:00 UTC to Sunday, frozen once.** A league's first week is shortened to its creation date. Each ended week is finalized into immutable `friend_league_weeks` / `friend_league_week_entries` rows. Every rank-1 participant gets a trophy, so a zero-point tie still awards trophies. A week with no eligible result is recorded as having no participants. Finalization is lazy and needs no scheduler: it runs on the next authenticated league read or membership change, in chronological batches of 8 weeks per read (`pending` tells the client to keep reading). Primary keys and the league row lock make awards idempotent under concurrency.

**Week cutoff barrier.** Daily answers take a *shared* transaction advisory lock (class `20261008`, key = UTC week number) and then reject the write as `ROUND_NOT_FOUND` if the UTC week rolled over while they waited. Finalization takes the same lock *exclusively* before reading with a fresh READ COMMITTED snapshot. So every in-flight write of a closing week is included, and nothing can land in a frozen week. This is the only change to `public.ranked_game`: the rest of the body is copied byte-identically from `202609280001`. Mid-week Daily behaviour, scoring, clocks and streaks are unchanged.

**Lock order:** acting `accounts` row → `friend_leagues` row(s), ascending id → week lock. Daily writes take the account row, then the shared week lock, and never lock a league. Caps (10 active leagues per account, 50 active members per league) are therefore serialized without deadlock. Join and invite rotation lock the same league row, so a revoked token cannot win a race with a committed rotation.

**Account deletion** goes through a `before delete` trigger on `ranked_private.accounts`, which runs inside the Auth cascade. The trigger deletes leagues the account owns. In every other league the account ever joined, it first finalizes ended weeks through the barrier, then closes the membership and anonymizes it (`state='deleted'`, `user_id=null`). After that the cascade removes the Daily results. Archived winners show as *Deleted player*, and no runner-up is promoted. The `account-delete` Edge Function is unchanged.

**Separate boundary.** League management uses a dedicated `private-leagues` Edge Function and a service-only `public.private_leagues(uuid,jsonb)` RPC rather than the gameplay dispatcher. Both enforce strict per-action field allowlists, and every action, including invitation preview, requires a verified non-anonymous user. The RPC has its own 60/min rate bucket, idempotent receipts holding only minimal outcomes (no tokens, standings or member lists), and owner `expectedVersion` checks. Invitations are 48 CSPRNG bytes (three v4 UUIDs, 366 random bits) encoded as base64url. They are returned only to the owner and travel only in a URL fragment, which `leaderboard.html` captures into per-tab storage and scrubs before the SDK loads.

**Sign-in-only route.** `index.html?auth=friends[&invite=1]` completes Google PKCE and the mandatory nickname prompt, then returns the tab to `leaderboard.html?view=friends`. On this route the game never boots: no `start`, no `dailyProgress`, no guest or Daily clock save, restore or reset, and no analytics start. The only gameplay-endpoint calls are the read-only `progress` and the nickname `enroll`. `dailyProgress` cannot serve league screens because it creates timed rounds.

## Consequences

- DESIGN.md's ban on weekly seasons now applies to the public boards only. Private leagues are the approved exception.
- Release needs, in order: the forward migration `202610080001`, then the `private-leagues` Edge Function, both verified with disposable hosted accounts, then the Pages frontend, then real invitation/OAuth return checks. The Pages workflow deploys none of the backend.
- `ranked_private.utc_now()` exists so the native PostgreSQL tests can substitute a labelled simulated clock. In production it is exactly `clock_timestamp()`.
- Ownership transfer, notifications, realtime updates and all-time league points boards are out of scope.
