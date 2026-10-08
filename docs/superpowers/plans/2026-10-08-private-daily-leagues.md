# Private Daily Leagues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent private friends leagues that rank members on the existing signed-in Daily results (Today / This week), archive completed weeks with trophies, and join via invitation links.

**Architecture:** One additive migration adds `ranked_private.friend_league_*` tables, a service-only `public.private_leagues(uuid,jsonb)` RPC, a week cutoff barrier in the Daily write path (`create or replace public.ranked_game`, otherwise byte-identical) and an account-deletion `before delete` trigger. A new `private-leagues` Edge Function reuses `_shared/http.ts` with its own validator. `leaderboard.html` gains a Friends view; `index.html` gains a sign-in-only route (`?auth=friends`) that never initializes gameplay.

**Tech Stack:** PostgreSQL 17 (plpgsql), Supabase Edge (Deno/TypeScript), inline vanilla JS/CSS, Node test runner, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-10-08-private-daily-leagues-design.md` (approved 2026-10-08).

## Global Constraints

- Additive migrations only; never edit an applied migration. New file: `supabase/migrations/202610080001_private_daily_leagues.sql`.
- Leagues read `ranked_private.daily_results` only; never write results, rounds, streaks or receipts of `ranked_game`.
- League/auth routes MUST NOT call `start` or `dailyProgress`.
- Eligibility: result counts iff `finished_at ∈ [joined_at, left_at)` of one of the member's intervals; period chosen by result `date` (UTC). Week = Monday 00:00 UTC.
- Ties: SQL `rank()`; every rank-1 participant in a finalized week gets a trophy; empty weeks recorded, no trophies.
- Limits: 10 active leagues/account, 50 active members/league, name 3–40 chars trimmed, no control chars; 60 req/account/min; body ≤ 8,192 bytes; pages ≤ 50.
- Invite token ≥ 32 random bytes, base64url, fragment `leaderboard.html#join=<token>`; never in query strings, analytics, logs, receipts or OAuth redirect URIs.
- Bilingual (es default, en), keyboard/focus, reduced motion, mobile, text-only rendering of names.
- Guest offline `file:` play unchanged; no framework/build step.

## Review Focus

1. A Daily answer committed at Sunday 23:59:59.9 UTC while finalization runs at Monday 00:00 — expect it counted in the closed week exactly once, never lost, never written after close (Task 1 barrier tests).
2. A member who finished today's Daily before joining — expect `Finished before joining · 0 league points`, no replay, zero week points (Task 1 eligibility tests, Task 4 UI copy).
3. Removed member replaying an old join/rotate receipt or using an old invite — expect generic unavailable, no private data (Task 1).
4. Account switch mid-request on the Friends view — expect previous identity's response discarded and private DOM cleared (Task 4 browser checks).
5. Storage denied during an invitation that needs OAuth — expect explicit recovery message, never a fake join (Task 4/5 browser checks).

---

### Task 1: Database migration and RPC (native PostgreSQL TDD)

**Files:**
- Create: `supabase/migrations/202610080001_private_daily_leagues.sql`
- Create: `tests/private-leagues-backend.test.mjs` (own isolated cluster, port 55441)

**Interfaces (produces):**
- `ranked_private.utc_now() returns timestamptz` (volatile, `clock_timestamp()`); test suite may `create or replace` it with a table-backed simulated clock — labelled simulation.
- `ranked_private.week_start(d date) returns date` (Monday).
- `ranked_private.week_lock_key(ws date) returns integer`; advisory class id `20261008`.
- `ranked_private.finalize_league(lid uuid, max_weeks integer) returns boolean` (true ⇒ more pending).
- `public.private_leagues(verified_user_id uuid, request jsonb) returns jsonb`, actions: `list, preview, standings, history, memberWins, manage, create, rename, join, leave, remove, restore, rotateInvite, delete`.
- Error codes: `UNAUTHORIZED, INVALID_REQUEST, INVALID_LEAGUE_NAME, LEAGUE_UNAVAILABLE, INVITE_UNAVAILABLE, MEMBER_NOT_FOUND, FORBIDDEN, OWNER_CANNOT_LEAVE, LEAGUE_LIMIT, LEAGUE_FULL, NICKNAME_REQUIRED, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, RATE_LIMITED`.

Lock order (documented in SQL): acting `accounts` row FOR UPDATE → `friend_leagues` row FOR UPDATE (ascending id when several) → exclusive week advisory lock. Daily writes: `accounts` row → shared week advisory lock (then date revalidation). Account deletion: `accounts` row (deleted) → leagues → week lock.

- [ ] Step 1: write failing tests (all against real SQL): create/list/preview/join/leave/remove/restore/rotate/delete/rename; outsider/removed/revoked invites → identical generic errors; caps incl. concurrent joins (Promise.all of psql processes); idempotent replay and conflict; forbidden fields; strict post-join eligibility (pre-join same-day results excluded, partial day counted, no backfill across absence); one result in two leagues, global `leaderboard`/`progress` totals unchanged; Today statuses; weekly finalization (unique, joint, zero-point ties, empty, shortened first week, multi-week catch-up bounded at 8/request with `pending`, concurrent finalization unique); barrier (in-flight Daily write blocks finalization and is included; a write whose date rolled over after waiting is rejected); deletion (owned leagues gone, history anonymized as deleted, no runner-up promotion, pending ended weeks finalized before results vanish); read-only proof (exact `rounds`/`daily_rounds`/`daily_results`/`receipts`/`daily_streaks` snapshots unchanged across every league action); upgrade from current predecessor preserves existing rows and receipt replay.
- [ ] Step 2: run `node --test tests/private-leagues-backend.test.mjs` with embedded PG env → FAIL (function missing).
- [ ] Step 3: implement the migration.
- [ ] Step 4: re-run new suite and existing `tests/ranked-backend.test.mjs` → PASS.
- [ ] Step 5: commit `feat(leagues): private Daily league schema, RPC and week cutoff barrier`.

