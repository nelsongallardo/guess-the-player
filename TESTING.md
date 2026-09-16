# Verification report

## 160-player roster expansion — 16 September 2026

- Integrated the reviewed 50-player research batch with the concurrently published 120-player upstream roster, preserving the ten overlapping upstream career representations and adding the remaining forty records for a final 80 Europe / 80 South America split.
- Final generated model: **160 playable players, 33 bank-only profiles, 193 candidates, 30,717 ranked rival rows and 537 memberships**. `node scripts/export-ranked-roster-forward.mjs --check`, the source ledger check and the complete distractor coverage audit pass.
- The new forward-only migration is `202609160002_expand_ranked_roster_120_to_160.sql`; the historical migration chain is unchanged. Native PostgreSQL fresh replay and exact 120-player upgrade coverage pass while preserving prior results, receipts and active rounds.
- `node --test tests/*.test.mjs` with the isolated native PostgreSQL runtime: **142 passed, 0 failed**.
- Deno Edge validation: **7 passed, 0 failed** after both function entrypoints passed `deno check`.
- Focused browser release matrix passed for HTTP and offline file play: **160 rounds**, **1,600 bilingual mobile player/layout cases**, legacy 30/40/50/60-player saves, session-backed migration, difficulty normalization, saved rivals, SEO/no-JS, guest-session boundaries, read-only leaderboard behavior and nickname suggestions.
- Supabase hosted application and public-site readback remain separate release steps and must not be inferred from these local results.

## Ninth roster expansion and the frozen-export CI gate — 16 September 2026

- Added a tenth player batch (five Europe, five South America; all ten promoted from the wrong-answer-only bank), taking the roster to 120 (60/60) - the first to follow the newly-formalized `derabona-player-addition` skill's migration policy: a new additive-only forward migration (`202609160001_ninth_roster_expansion.sql`) instead of regenerating the frozen `202609130002_ranked_roster.sql` export. Continued interrupted work from a prior rate-limited session; recovered research (sources, chronologies, both bank-promotion cases) was independently re-verified before completing the integration.
- Pushing surfaced two real gaps the new policy hadn't yet been threaded through: `tests/ranked-backend.test.mjs`'s own "roster exporter is current..." subtest still called `export-ranked-roster.mjs --check` directly (the exact "frozen export trap" the skill's step 8 warns about) - fixed by removing that one obsolete invocation and keeping the test's own already-correct database-vs-inline-model assertions (which run after every applied migration, including the new one). Separately, `.github/workflows/pages.yml`'s "Validate source and ranked roster parity" step also ran that same `--check` as a hard CI gate - fixed by dropping it from the step (renamed "Validate source identifiers"), since it is now expected to diverge after every roster-expanding batch going forward, not just this one.
- CI (native PostgreSQL included) went green after both fixes: first push failed at `tests/ranked-backend.test.mjs`'s obsolete assertion (135/136 passed), second push failed at the separate CI-level `--check` step (fixed by the workflow edit), third push passed in full. Local verification: `node --test` on every suite except `tests/ranked-backend.test.mjs` (confirmed pre-existing local shared-memory `initdb` failure, unrelated - reproduced identically both before and after this batch's changes), `python3 tests/source-check.py`, `node research/audit-distractor-coverage.mjs` (120/120 fully covered, 0 gaps). `deno` was not available in this local shell; left to CI (which passed).

## Suggest the Google name as an editable nickname default — 15 September 2026

- The owner reported two Google-sign-in complaints: the consent/access-granted email shows the raw Supabase project domain instead of derabona.club (needs Supabase's paid Custom Domains feature plus DNS and Google Cloud Console changes the agent has no login for - explicitly left for the owner to pursue later, not implemented here), and wanted Google's profile name usable on the leaderboard instead of random aliases like "Heron-4a76fa2a". See [ADR 0019](docs/adr/0019-suggest-google-name-as-nickname.md).
- `Accounts.login()` now explicitly requests `scopes:'email profile'`. On sign-in, the client captures `user_metadata.full_name`/`name`/`given_name` as a one-time, editable suggestion written into the (already-existing, already-optional) nickname field's value - never auto-submitted, never applied over an existing custom nickname (gated on the account's current nickname still matching the auto-generated `Animal-xxxxxxxx` pattern).
- Found and fixed a real bug while building the real-browser check below: the suggestion was only wired into `authChanged()` (the ongoing `onAuthStateChange` subscription), not `boot()`'s handling of `Accounts.init()`'s own initial `getSession()`/`exchangeCodeForSession()` result - which is the path an actual fresh OAuth redirect completion (and any returning visit with an already-persisted session) actually takes on `index.html`. Refactored into a shared `captureGoogleNameSuggestion()` called from both. `leaderboard.html` did not have this bug (its `load()` already routed every session source through `setIdentity()`).
- New `tests/nickname-suggestion-checks.js` (registered in `tests/run-browser.py`): mocked-SDK real-Chromium check on both pages - a fresh sign-in pre-fills the field with the Google name without sending anything to the API; a returning account with an existing custom nickname is not overwritten; a guest sees no suggestion. Verified directly against the actual bug above (failed before the `boot()` fix, passed after).
- `node --test` on `model.test.mjs`, `points-faq.test.mjs`, `account-boundaries.test.mjs`, `leaderboard-page.test.mjs`, `seo.test.mjs` (66 tests): all passed - no existing assertion depends on the old "never publish your Google name" copy. The existing `accounts-checks.js`'s own Google-metadata fixture (`full_name:'MUST NEVER PUBLISH'`, an existing `enroll` API network-call assertion) was reasoned through rather than executed end-to-end here: its mocked default alias (`Otter-4821`, 4 characters) doesn't match this change's `{8}`-hex-character default-alias pattern, so its blank-nickname-stays-blank behavior is unaffected; confirmed the same pre-existing local Chromium driver limitation noted in the entry below (`Pointer crosses trigger to hoverable tooltip content`) blocks a full local run of that suite regardless of this change (reproduced identically by stashing this change out and back in) - left to CI's `playwright-cli` run as the definitive check of the full existing suite.
## Guest versus ranked disclosure — 15 September 2026

