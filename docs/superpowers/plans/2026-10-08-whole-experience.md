# Whole-experience UX implementation plan

> **For agentic workers:** Use superpowers:executing-plans with isolated parallel file ownership, followed by independent integrated review. The owner approved the design and authorized implementation and merge; do not add another approval stop for this execution plan.

**Goal:** Connect arrival, play, results, friends and return visits through predictable navigation and explicit timed starts.

**Architecture:** Keep the portable inline game and separate online standings page. Add a read-only ranked overview, gate game activation behind an explicit action, and preserve account/navigation intent. No scoring, roster, membership eligibility or historical-result changes.

**Tech stack:** Vanilla HTML/CSS/JavaScript, PostgreSQL, Supabase Edge/Deno, Node 22, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-10-08-whole-experience-design.md`.

## Global constraints

- Work only in `/Users/openclaw/projects/guess-the-player-wayfinding`, based on fetched `origin/main`.
- Preserve offline single-file play, English/Spanish, ten answers, three attempts/hints, current score curve, clocks for engaged rounds and all saved results.
- Persistent labeled navigation: Play / Groups / Leaderboard, Spanish Jugar / Grupos / Clasificación. Utilities: Help / Ayuda, Account / Cuenta (Sign in / Iniciar sesión when signed out). Remove visible global points from shared mastheads; preserve their internal account projection.
- Shared nav HTML contract: `<nav class="site-nav" aria-label="..."><a id="nav-play" ...>...</a><a id="nav-groups" ...>...</a><a id="nav-board" ...>...</a></nav>`. Use actual links and `aria-current="page"` on current destination. Header help control `id="site-help"`; same visual rules on both pages. Root handles final parity.
- Groups creation URL: `leaderboard.html?view=friends&create=1&lang=es|en`. Preserve a draft in per-tab `derabona.group-draft.v1`; never put its name or invite token in OAuth URLs. Auth friends route retains `create=1` alongside existing invite intent. Account login for Play returns to its ready state, never automatically starts gameplay.
- Account overview API: `{action:'overview'}` returns `{profile,progress,daily,career}`. Existing profile/progress shapes; daily `{date,status:'ready'|'playing'|'finished',completed,totalPoints,correctCount,previous:null|{date,totalPoints,correctCount}}`; career `{status:'ready'|'playing'|'resolved'|'completed',competition:null|string}`. No career/Daily clues, options, player IDs or new round creation. Native tests establish repeated reads leave gameplay tables unchanged.
- Existing `dailyProgress` retains legacy semantics for old clients. No migration history edits, no new tracking, no live test-account/league/game mutations without explicit need.

## Review focus

1. A direct URL, reload, language change, OAuth return or group navigation must not silently start a new round.
2. Account failures, sign-out or identity change must never expose previous user's data or fall back to ranked-looking guest state.
3. Back/Forward and interrupted/uncertain requests must preserve engaged clocks and idempotency, not permit score farming.
4. Create/invite intent must survive auth/storage failure honestly; no auto-create on callback and no invitation token leakage.
5. Completed/partially completed Daily and UTC rollover must retain correct status and post-join score semantics.

## Task 1 — Safe overview (backend worker)

Files: new `supabase/migrations/202610080002_play_overview.sql`, `supabase/functions/_shared/http.ts`, relevant native PostgreSQL/Edge tests. Do not edit frontend files.

- [ ] Inspect current dispatcher, projection and Daily storage; confirm above response shape or notify coordinator before changing it.
- [ ] Add behavioral native tests: overview before starting returns ready and no gameplay writes; during Daily and after completion returns correct counts; repeated overview leaves existing timestamps/versions/results/receipts unchanged; previous day is separate; no unstarted clues/IDs; unauthorized and extra-key Edge requests rejected.
- [ ] Implement forward migration and Edge allowlist using existing authorization/rate boundaries. Do not copy/rewrite scoring logic unnecessarily.
- [ ] Run relevant native suites and Edge tests, plus fresh replay/upgrade. Example boundary: `assert.equal(before.rounds, after.rounds); assert.equal(status.daily.status, 'ready'); assert.equal(status.daily.completed, 0)`; compare complete row snapshots for existing state.
- [ ] Report exact contract, test commands/counts and deployment prerequisites. Commit only owned files.

## Task 2 — Play and complete journey (game worker)

Files: `index.html`, new focused `tests/site-wayfinding.test.mjs` and `tests/site-wayfinding-checks.js`, existing affected game tests only as required for intentionally changed contracts. Do not edit leaderboard/backend.

- [ ] Read spec and trace all boot/start/clock/auth/URL entrypoints. Write behavioral coverage for overview without starts, activation, return after completion, auth intent and preserved clocks.
- [ ] Add stable navigation and utilities, responsive compact Play overview, visible Create group/existing-group links and explicit Unlimited alternative; no game clues before Start.
- [ ] Consume overview exactly as above for accounts. Guests derive status from existing saves without starting clocks. Ensure mandatory nickname confirmation precedes any timed start.
- [ ] Add result-to-groups continuation, direct retry, contextual hint consequences and corrected bilingual help. Preserve scoring/account/guest/privacy contracts.
- [ ] Preserve create intent through the existing auth-only friends path. Navigation and mode URLs must distinguish ready versus an already activated view; browser restoration cannot create a new scoring window.
- [ ] Test local mocked account state and guest HTTP/file flows. Assertions include `expect(startCalls).toEqual([])` before activation, same round/start timestamp after navigation, completed Daily visible on root revisit. Run existing relevant Node/browser suites and report precise baseline exceptions.
- [ ] Commit owned files and document frontend state/route behavior for integration.

## Task 3 — Groups and public standings (board worker)

Files: `leaderboard.html`, relevant leaderboard/league UI tests. Do not edit index/backend. Coordinate exact header/navigation CSS with root after implementing.

- [ ] Implement stable navigation, labeled account/help, remove duplicate public/friends switch; Groups active within group details.
- [ ] Use group terminology consistently in both languages. Visible Create group for signed-out/empty/populated states; allow draft name before auth and explicit submission after return. Capture/sanitize `create=1` through route allowlists, preserve draft in per-tab storage.
- [ ] Keep standings primary, weekly filter compact, zero played distinct from absent result, trophy counts and prior-week winners visible. Preserve owner-only invitation and all backend membership/history semantics. No Play Daily CTA inside group detail.
- [ ] Add direct helpful recovery, joined confirmation, invitation full/completed/partial-day copy and explicit public score scope. Keep destructive actions confirmed and secondary.
- [ ] Test create intent, signed-out draft restoration, return URLs and Back, signed-in list/detail, language/mobile. Use real local league bridge for writes, never live groups. Commit owned files.

## Task 4 — Integrate, verify and release (coordinator)

- [ ] Compare both mastheads/navigation at 320, 375 and desktop widths; inspect screenshots and actual user journeys. Verify served files are this checkout.
- [ ] Run Node 22 relevant/full suite with worktree-local PostgreSQL dependency, source checks, Deno checks/tests, focused browser flows and existing guest/account suites. Track known baseline failures with evidence; do not alter unrelated tests to hide failures.
- [ ] Independent review of full branch against spec; repair material findings and rerun affected checks.
- [ ] Add ADR, align README/DESIGN/TESTING/AGENTS changed contracts and deployment evidence. Update Obsidian project state and verify its commit/push.
- [ ] Inspect upstream again and integrate concurrent changes. Create PR, pass CI. Inspect hosted migration registry and deploy compatible backend/Edge before merging frontend (already authorized scope); if unavailable, keep frontend unmerged and report concrete dependency.
- [ ] Merge without another approval request as authorized, verify Pages artifacts and read-only hosted overview/nav, leave Hermes login untouched. Report what is verified separately from real two-account OAuth or target-user usability testing.

## Execution record

- 2026-10-08: Design approved. Existing clean task worktree contains only audit document. Native coordinated execution with three workers owning independent files; root owns integration, review and release. User's implementation authorization supersedes the skill's redundant plan approval prompt.