### Task 2: Edge Function boundary

**Files:**
- Modify: `supabase/functions/_shared/http.ts` (add `'private-leagues'` mode, `validateLeague`, league statuses; optional `leagueRpc` dependency)
- Modify: `supabase/functions/_shared/supabase.ts` (`leagueRpc` → `admin.rpc('private_leagues',…)`)
- Create: `supabase/functions/private-leagues/index.ts`
- Modify: `supabase/config.toml` (`[functions.private-leagues] verify_jwt=false`)
- Modify: `.github/workflows/pages.yml` deno check list if it enumerates entrypoints
- Test: `tests/private-leagues-edge.test.ts`

- [ ] Step 1: failing Deno tests — anonymous rejected for every action (incl. preview); identity/score/date/trophy/owner fields rejected; per-action allowlists; token shape; name bounds; pagination ≤50; 8 KiB limit; `no-store`; error mapping; ranked-game behaviour unchanged.
- [ ] Step 2: `deno test tests/private-leagues-edge.test.ts` → FAIL.
- [ ] Step 3: implement; `deno check` all three entrypoints.
- [ ] Step 4: run both Deno suites → PASS.
- [ ] Step 5: commit.

### Task 3: Sign-in-only route on `index.html`

**Files:** Modify `index.html` (`auth-callback` block: detect `?auth=friends` before scrubbing and keep `auth`/`invite` params; `account-service` `login()` preserves them; `game-ui`: skip guest clock persistence, render, `RankedUI.boot()` and analytics start when `AuthRoute.active`; new `<section id="auth-route">` + script `auth-route`; `NicknamePrompt` completion hands back to `AuthRoute`).

Flow: no session → auto `Accounts.login(lang)` (redirect `?lang=xx&auth=friends[&invite=1]`); OAuth error → translated cancelled state with Try again / Back; session → `progress` (read-only) → mandatory nickname prompt if `!nicknamePrompted` → `location.replace('leaderboard.html?view=friends&lang=xx[&invite=1]')`.

- [ ] Step 1: failing Node unit (vm-extracted blocks) asserting callback scrub keeps `auth=friends`, login redirect contains `auth=friends` and never a token; browser check that the route issues only `progress`/`enroll` and writes no `touchline.*` keys.
- [ ] Step 2–4: implement, pass, plus existing `account-boundaries`/`guest-session` suites.
- [ ] Step 5: commit.

### Task 4: Friends view in `leaderboard.html`

**Files:** Modify `leaderboard.html` (`board-url-privacy`: capture `#join=` into `sessionStorage['derabona.league-invite.v1']` or `window.__pendingInvite`, keep `view/league/period/lang/competition/invite` query; markup sections `#view-tabs`, `#friends-view`, dialogs `#league-confirm`, `#league-history`, `#league-wins`; new script `<script id="friends-leagues">` exporting `window.FriendsLeagues` for the app script's identity hooks).

Behaviour: Public/Friends tabs (URL `view=friends`); list + Create; league view with Today/This week (default week; `period` in URL only when explicitly chosen), standings table (rank, nickname + `🏆 n` button, points, progress/days), Former member label, Not played / In progress n/3 / Finished / Finished before joining · 0 league points; Past winners dialog; owner management (rename, copy/replace invite, remove/restore, delete) with confirmation dialog; member Leave; join preview card with zero-start explanation; unsigned → link `index.html?auth=friends&lang=xx[&invite=1]`; refresh on entry, period change, `visibilitychange`→visible, Refresh button; responses bound to (identity, league, period) epoch; pending mutation key/body retained on network failure; identity change clears state.

- [ ] Step 1: failing Playwright suite `tests/friends-leagues-checks.js` (registered in `run-browser.py`) driving the real page against a local bridge (Task 5) or route mocks for denied-storage/network-error cases.
- [ ] Step 2–4: implement, pass `leaderboard-checks.js`, `accounts-checks.js`, `nickname-suggestion-checks.js`.
- [ ] Step 5: commit.

### Task 5: Local end-to-end bridge

**Files:** Create `tests/leagues-bridge.mjs` — Node server (type-stripped import of the real `_shared/http.ts` handler) whose `rpc`/`leagueRpc` call the real local PostgreSQL as `service_role` and whose `getUser` maps test bearer `test-<uuid>` to a simulated Auth user. Browser suites route `**/functions/v1/*` to it. Labelled: real handler + real SQL, simulated Auth/OAuth.

### Task 6: Docs, privacy and copy

**Files:** `README.md`, `DESIGN.md` (qualify weekly-season prohibition as public-board rule), `docs/leaderboards.md`, `docs/adr/0026-private-daily-leagues.md`, `privacy.html` (both languages), account deletion confirmation in `index.html` + `leaderboard.html`, `TESTING.md` (actual evidence), `AGENTS.md` file map/deploy list pointer.

### Task 7: Full verification and handoff

Run: new + existing PG suites, all Node tests, Deno check/test, `python3 tests/source-check.py`, focused browser suites + offline suite, `git diff --check`; update Obsidian `projects/derabona/state.md` with path-scoped commit/push.