- Added a persistent bilingual signed-out status above the career and a one-time, nonmodal reminder after the first resolved guest round. Both explain that guest score is tab-local, unranked and non-transferable; both sign-in actions open the existing Account dialog rather than starting OAuth. Portable `file:` play remains immediate and omits unusable online-account prompts. See [ADR 0020](docs/adr/0020-guest-ranked-disclosure.md).
- The first canonical-site guest clock now waits while the initial analytics-consent choice obscures play, then starts normally. Existing persisted clocks still win. No analytics events, backend contract, migration or Supabase deployment changed.
- Full local Node verification passed **124/124 tests**, including the 15-test real isolated-PostgreSQL suite with simulated Supabase Auth roles. Source identifiers and ranked-roster export parity passed. The focused real-Chromium disclosure suite passed **26 checks** across desktop/mobile, English/Spanish, Account-dialog routing, reminder persistence and announcement, consent-clock fairness (including behind-banner interaction, post-boot cross-tab consent resolution and a real two-tab consent change during deferred startup), and actual network-disabled `file:` play. The analytics suite and updated guest-session suite also passed; the latter completed all **110** offline careers without repeats and replaced its stale 70-player expectation.
- The existing account suite still stops at its pointer-crossing tooltip assertion; that exact failure reproduced against unchanged `origin/main` on a separate baseline server. A later competition-selection assertion also blocked an in-memory diagnostic with only the pointer assertion omitted. The offline and mobile-language suites still stop at their existing Chromium image `decode()` `EncodingError`, already recorded against unchanged upstream below. No failing checked-in assertion was removed or weakened.
- `tests/run-browser.py` accepts an optional `PLAYWRIGHT_SESSION` environment override so an isolated release session can avoid a stale workspace socket; its default repository-name session is unchanged.


## Row-major paged career grid, replacing column-major zigzag — 15 September 2026

- The owner reported that even after the same-day up-right connector correction below, the desktop two-row grid's down-then-diagonal zigzag still read as confusing, unlike the ordinary left-to-right, wrap-down order used everywhere else in the app (mobile included). Requested exactly that instead, capped at two rows with horizontal scroll for the overflow. See [ADR 0018](docs/adr/0018-row-major-paged-career-grid.md) (supersedes ADR 0017's column-major approach and the connector correction immediately below).
- `renderCareer()` now groups clubs into pages of up to eight in the DOM; each page is an ordinary row-major four-column, two-row grid (`.timeline-page`), identical in principle to mobile's own grid. Desktop lays pages side by side and scrolls horizontally between them; mobile makes the page grouping invisible to layout (`display:contents`) so it stays pixel-identical to ADR 0016.
- Real-Chromium verification (`playwright-cli` not installed in this environment; drove an already-cached compatible Chromium build directly via the `playwright` npm package instead, same adaptation prior sessions used): Diego Milito's six-club career (one page) renders as a plain two-row grid with `➜` connectors only, suppressed at the row wrap and the end — `["➜","➜","➜",none,"➜",none]`, identical at both 375px and 1128px. The longest roster career (more than one page) renders as two four-column pages side by side at 1440px, with genuine horizontal overflow (`scrollWidth 1460 > clientWidth 1120`) and no connector at the page-8 boundary. Screenshots inspected directly for chronology and clipping.
- `node --test` on every suite except `ranked-backend.test.mjs` (98 tests): all passed, including the rewritten `career-arrow-layout.test.mjs`. `ranked-backend.test.mjs` could not run locally (`shmget`/shared-memory exhaustion, confirmed pre-existing and caused by unrelated long-running processes on this machine, not this change) — left to GitHub Actions CI, a clean runner, as the definitive validator. `python3 tests/source-check.py` and `node scripts/export-ranked-roster.mjs --check` both passed.
- `mobile-language-checks.js`'s all-image `decode()` `EncodingError` and a `game-loading-checks.js` mocked-SDK timing assertion both reproduced identically against the unchanged pre-redesign commit (`0a263a6`, stashing this change out and back in to confirm) — pre-existing, not introduced by this change, consistent with the same `EncodingError` already logged in the entry immediately below.

## Desktop two-row career connector correction — 15 September 2026

- Reproduced the reported Diego Milito route on fetched upstream `120914e` at 1128px: cards were placed chronologically top-to-bottom in each column, but inherited horizontal arrows made each bottom card appear to point to the next column's bottom card, visually skipping Real Zaragoza and Inter Milan.
- Added a desktop-only up-right connector for non-final even/bottom cards. The route now renders `Racing Club ↓ Genoa ↗ Real Zaragoza ↓ Genoa ↗ Inter Milan ↓ Racing Club`; the mobile four-column grid keeps its existing row-major right arrows.
- TDD evidence: `tests/career-arrow-layout.test.mjs` failed against the unchanged implementation because the even-card override was absent, then passed after the CSS correction. The dedicated real-Chromium `career-arrow-checks.js` also failed against an unchanged `HEAD:index.html` artifact and passed against the served worktree at 1128×700 and 375×667. The fixed screenshot was inspected for chronology, clipping and overlap.
- All **103 non-PostgreSQL Node tests passed**, plus ranked-roster export parity and source-identifier checks. The focused `mobile-language-checks.js`, `seo-checks.js` and `offline-checks.js` still stop at their all-image `decode()` assertion with `EncodingError`; the same failure reproduced against unchanged `HEAD:index.html`, so it is not introduced by this CSS-only fix. No assertions were removed or weakened. Native PostgreSQL, Deno, hosted site, OAuth and Supabase were not exercised for this frontend layout correction.

## Hosted migration deployment — 14 September 2026

- Owner connected their own Supabase CLI session (`supabase login`, browser OAuth, no credentials passed through the agent session) and linked project `derabona` (ref `iaebecfxjwjzkapqdeha`). `supabase migration list` showed the live database at `202609130003` (schema + aliases), with `202609140001`/`202609140002` (speed decay, third hint) never yet deployed.
- Before assuming anything, queried the live database read-only (`supabase db query --linked`): 60 players, 119 candidates, 218 memberships, 7,080 rivals, and critically **13 existing `results` rows across 2 real accounts** - the database had last actually been deployed to at 60 players, well behind the 80-player roster already committed to `index.html`/`202609130002_ranked_roster.sql` (that file's content had been regenerated in place across later roster batches without ever being re-deployed, silently drifting from what production actually had).
- Diffed a full re-computation of the current 80-player roster (same logic as `scripts/export-ranked-roster.mjs`) against the live snapshot: zero mismatches for any of the original 60 (labels, country, position, memberships all byte-identical - no silent drift), 20 new players / 35 new candidates / 67 new memberships / 3,060 new rivals rows, every foreign-key reference resolvable. Wrote `202609140003_roster_sync_60_to_80.sql` as a strictly additive migration (verified: touches zero existing rows) rather than assuming the frozen roster migration could just be re-run.
- Previewed with `supabase db push --linked --dry-run` (listed exactly the 3 pending files, nothing else) before applying. Owner approved; applied with `supabase db push --linked --yes`. Read back afterward: `migration list` shows all 6 files as `local === remote`; live counts now 80 players / 154 candidates / 10,140 rivals; **the 13 results and 2 accounts were unchanged**; `ranked_private.points(3, 2000)` returns 40 and `points(0, 12000)` returns 25, confirming the new hint cap and speed-decay curve are live.
- Found during this process: applying `202609140003` against the project's own local ephemeral-Postgres test harness (which always replays every migration from empty) failed with a duplicate-key error, since `202609130002`'s current file content already includes the same 20 players. Added `on conflict do nothing` to every insert in `202609140003` so it's a safe no-op on a from-scratch replay while remaining exactly what was actually applied to the real, already-60-player production database. Re-verified: `node --test tests/ranked-backend.test.mjs` 15/15 pass against a fresh local cluster; `node --test tests/*.test.mjs` 116/116 pass; `supabase migration list`/`db push --dry-run` confirm no drift after editing the already-applied file's content (the CLI tracks applied migrations by timestamp, not a content checksum).
- Did not touch GitHub Actions secrets or the `supabase-deploy.yml` workflow in this pass - migrations were applied directly via the owner's authenticated CLI session instead.

## Speed-decay retuning (ADR 0009) — local + CI verification, 14 September 2026

- Retuned `pointsFor`'s `timeFactor` (grace 5s→2s, floor-at 30s→12s, floor value 50%→25%) and its server-side mirror `ranked_private.points()` (new migration `202609140001_faster_speed_decay.sql`, `create or replace function`, not an edit to the already-applied schema migration). Also updated the "How to play" dialog's scoring bullet (both languages) with a static bar-chart example, and synced nelson's `987f431` points FAQ prose/worked example (was 15s/1 hint/64pts under the old curve, now 12s/1 hint/20pts).
- `node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs tests/guest-session.test.mjs tests/points-faq.test.mjs tests/ranked-backend.test.mjs` — **80 tests, 0 failures**, including a real isolated-Postgres run (`tests/ranked-backend.test.mjs`, 15/15) exercising the SQL/JS `pointsFor` parity sweep. `python3 tests/source-check.py` and `node scripts/export-ranked-roster.mjs --check` also passed.
- First push (`dd87acf`) went out without running `tests/ranked-backend.test.mjs` locally (no Postgres binaries had been confirmed yet) and broke CI: two hardcoded expectations there still assumed the old 50% floor. Fixed in `05b9b59` and re-verified against a real local Postgres cluster before pushing again — CI is the authority on the ranked-backend outcome for that commit, but the fix commit was validated locally first this time.
- Real-Chrome check (system Chrome via Playwright, `127.0.0.1:4173`) confirmed the new bar-chart example in the rules dialog renders correctly in both languages and its illustrated values (100/63/25) exactly match `CareerGame.pointsFor(0, {1000,7000,15000})` computed live in the page — screenshots taken, no console errors.
- No leaderboard/UI layout changes beyond the rules-dialog addition; no live OAuth or hosted-database verification (this change doesn't touch auth), and the live Supabase database still needs the new migration applied separately — pushing to `main` only deploys the static site.

## Bilingual points FAQ — local verification

- Added an expandable “¿Cómo funcionan los puntos?” / “How do points work?” entry immediately after the how-to-play explanation. Covers wins/losses, hint ceilings, time decay/rounding, a 64-point example, ranked timing, one-time results and overlapping competition totals. Adjacent how-to copy now distinguishes ten guest/practice choices from five ranked choices and the guest-only club-years hint. No gameplay, styling, backend, analytics or saved-state changes.
- Based on fetched upstream `5a1a128` in the isolated `content/points-faq` worktree. Spanish/English FAQ tests first failed because the entry was absent; the example already matched the actual model. Final Node command passed **65 tests, 0 failures**: `node --test tests/points-faq.test.mjs tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs tests/guest-session.test.mjs`. Ranked-roster parity, source identifiers and `git diff --check` passed.
- Served this worktree on `127.0.0.1:4187`, verified the HTTP body byte-for-byte, and used a fresh named headless Chromium session. Ran `tests/seo-checks.js` through Playwright CLI with only the base URL and offline artifact path adapted in memory. The full focused suite stops at its existing all-image `decode()` assertion with `EncodingError`; the same error reproduced using the unchanged upstream HTML **and** unchanged upstream suite. The checked-in assertion remains intact.
- A separately labelled diagnostic run excluded only that image-decode assertion in memory. All five cases passed: JavaScript-disabled Spanish, default Spanish, explicit English, saved English and network-disabled `file:` play. FAQ checks cover both translations, keyboard/pointer expansion and collapse, widths 320/375/1280, worked-example visibility and unchanged completed-round state after reading the FAQ and switching languages. This is not a claim that the full browser suite or image checks passed.
- Evidence is in ignored `test-results/points-faq-browser.json`, `points-faq-browser*.log` and `points-faq-baseline-browser.log`. No production publication, live OAuth or hosted backend verification was performed for this copy-only change.

## Loading feedback and early club preview — 13 September 2026

- Measured production `0488d19` before edits: badges are embedded in the 796,632-byte encoded game HTML; fresh anonymous club-grid observations were 182–325ms. Public leaderboard API reads took 461–549ms across three samples, plus an earlier 849ms sample. These are unthrottled anonymous lab samples, not signed-in/field measurements or before/after speed guarantees. See `docs/seo.md`.
- Added visible bilingual game and table loaders, decorative placeholders, status/busy semantics, reduced motion, and explicit cleanup. The game previews only the current identity's authoritative start receipt before the existing confirming progress read finishes; controls remain locked. A compact 50px confirmation strip keeps the first career row wholly visible at 375×667. No score-clock, backend, roster, crest, account-service or analytics changes.
- Leaderboard credentials now have an overall five-second deadline; a stalled SDK/session read falls back to public results with an account warning. No private caching or speculative duplicate board reads. No-JS shows an explanation instead of an endless spinner; early script-enabled markup still paints the loader.
- Final configured native PostgreSQL + Node run: **113 passed, 0 failed**. The reviewer's unconfigured PostgreSQL/psql setup failures are not product failures and are not represented as a successful independent backend run.
- Final **seven focused Chromium suites passed**: game loading (**31 checks**), leaderboard (**56**), accounts (**58**), guest session (**16**), SEO, analytics and offline. Deferred SDK/API tests are explicitly mocked, including waits, timeouts, failure/retry, late identities, confirmation locks, completion and no-JS. Actual offline `file:` guest play also passed.
- Real local HTML transfer throttled to 200kB/s + 150ms latency: **four checks passed**, including visible mobile loading before any crest exists and cleanup when playable. Immediate CDP capture verified the actual pending frame; normal Playwright screenshot waits for fonts can outlast this state.
- Local leaderboard against the **real public API**: **14 checks passed**. Held actual responses briefly to inspect the pending state (no fabricated data), then compared real rows/points and verified cleanup, filters and widths 320/375/768/1280. Mobile screenshots inspected for overlaps and visibility.
- Independent final SPEC **PASS** and QUALITY **APPROVED** after fixing the no-JS issue. Source identifiers and ranked-roster parity passed. A completed-round browser assertion now waits for the terminal notice rather than the panel being hidden (which also occurs during loading); it additionally verifies the loader is gone.
- Evidence: ignored `test-results/loading-final-node.log`, `loading-final-browser.json`, `loading-timing-before.json`, `loading-download-smoke.json`, `loading-board-local-smoke.json`, `loading-approved-review.md` and screenshots. Publication and exact live readback remain separate release gates; historical broad-browser baseline limitations below are unchanged.

## Standalone leaderboard — 13 September 2026

The ranking overlay was replaced by a lightweight, directly addressable `leaderboard.html` and primary Play / Leaderboard navigation. ADR 0008 records the read-only architecture and engagement design. Existing backend scoring and alias policies are unchanged.

- Final parent Node run: **113 passed, 0 failed**, including the real native PostgreSQL suite, existing account boundaries, and three new standalone-page/configuration/deployment checks. The new static checks first failed against the absent page and old packaging.
- Six focused Chromium suites passed: leaderboard, accounts, guest session, analytics, SEO and offline. The standalone suite includes **32 assertions**, with explicit SDK/API mocks: signed-in/off-page position, no-result versus failed/offline reads, retry, one anonymous retry for expired bearer, signout and stale identity responses, URL filter/history/language, actual Account CTA and game-save preservation. This is not hosted Google OAuth evidence.
- Independent local-page smoke used the **actual public Supabase API**, compared returned names/points and row count with the rendered table, exercised filters/reload/language/game navigation, and passed **15 checks** with no runtime errors. No account mutation or round start was made by the leaderboard.
- Desktop/mobile screenshots inspected. Final real-data table begins at about **569px on 375×667**; 320px and 375px table headers fit without word breaks, and 320/375/768/1280px layouts have no horizontal overflow. Mocked long-nickname tests and desktop visible-row geometry are separate assertions.
- Spec review caught false no-result copy during signed-in network failure; a regression failed before the fix and passed afterward. Final independent spec and quality review both passed. Only successful authenticated `own: null` means no result; failures do not imply lost points.
- Source-identifier and ranked-roster parity checks passed. Roster, crests, game model, locale data, account service, callback scrubber and analytics script bodies remain byte-identical to the previous release. No Supabase migration or OAuth configuration change is needed.
- Evidence: ignored `test-results/leaderboard-final-node.log`, `leaderboard-final-browser.json`, `leaderboard-local-smoke.json`, screenshots, and `leaderboard-final-review.md`. The prior full-suite baseline limitations below remain; six focused suites are not a claim that every historical browser suite passes. Pages publication and exact live readback are separate release gates.

## Automatic animal aliases — 13 September 2026

The owner removed manual public-nickname enrollment. Migration `202609130003` gives accounts stable random-animal aliases automatically, backfills existing accounts and preserves custom nicknames and results. Optional custom naming is explained by a bilingual keyboard/pointer/touch tooltip; analytics consent is unchanged.

- Parent full Node run: **110 passed, 0 failed**, including **15 real PostgreSQL tests** for legacy backfill, exact history preservation, concurrent creation/collisions, stable aliases, optional rename and unchanged gameplay boundaries.
- Five focused Chromium suites passed: accounts, guests, analytics, SEO and offline play. SDK/API mocks are explicit in the account suite; separate native SQL and hosted API checks supply backend evidence.
- Migration 003 was applied and read back in the hosted registry. Existing custom nicknames and fingerprints of the owner's prior results were unchanged; `nelson` retained **176 points from two results** at verification.
- A disposable real Supabase Auth account received an alias automatically on its first progress request; repeated progress retained it. No-result account stayed absent, and a completed result appeared on the actual public board **without an enroll request**. Optional rename persisted. Account deletion and exact Auth/database/public-board readback confirmed cleanup. This was an admin-created disposable identity, not a new interactive Google-login test.
- The owner has now signed in through Google; hosted account state showed the Google provider and saved results. Original release-era unverified-OAuth wording below is historical, not a claim that login is still unobserved.
- Reports: ignored `test-results/animal-alias-node.log`, `animal-alias-browser.json`, `animal-alias-hosted.json`; ADR 0007 supersedes manual enrollment in ADR 0006. The release-era protected AGENTS.md edit was not applied then; its stale manual-enrollment wording was corrected during the standalone leaderboard follow-up.

## Accounts and ranked progress — local evidence, 13 September 2026

**Interactive Google OAuth remains unverified.** Fresh parent verification passed all 88 Node tests (including native PostgreSQL), five focused browser suites (guest, accounts, analytics, SEO, offline), seven Deno HTTP tests and production Edge entrypoint type checks. Final account-boundary fixes were then verified with **107/107 Node tests**, including 19 new source-extracted boundary regressions, plus the account browser suite with the implicit-token rejection case. These fixes remove unsolicited URL session imports and bind private state/mutations to authenticated identity across account changes. Hosted tests used a real disposable admin-created email Auth identity, not Google OAuth: enrollment-only exclusion, start/hint/answer, authoritative score readback, exact idempotent retry, global and every applicable membership board, then actual account deletion and exact Auth/database/public-board readback all passed. The disposable account and test results were removed. Hosted configuration readback confirmed Google enabled, email/anonymous signup disabled, both functions ACTIVE and both migrations applied. Evidence: ignored `test-results/accounts-final-node.log`, `accounts-final-browser.log` and `accounts-hosted-verification.json`.

Existing worker reports under ignored `test-results/` record:

- `backend-spec-fixes.md`: native PostgreSQL **12/12 passed**, after a red run demonstrating enrollment-only board leakage. Tests cover service-only access, server scoring, immutable first results, concurrency, versions/idempotency, canonical memberships, no-result exclusion, zero-point losses, ties/pagination, exhaustion, rate budgets and deletion cascades. Supabase Auth schema/roles are simulated; PostgreSQL itself is real.
- `backend-contract.md`: earlier **11/11** SQL run, **7/7** Deno HTTP tests using injected Auth/RPC/deletion mocks, entrypoint type checks with the pinned real SDK, and exporter parity (60 players, 119 candidates, 7,080 rival rows, 218 memberships, six competitions). The later 12-test report supersedes its SQL count, not its hosted-verification caveat.
- `frontend-spec-fixes.md`: **9/9** guest storage tests, **46** account browser checks and **16** guest browser checks passed, including offline file play and zero external guest requests. Account SDK/API are route-mocked; this is not Google login or database verification. Conflicting linked legacy snapshots remain intact, and public reads safely fall back anonymously without allowing mutations to do so.
- `accounts-spec-review.md`: fresh **9/9** guest and **12/12** SQL tests, plus explicitly mocked ad-hoc auth transport probes; spec-stage PASS only, not production approval.

Reproduction commands, API/security boundaries and hosted release gates: [docs/leaderboards.md](docs/leaderboards.md). CI runs all `tests/*.test.mjs` with native PostgreSQL (including `tests/ranked-backend.test.mjs`'s database-vs-inline-model assertions after every applied migration), source-identifier checks, Deno entrypoint checks and HTTP tests on branch pushes/PRs/manual runs. It does not run browser suites, and it does not gate on `node scripts/export-ranked-roster.mjs --check` (deliberately expected to diverge from the frozen export after a roster-expanding batch - see 2026-09-16 below); only validated non-PR `main` runs deploy the six static assets, including `privacy.html`, and never Supabase.

Remaining checks include actual Google sign-in/cancellation/session refresh and Google-authenticated cross-device authoritative progress. Recovery-control clicking and exhaustive auth-event race coverage were not established by the focused browser report. Historical browser failures and source-era storage assertions below remain historical evidence, not a claim that today's full regression is green. ADR 0006 supersedes their device-local persistence scope.

## Consent-first analytics

- `tests/analytics.test.mjs` starts with failing pre-implementation tests and covers opt-in, withdrawal, load races, storage denial, DNT/offline suppression, property filtering and disabled SDK features.
- `tests/analytics-checks.js` exercises the real CDN SDK with intercepted ingestion: zero requests before consent/after decline, consent persistence, accepted anonymous identity across reload, actual gameplay hooks, cleared identity after withdrawal and continued gameplay with a blocked SDK. Interception is not backend-ingestion evidence.
- SEO, branding, 60-round offline gameplay, source identifiers, origin matching and saved-choice migration remain in the focused regression set. Legacy full-suite limitations below are not removed.
- Live verification artifacts, including the marked PostHog query readback, belong under ignored `test-results/`; see [analytics docs](docs/analytics.md).


## SEO and initial-load performance — 13 September 2026

- 45 model/social-preview/SEO checks passed; source-identifier checks passed. Six new SEO tests were first run red against the published baseline.
- Focused browser suites passed: SEO, branding, full 60-round offline gameplay/storage denial, origin/contemporary rivals, and saved-choice migration. The new SEO suite covers five cases (no-JS, Spanish default, explicit English, saved English, offline).
- The full pre-existing suite is not green. Replay score reset, longest-career viewport fit, replay visibility and legacy-progress denominator assertions also fail against unchanged upstream `f59fe51`; paired fresh-context diagnostics are in `test-results/seo-browser-audit.json`. No failing baseline assertions were deleted or loosened.
- All 156 crest sources and metadata retained; 3,060,219 bytes of PNGs reduced to 743,566. Visually inspected all pairs and corrected a transparency issue before finalizing.
- Lighthouse baseline live mobile performance 31/100, basic SEO 100/100, FCP/LCP 16.8s and CLS 0.494. Local candidate testing measured zero startup CLS; local timings are not directly comparable to production compression. See [SEO notes](docs/seo.md).


## Spanish messaging preview — 13 September 2026

- Added four `tests/social-preview.test.mjs` checks: static Spanish metadata without JavaScript, OG/Twitter agreement, actual PNG format/dimensions/size, and deployment of the image. All four initially failed on the unchanged feature baseline and passed after implementation.
- `node --test tests/model.test.mjs tests/social-preview.test.mjs`: 39 passing tests. Source-identifier checks passed.
- Focused real-browser smoke: Spanish/English × HTTP/offline file (four contexts), plus a JavaScript-disabled crawler context fetching the PNG. Five cases passed. This was not a rerun of the full browser suite.
- Rendered the 1200 × 630 PNG in Chrome and visually reviewed the final image: complete logo, correct accents, no clipping or overlaps.
- Confirmed CSS, embedded assets, data and runtime scripts are byte-for-byte unchanged from the current upstream baseline. Only head metadata changed in `index.html`.
- Platforms cache previews independently; serving valid metadata and image does not verify each platform's native cached rendering.


## Saved Henry choices repaired — 13 September 2026

The user’s screenshot showed Henry with Zidane, Scholes, Guðjohnsen and Totti. Reproduced that exact answer array on the public site: fresh generation produced France-start contemporaries, but the load path accepted and rendered the saved older array verbatim. Preserving every saved option set prevented the matching fix from reaching untouched resumed rounds.

Added idempotent `refreshUnstartedRivals` to the actual load path. It changes only weaker origin/era option sets in the current round with **zero guesses and zero hints**. Compatible options, engaged/completed rounds, original deck, scores and history remain unchanged. No save deletion, game reset or new control.

- RED browser reproduction: `Untouched saved Henry must not retain Scholes after reload`.
- Added four model regressions: exact screenshot repair, repeated-reload stability, engaged-round preservation and prior earned-score preservation.
- Added `saved-rivals-checks.js`: exact saved screenshot through real reload in both languages over HTTP and offline `file:`, real existing results history, and guessed/hinted saves.
- **35 model tests and all eight browser suites passed**, plus the source-identifier checks. The four saved-round browser cases passed in English/Spanish over HTTP and offline file URLs with no browser errors. Previous sections are historical and their unconditional preservation policy is superseded only for untouched incompatible rounds.


## Researched contemporaries — 13 September 2026

- Added **59 wrong-answer-only profiles**, researched on 12 September, with literal source URLs, retrieved evidence excerpts and scope caveats. The existing 60 playable careers, crests, translations and competition counts are unchanged.
- `python3 research/assemble-distractors.py` → 59 unique profiles across 8 reviewed batches; missing/draft records, unsupported ledger URLs and missing independent source domains fail the build.
- `python3 research/embed-distractors.py` → curated bank embedded exactly; no runtime Wikipedia/API dependency.
- `node research/audit-distractor-coverage.mjs` → **60/60 targets covered, zero gaps**: each has at least four same-system peers with overlapping careers and debut differences of at most eight years.
- `node --test tests/model.test.mjs` → **31 passing tests**, including 60,000 option samples, strict origin/era tiers, bounded randomness, researched bank eligibility and preserved historical saves.
- `python3 tests/run-browser.py` → **all seven suites passed**: HTTP game, offline file, bilingual/mobile, no difficulty selector, 30/40/50/60-save compatibility, brand, and actual Maradona/contemporary interactions.
- `python3 tests/run-browser.py --offline-only` → all 60 rounds completed with the network disabled, saved-game reload and denied-storage play passing; zero network requests/browser errors.
- `python3 tests/source-check.py` → original 60-player source and re-audit integrity passed.
- Mobile visual review at 375px: no clipping or overflow; all five Maradona names legible; no difficulty selector.

### Regressions and fixes

The pre-change model dropped a clearly stronger Messi rival through uniform top-eight sampling; the seeded failure now passes with bounded `[0,3)` score noise. Maradona's four researched peers are Daniel Bertoni, Jorge Valdano, Ramón Díaz and Osvaldo Ardiles, not Argentina-start 1990s debutants.

The new browser regression initially timed out because a rejected answer's accessible name correctly changes to `Name, incorrecto`. The assertion now checks that actual post-guess label and disabled state. Game behavior was correct; no UI workaround was added.

A fixture generated from the published pre-bank 60-player model verifies that an existing Maradona round retains its original names, wrong guess and hint through reload and completion. Future rounds receive the expanded pool; existing rounds are never silently rewritten.

### Reproducible evidence

- `test-results/contemporary-coverage.json` — complete per-target coverage audit.
- `test-results/browser-results.json` — seven-suite browser report.
- `test-results/offline-results.json` — separate offline-only report (does not overwrite the seven-suite report).
- `test-results/derabona-origin-maradona.png` — mobile screenshot, intentional rejected answer state.
- `research/verified-distractors.json` and its per-profile `evidenceFile` — full curated bank and citation trail.

The bank is not a promise of 59 extra playable timelines. A player who memorizes the target roster could still learn that bank-only names cannot be correct; promoting them to fully audited playable careers is separate work.


## Origin-first rivals — 12 September 2026

Reproduced the user's Maradona/La Liga scenario with a failing seeded regression: the old matcher admitted a Spain-start rival into an Argentina-start career. The new matcher uses strict starting-football-system tiers before era/career ranking; selected competition is a small preference, not a hard wrong-answer filter. No roster, crest, score, deck-selection or saved-round migration changes were made. See [ADR 0002](docs/adr/0002-origin-first-distractors.md).

Actual final commands:

- `node --test tests/model.test.mjs`: **26 passed, 0 failed**, including the imported origin regression suite.
- `python3 tests/source-check.py`: **60 player sections / 198 literal source URLs; passed**.
- `python3 tests/run-browser.py`: **all seven suites passed**, no exclusions; run started at `2026-09-12T22:15:40.115886+00:00`.

The Maradona/La Liga model regression generates 500 seeded rounds; every rival starts in the Argentine senior system. The browser regression generates another 100, retains the 37-player La Liga deck, reloads exact choices, and completes hint/answer/Next with unchanged scoring. The rendered example offered Saviola, Crespo, Batistuta and Riquelme beside Maradona—not Henry or Mendieta. All-player/all-competition model checks cover origin-tier boundaries and mandatory retention of closer matches in thin pools. Messi, Cambiasso, Keane, Giggs, Swansea and Monaco classification exceptions are explicit tests.

Existing 60,000 randomized option samples, offline/localStorage-denied play, bilingual playthroughs, 600 responsive cases, brand checks and 30/40/50-player save fixtures remain green. Current saved rounds are deliberately not rerolled; the fix takes effect on newly generated rounds. Sparse origin groups and older eras still need more researched peers; the matcher does not guarantee equal difficulty for every legend.

## derabona rebrand — 12 September 2026

Rebranded the site with an original rabona-player SVG mark, an embedded favicon, a lowercase wordmark, editable SVG/PNG logo exports and a paper/ink/celeste UI. English and Spanish titles/copy are updated; Spanish brand copy uses Argentinian voseo. Repository URL and legacy storage keys are unchanged.

Actual verification:

- `node --test tests/model.test.mjs`: **21 passed, 0 failed**.
- `python3 tests/source-check.py`: **60 player sections; 198 literal source URLs; passed**.
- `python3 tests/run-browser.py`: **all six browser suites passed**, with no diagnostic exclusions. Run started at `2026-09-12T21:47:30.800098+00:00`; detailed output is in ignored `test-results/browser-results.json`.
- HTTP and offline local-file 60-round journeys, denied localStorage, English/Spanish play, Hard selection, competition/reset/history flows and published 30/40/50-player save compatibility passed.
- **600** player/language/viewport cases plus **14** header/branding cases passed. The previously failing longest-career initial 375×667 screen assertion now passes unchanged after mobile branding/layout adjustments.
- Desktop/mobile and exported-logo screenshots were visually reviewed. No blocking overlap, clipping or logo defects remained; the mobile “¿Quién es?” stays together. PNG export is 1280 × 320.
- Primary text/background contrast pairs were calculated: ink/paper 13.50:1, muted/paper 5.70:1, deep-blue/paper 6.24:1, light labels/ink 9.60:1 and celeste/ink 8.66:1. These are selected text pairs, not a claim of a complete accessibility audit.
- Direct source comparison verified the roster, crest data, model, career translations and UI behaviour after the copy block are unchanged from the pre-rebrand commit. SVG XML and local documentation links were validated.

During the tight responsive roster loop, Chromium rejected `decode()` on an already-loaded PNG. Yielding one animation frame after rendering each career resolved it; every image decode and every visibility assertion remains enforced. No tests were removed or weakened. Native Safari/Firefox remain outside the tested browser matrix.

The sections below are historical verification records, not outstanding failures in this rebrand run.

## Selector removal — 12 September 2026

Removed the difficulty control, explanatory status text and English/Spanish help instructions. All fresh games, future rounds, competition changes, reset and replay use the **already-published Hard behaviour: four rivals sampled from the closest eight**. Existing rounds are preserved exactly; saved Easy/Medium preferences no longer act as invisible settings. The published 60-player roster, competition controls, speed/hint scoring, results history and reset behaviour are retained.

Executed `node --test tests/model.test.mjs`, `python3 tests/source-check.py` and `python3 tests/run-browser.py` after integrating published commit `2b9457f`. All **21 model tests** and source checks passed. The full browser runner is **not entirely green**: its initial-screen longest-career assertion fails at 375×667. Running that same test against an unchanged HTML artifact from `origin/main` reproduced the identical failure. The layout and failing assertion are deliberately left unchanged.

The five browser scripts were then run individually through the same Playwright CLI session. HTTP, offline, selector and legacy-expansion suites passed unchanged. For the mobile/language diagnostic run only, the independently reproduced initial-screen assertion was omitted **in memory**, not from the checked-in test; all remaining checks passed. Results are saved locally in `test-results/selector-final-results.json`.

- Selector absence and updated help verified in both languages; 60-round Hard playthrough in each language.
- Easy, Medium, Hard and pre-difficulty saves retain exact existing rounds, guesses, hints and score; subsequent rounds use Hard.
- All competition choices and reload preserve Hard; changing competitions preserves results history; reset clears results and starts Hard. Reset confirmation is captured in-page for this handler test because the CLI owns native dialogs.
- HTTP, offline local-file play, denied localStorage, 600 responsive player/language/width cases and published 30/40/50-player save compatibility passed, subject to the separately documented initial-screen limitation.
- Updated legacy browser assertions to account for the published competition migration and hint-adjusted scoring, without changing either production behaviour.

## Prior roster-expansion verification (historical)

Executed on **11 September 2026** using Node and real Chromium/Playwright. The final second-expansion browser run began at `2026-09-11T17:32:15.009118+00:00`.

## Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py
uv run --with pillow python research/verify_expansion2_crests.py
```

Environment: Node v22.22.1; Python 3.9.6; playwright-cli 0.1.13. Pillow verification runs through uv.

## Passed

- **Model/data/localization: 15 tests, 0 failures.** Exactly 50 unique players, 25 Europe / 25 South America. All 50 Spanish note sets and every national-team/position hint have translations. UI footer/help counts are asserted in both languages.
- **50,000 randomized option samples** check five distinct choices, one correct answer and no identical-career distractors. Another **15,000 seeded samples** verify difficulty ranking and shuffling.
- **HTTP:** 50 rounds, 140 embedded crest-source assets, 38 wins, 3,800 points and best streak 3. Attempts, all hints, wrong-answer lockout, Next, recap, reload and replay passed.
- **Offline file:** 50 rounds and 5,000 points with network disabled. All crest assets decoded. File save/reload and deliberately denied localStorage passed. No network requests or browser errors.
- **Spanish:** 50 rounds, alternating wins/losses, 25 wins. Language switching preserves progress; URL preference, saved preference and Spanish browser detection passed.
- **Every difficulty/language combination:** 300 completed rounds across Easy/Medium/Hard in English/Spanish. Pending changes after hints, reload, replay and offline operation without storage passed.
- **Real published-save compatibility:** both `tests/legacy-save.json` (30 players) and `tests/legacy-save-40.json` (40 players) reload byte-for-byte, finish their original decks and replay into 50 while preserving Hard. The 40-player fixture was generated by executing published model `cbec929e40305535dc0d83dbbd4848defbb691e7`: round six, 500 points, one hint and one incorrect guess. No fixture was invented as plausible output.
- **Responsive:** 500 player/language/viewport cases across 320, 375, 430, 580 and 768px. No horizontal overflow; every club crest visible in the grid. The longest careers have 16 spells; the initial 375×667 Spanish screen also passed. Desktop 1440px retains independent horizontal timeline navigation; answer targets remain at least 58px/65px high.
- **Crests:** Pillow decoded all second-expansion artwork. A contact-sheet review found no identity issue. A small-screenshot Panathinaikos concern was rejected after the full-resolution crest clearly showed ΠΑΝΑΘΗΝΑΪΚΟΣ and a trefoil. Toledo was retrieved from its actual club-page infobox because ESPN has no logo for that team.
- **Citation plumbing:** 50 source sections / 178 literal source URLs and 50 audit sections / 174 cited URLs, matched to their ledgers. Ten new audit records each contain evidence from at least two independent domains. Previous forty curated player records are unchanged.

## Findings fixed during this run

- Extended saved-deck validation to retain both published 30- and 40-player games.
- Updated stale footer/help totals and added regression assertions.
- The desktop back-scroll test encountered a 1px rounding remainder after a fractional-width scroll step. Its assertion now matches the existing UI’s 1px boundary tolerance; no production navigation behavior was weakened.
- Giuly’s unresolved Lyon B record was not imported; independently researched Joe Cole replaced him.

## Limits

Software/source consistency tests do **not** establish historical truth. Career evidence and remaining date/scope qualifications are in [DATA_AUDIT.md](DATA_AUDIT.md), including Riise’s overlapping Monaco reserve/first-team order and earlier roster qualifications. Professional playing spells exclude youth, coaching, unused registrations and post-retirement amateur football.

Browser testing covers Chromium, not native iOS Safari or Firefox. Current/source-era club marks are not historical season-specific artwork. Raw articles, screenshots and execution JSON remain local under ignored research/test-result paths; only the standalone HTML is deployed.

## Update — 12 September 2026: competitions and third player batch

Added a competition-organization layer (Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão, plus All Players) and a third ten-player batch (Fernando Torres, Xabi Alonso, Thierry Henry, Iker Casillas, Andrea Pirlo, Diego Maradona, Javier Mascherano, Cafu, Marcelo Salas, Rivaldo), bringing the roster to 60 (30 Europe / 30 South America).

### Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
```

Environment: Node v24.18.0, Python 3.11.4. Neither `playwright-cli` nor a Python `playwright` install was available in this environment, so `tests/run-browser.py` (and the browser-driven `difficulty-checks.js`/`expansion-checks.js`/`mobile-language-checks.js` it runs) could **not** be executed here. Those three files were still updated for the new 60-player/30-30 counts and a fourth legacy-save fixture, but their assertions are unverified until someone runs the suite with a real browser.

### Passed

- **Model/data/localization: 20 tests, 0 failures.** Exactly 60 unique players, 30 Europe / 30 South America. Every player carries a recognized competition tag. All 60 Spanish note sets and every country/position (including the new Chile and Midfielder/Defender combination) have translations, and all five competition labels are present in both languages.
- **60,000 randomized option samples** (unscoped) plus a targeted competition-scoped sample check five distinct choices, one correct answer, no identical-career distractors, and — when a competition is active — distractors drawn from that competition first, with a verified fallback to the full pool when a synthetic scoped pool has fewer than four candidates.
- **`create(difficulty, competitionId)`** produces a deck matching each competition's current pool size (Champions League 59, Premier League 30, La Liga 37, Argentine Primera División 19, Brasileirão 13, All Players 60) and falls back to All Players for an unrecognized id instead of erroring.
- **`validate()`** accepts a legacy save with no `competition` field (treated as All Players), and rejects a deck whose length or membership no longer matches its stated competition.
- **Real published-save compatibility:** `tests/legacy-save.json` (30 players), `tests/legacy-save-40.json` (40 players) and the new `tests/legacy-save-50.json` (50 players, generated directly against the pre-expansion 50-player roster with the same first-five-wins-then-one-in-progress-round shape as the existing 40-player fixture) all reload, finish their original decks, and replay into the current 60-player All Players deck while preserving Hard difficulty.
- **Citation plumbing:** 60 source sections / 198 literal source URLs and 60 audit sections / 194 cited URLs, matched to their respective ledgers. The ten new records each cite at least two independent domains (Wikipedia plus National Football Teams).
- **Crest assets:** all 16 newly embedded crests (Sagan Tosu, Real Sociedad, SD Eibar, New York Red Bulls, Porto, Brescia, Reggina, Napoli, Hebei China Fortune, Juventude, Universidad de Chile, Santa Cruz, Mogi Mirim, Bunyodkor, São Caetano, Kabuscorp) were fetched from their Wikipedia infobox crest files, checked for real PNG magic bytes and non-zero dimensions (the same check `model.test.mjs` runs on every embedded asset), and confirmed to be the only unused-vs-used assets in `CREST_ASSETS` (156 total, all referenced). No pixel-level visual review of the new crests was performed — that step used Pillow contact sheets in the prior expansion and could not be repeated without it here.

### Not verified in this environment

- No real-browser playthrough of the competition picker, the "change competition" flow, or the summary-panel button — the UI wiring was reviewed by reading the generated script and syntax-checking every `<script>` block with Node's `vm.Script`, not by clicking through it.
- No responsive/accessibility pass at the five mobile widths for the new picker dialog or the ten new players' career timelines.
- No visual crest review for the 16 new assets.
