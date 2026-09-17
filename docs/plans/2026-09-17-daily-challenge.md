# Daily Challenge Implementation Plan

> **For Hermes:** Execute this plan with strict RED→GREEN slices and independent spec/quality review.

**Goal:** Add a polished, bilingual “Rabona del día / Daily Rabona” mode in which everyone receives the same frozen career-and-options challenge each UTC day, can complete it once per device, maintain a completion streak, share a spoiler-free result, and return to the untouched unlimited/ranked game.

**Architecture:** Keep the existing portable `index.html` and optional ranked backend unchanged. Add a versioned daily module whose checked-in schedule freezes the complete rendered career payload, answer, hints/sources, and **exact ordered ten option labels** for every v1 challenge. Daily attempts and streaks use a separate, strictly validated `localStorage` document. Gameplay mode (`daily` or `unlimited`) stays independent from authentication identity. Daily never calls ranked mutations or changes guest/ranked decks, history, points, streaks, seen players, clocks, or backend state.

**Why no backend in v1:** The retention hypothesis is shared cadence plus sharing. Cloud sync, anti-cheat, archive, and daily leaderboards are separate products. The client and answer already ship in the portable source, so v1 must not imply server enforcement.

---

## Core version (now)

Ship the smallest complete visible Daily Rabona:

1. A mobile-first bilingual segmented control selects Daily or the existing Unlimited game; `?daily=1` selects Daily on first render and visible URLs retain only `lang` plus `daily=1`.
2. Daily remains independent from account identity. Account information may stay visible, but Daily uses only the frozen `DailyChallenge.today()` payload and local daily persistence; it never calls ranked mutations or resolves content through the mutable roster/game model.
3. Reuse the career timeline, ten option cards, three guesses, and three hints. Preserve both modes exactly when switching, with one confirmation only for an engaged unresolved round and a timer warning when relevant.
4. Show challenge number, current streak, 00:00 UTC reset, browser/device-local and non-ranked scope, plus an explicit temporary-progress message when localStorage is unavailable.
5. Completion keeps the result visible and replaces Unlimited Next/Replay controls with spoiler-free Share and Keep playing actions. Native share falls back to clipboard and reports status accessibly.
6. While Daily is visible, one 30-second interval plus focus/visibility checks detects UTC rollover. The displayed challenge is never replaced silently; the player explicitly loads the new one.
7. Preserve keyboard access, visible focus, 44 px targets, reduced motion, `file:` play, safe text rendering, and 320 px layout.
8. Focused controller/source tests cover entry, both languages, switching/state preservation, gameplay, spoiler-safe sharing, rollover, auth/ranked isolation, and URL allowlisting. Relevant existing daily/model/account/guest tests remain green.

## Future iterations

Prioritize only after observing real Daily usage and failures:

1. **Reliability hardening:** exhaustive multi-tab conflict permutations and merge/convergence protocols beyond the simple current storage reconciliation.
2. **Format evolution:** compatibility migration machinery for unreleased or future daily document/schedule formats; do not build migrations for intermediate formats that never shipped.
3. **Product learning:** consent-first Daily analytics events and a concrete retention/share dashboard after event questions are agreed.
4. **Privacy controls:** a dedicated clear-Daily-history UI and expanded privacy explanation, separate from guest Reset.
5. **More play modes:** archive/rewind for previous challenges, with an explicit effect on streaks.
6. **Online features:** opt-in cloud sync and Daily leaderboards, including server authority and abuse boundaries.
7. **Scale:** compression or indexing for genuinely large long-running history after storage size is measured.
8. **Compatibility:** an exhaustive browser/device matrix beyond focused current mobile, HTTP, and `file:` checks.

The expanded design below is retained as a reference for those iterations. It is not the MVP acceptance gate where it specifies migration machinery, exhaustive multi-tab protocols, analytics, clear-history UI, archive, cloud features, long-history optimization, or exhaustive browser coverage.

---

## Expanded design reference

### Entry and navigation

- Add a persistent bilingual two-option segmented mode control directly above the game:
  - `Diaria #N` / `Daily #N`
  - `Juego libre` / `Unlimited`
- Use real buttons with `aria-pressed`; do not fake tab semantics when both controls update the same document rather than distinct tab panels.
- The daily choice uses the existing celeste accent and a small completion check after the device has resolved today’s challenge. Unlimited remains visually available.
- Preserve existing competition and leaderboard controls in unlimited mode. In daily mode, disable/hide only competition selection, because the challenge is global across competitions; keep Account and Leaderboard access available.
- `?daily=1` deep-links directly to daily mode. The existing head-level auth callback handler must consume or scrub OAuth material before game UI starts. Mode navigation runs only against that sanitized URL and uses an explicit allowlist: the visible game URL may retain only `lang` and `daily=1`. It must never retain or resurrect `code`, `state`, access/refresh tokens, `error`, `error_description`, or callback fragments. OAuth initiated from daily redirects back with only `lang` and `daily=1` in the visible URL.
- Parse the requested gameplay mode before first gameplay render. Auth may boot in the background, but an arriving signed-in user must remain in daily until choosing Unlimited.

### Active daily hierarchy

Insert one compact status card between the mode control and career panel. It must keep the first career clue visible at a 375×667 viewport and must not overflow at 320 px.

1. Eyebrow: `RABONA DIARIA #N` / `DAILY RABONA #N`
2. Primary line: `La misma carrera para todos hoy` / `The same career for everyone today`
3. Compact metadata:
   - `Racha 4 · Récord 9` / `Streak 4 · Best 9`
   - `Nueva a las 00:00 UTC` / `New at 00:00 UTC`
4. Quiet, explicit scope line:
   - signed in: `Guardada en este navegador · no suma puntos al ranking` / `Saved in this browser · does not add leaderboard points`
   - signed out: `Guardada en este navegador` / `Saved in this browser`

Do not call the state “secure”, “verified”, “one chance”, or server-enforced. The game still has three guesses and three hints.

### Switching without silent score damage

Unlimited and daily speed clocks intentionally continue as elapsed wall time after they have started; silently hiding one would surprise users and can reduce its score.

- If the current mode has an unresolved **started** timed round, switching modes first opens an accessible confirmation dialog.
- Copy must state that the current timed round will continue while the other mode is open.
- Default focus is `Stay`; actions are `Stay` and `Switch anyway`.
- If a guest round has not started (including before consent) or the current round is terminal, switch immediately.
- Never pause ranked locally: that would contradict its server-authoritative anti-lookup clock.
- Switching back restores the exact prior guest or ranked view and timer identity. No deck, option order, guesses, hints, score, `startedAt`, pending ranked request, competition, scroll-independent state, or storage key may be rewritten.
- Daily has the same rule: leaving an unresolved started daily requires confirmation and its persisted clock keeps running.

### During and after play

- Reuse the current career timeline, ten options, three attempts, three hints, scoring formula, feedback, crest fallback, keyboard order, and sources.
- Daily state never contributes to unlimited guest lifetime totals or ranked totals.
- Hide guest-ranked disclosure/reminder cards in daily mode. Signed-in users keep their Account control and cloud total, while the daily card explicitly separates local daily points from ranking points.
- On completion, keep the answer/result visible and replace Next/Replay with:
  - primary `Compartir resultado` / `Share result`
  - secondary `Seguir jugando` / `Keep playing` (returns to the exact prior unlimited state)
- Move focus to the result heading after resolution and to the restored question after returning to unlimited.
- If UTC day changes while the page is open, do not replace an in-progress/resolved screen. An injectable `now()` source is checked every 30 seconds while daily is displayed and again on `visibilitychange`, `focus`, and `pageshow`. The first detected date change shows `Hay una nueva diaria` / `A new daily is ready` plus a button that explicitly loads it; repeated checks do not duplicate announcements or reset focus. Stop/restart the interval with the view so tests and hidden unlimited mode do not leak timers.
- Display `New at 00:00 UTC`; do not add a second-by-second countdown in v1. A minute-level refresh is unnecessary when the rollover banner detects the date change.

### Sharing

The shared payload contains no player, club, country, season, source, or competition clue:

```text
Derabona diaria #42 ⚽
✅ 2/3 intentos · 💡 1 pista
🏆 64 puntos · 🔥 5 días
https://derabona.club/?daily=1
```

English uses `Derabona Daily`, `guesses`, `hint(s)`, `points`, and `day(s)`.

- A win uses `✅ N/3`; a loss uses `❌ X/3`.
- Prefer `navigator.share({title,text,url})` where available.
- Treat native-share cancellation as cancellation, not success and not an error toast.
- Fall back to `navigator.clipboard.writeText(fullText)`, then to a hidden-selection `execCommand('copy')` fallback when needed for `file:` portability.
- Announce copy success/failure through an `aria-live` region and restore focus to the share button.

### Persistence and streak contract

Use only `localStorage['derabona.daily.v1']`; do not migrate or repurpose any `touchline.*` key.

The bounded document contains:

```text
schemaVersion: 1
scheduleVersion: 1
attempts: { [YYYY-MM-DD]: DailyAttempt }   # max 32 recent UTC dates
completionHistory: DailySummary[]          # max 400 terminal dates
stats: { currentStreak, bestStreak, lastCompletedDate }
```

Each `DailyAttempt` includes date, challenge number, schedule descriptor digest, frozen player snapshot ID, exact ordered ten option IDs/labels, one-round game state, `startedAt|null`, monotonic local revision, `updatedAt`, and completion metadata. Validate:

- strict `YYYY-MM-DD` UTC date;
- finite bounded timestamps;
- schedule/schema versions;
- expected challenge number, complete descriptor digest, answer snapshot ID, and exact option IDs/labels/order from the frozen schedule;
- exactly one deck entry and one round;
- known IDs, exactly ten unique options, answer included;
- guess/hint/status/points consistency through a daily validator bound to the frozen descriptor. Do **not** call the existing guest `CareerGame.validate` for daily saves because it dereferences mutable `PLAYERS`/`eligibleRivals`; instead extract only roster-independent round/status/scoring checks into a shared pure helper and keep guest validation behavior unchanged;
- terminal completion metadata agrees with the game outcome;
- streak/history values are bounded and internally consistent.

Invalid data for one date is discarded/recreated without erasing other valid attempts or completion history. Old unresolved attempts are retained within the 32-date bound but become read-only when their UTC day expires. A current attempt is created independently, so rollover never mutates yesterday’s snapshot.

Completion means win **or** exhaustion of all attempts. The first terminal transition for a UTC date updates streaks idempotently:

- prior completion was yesterday: `current + 1`;
- same date: unchanged;
- otherwise: `1`;
- `best = max(best,current)`.

Cross-tab writes re-read storage immediately before mutation, increment a local revision, and use a `storage` listener. Merge precedence is a total deterministic order: terminal beats nonterminal; otherwise greater valid progress (guesses, then hints) wins; every equal-progress fork—including terminal-vs-terminal—uses the lexicographically greater stable state digest rather than wall-clock order. A tab adopts the dominant snapshot before another mutation. Because localStorage has no compare-and-swap, simultaneous writes converge through storage events: receipt of a dominant snapshot rewrites it if a stale write briefly became last. Completion history and streak stats are derived from the canonical unique terminal attempt per UTC date rather than incremented additively, so divergent terminal writes produce exactly one summary and one streak application without oscillation. Tests must deliver conflicting events in both orders, reload both tabs, and prove convergence; do not claim impossible atomicity.

If localStorage is denied, use an in-memory attempt, label it `No se guardará en este navegador` / `Won’t be saved in this browser`, and never imply persistence or a durable streak.

Add a user-accessible `Borrar historial diario` / `Clear daily history` action beside the existing reset/privacy controls. It requires a bilingual confirmation and removes only `derabona.daily.v1`; the existing guest reset must continue not to clear daily data. Privacy copy must explain that persistence is scoped to this browser profile and that clearing site data or using this control removes the history.

### Frozen schedule and rendered-payload contract

- Epoch: `2026-09-17` UTC is challenge `#1`.
- Generate and commit an immutable `DAILY_PAYLOAD_V1` projection plus `DAILY_SCHEDULE_V1` as 220 explicit descriptors. The payload snapshot contains every field that daily rendering or sharing may read: answer ID/name, country, position, active years, ordered career rows with years/loan markers and stable crest asset keys, hint values, notes, and sources; it also contains every option ID and frozen display label. Runtime daily rendering must not dereference mutable `PLAYERS` records for these fields.

```js
{
  payload: { player: {/* frozen rendered fields */}, options: [{id:'...', label:'...'}] },
  payloadDigest: 'sha256-...',
  playerId: '...',
  optionIds: ['...', /* exactly 10 in displayed order */]
}
```

- Generate descriptors and projected payloads once from the shipped roster and current hard-mode distractor logic with a documented deterministic seed. Runtime must **not** call mutable roster, rival, distractor, or shuffle logic to reconstruct v1 clues, labels, hints, sources, or options. Existing shared crest bytes may be fixed without changing clue identity, but the frozen stable crest key and club label cannot change inside v1.
- The first 220 days use each playable player exactly once. Later days repeat the frozen 220-descriptor cycle while challenge numbers continue increasing; that behavior is explicit and test-covered.
- Tests pin every payload digest, the aggregate v1 schedule digest, and several date/challenge fixtures. A roster, label, career, hint, source, or matching refactor cannot silently change any released challenge.
- Any deliberate future schedule change requires `scheduleVersion: 2`, a migration decision for saved attempts, new fixtures, and an ADR amendment.

### Clock and consent contract

- Daily has a distinct persisted `startedAt`; never call guest clock persistence with daily state.
- Keep guest clock values in their original variables/storage and daily clock values in the daily attempt. Mode switching swaps the rendered source, not the stored clocks.
- Make career/round rendering consume an explicit active player/option resolver. Unlimited passes the existing `CareerGame`/`PLAYERS` resolver; daily passes its frozen payload resolver. No daily render, validation, hint, source, or option-label path may fall back to `CareerGame.playerAt`, `PLAYERS`, or `eligibleRivals`.
- Daily clock transitions are explicit:
  - HTTP/canonical entry or mode switch with analytics consent already resolved starts `startedAt` when daily becomes the active playable view.
  - With consent pending, activating daily keeps `startedAt:null`. Resolving consent while daily is still active starts it at resolution time.
  - If a qualifying gameplay interaction somehow occurs behind the consent overlay, preserve that interaction instant as `pendingActivationAt` and use it when consent resolves; the overlay itself consumes no time.
  - If the user leaves daily while `startedAt` is still null, later consent resolution must not start the inactive daily. Re-entering after consent starts it then.
  - Actual offline `file:` play has no analytics prompt and starts on daily activation.
  - A valid persisted `startedAt` always wins; reload, language, hints, guesses, consent changes, and mode switches never replace it.
- Reload, language change, hint use, wrong guesses, mode switches, and same-date cross-tab reload preserve the original `startedAt`.
- Completion freezes elapsed time/points in the terminal snapshot.

### Analytics and privacy

Consent-first allowlisted events:

- `daily_opened` — once per date per browser session;
- `daily_completed` — only on the first terminal transition, with `challenge_number`, `result`, `guess_count`, `hints`, and `points`;
- `daily_shared` — only after native share resolves successfully or copy succeeds; include `method: native|clipboard|execCommand`;
- `daily_unlimited_started` — when the post-result CTA returns to unlimited.

Do not send the share payload, streak history, raw local document, timestamps, account identity, or guesses. Update the privacy page to disclose device-local daily attempts/streaks and their retention/reset behavior.

### Non-goals for v1

- daily leaderboard or backend mutation;
- cross-device sync;
- archive/previous-day play;
- notifications or streak recovery;
- hidden answers or anti-cheat claims;
- timezone selection;
- changing unlimited/ranked scoring, hints, options, or saves.

---

## TDD implementation tasks

### Task 1 — Freeze deterministic daily descriptors and date mapping

**Files:** `tests/daily-challenge.test.mjs`, `index.html`

1. RED: add VM tests requiring the daily module and asserting epoch mapping, challenge increments across UTC boundaries, explicit unavailable behavior before the epoch, 220 unique answers, ten unique ordered options containing each answer, immutable rendered payload fields, exact cycle behavior, known date fixtures, per-payload digests, and a digest of the entire schedule.
2. Run `node --test tests/daily-challenge.test.mjs`; confirm failure because the module is absent.
3. GREEN: add a reviewed one-time generator under `scripts/` to derive the projected payloads/descriptors, then commit the explicit `DAILY_PAYLOAD_V1`/`DAILY_SCHEDULE_V1` and pure date helpers. The generator is not used at runtime. Runtime reads frozen daily data only.
4. Re-run the focused test and existing model/distractor tests.

### Task 2 — Strict local document, rollover, streaks, and clock isolation

**Files:** `tests/daily-challenge.test.mjs`, `index.html`

Implement in vertical slices:

1. RED→GREEN: strict empty document/create-today schema.
2. RED→GREEN: valid same-date reload preserves exact options, game state, and `startedAt`.
3. RED→GREEN: the daily validator accepts its frozen descriptor without consulting mutable rival logic; per-date corruption recovery preserves unrelated valid history.
4. RED→GREEN: yesterday unresolved remains read-only while a fresh current attempt is created.
5. RED→GREEN: win/loss completion updates streak exactly once; gaps reset; same-day duplicate completion is inert.
6. RED→GREEN: 32-attempt/400-summary bounds.
7. RED→GREEN: simultaneous divergent terminal snapshots from one revision converge under the total digest order in either event order, with one canonical history entry and one derived streak update; stale nonterminal snapshots cannot overwrite them.
8. RED→GREEN: denied localStorage uses an explicitly nonpersistent memory fallback.
9. Regression: legacy guest state, guest clock, account boundaries, and ranked mutations remain byte-for-byte behaviorally separate.

### Task 3 — Add mode-switching UI and accessible daily gameplay

**Files:** `tests/daily-ui.test.mjs`, `index.html`

1. RED: source/VM tests require bilingual mode labels, daily card copy, local/ranked distinction, result actions, share live region, rollover banner, 44 px control targets, and no unsafe dynamic `innerHTML`.
2. RED: controller tests require pre-render `?daily=1` selection after auth callback sanitization, an exact visible-URL allowlist of `lang` plus `daily=1`, removal/non-resurrection of every sensitive OAuth parameter, daily OAuth redirect preservation without extra callback data, no ranked mutation from daily actions, exact unlimited state restoration, guest disclosure hiding, and mode-switch confirmation only for started unresolved rounds.
3. GREEN: add compact CSS/HTML and daily orchestration while reusing career/option rendering.
4. GREEN: keep authentication identity orthogonal to gameplay mode; account boot must not kick direct-entry daily users into ranked rendering.
5. GREEN: isolate guest/daily clocks and ensure the result swaps Next/Replay for Share/Keep playing.
6. Run focused model/session/account/UI tests after each slice.

### Task 4 — Add sharing, rollover, cross-tab, analytics, and privacy

**Files:** `tests/daily-challenge.test.mjs`, `tests/daily-ui.test.mjs`, `tests/analytics.test.mjs`, `tests/privacy-page.test.mjs`, `index.html`, `privacy.html`, `docs/analytics.md`

1. RED→GREEN: exact Spanish/English win/loss pluralized payloads contain no answer/clue.
2. RED→GREEN: native share success, native cancellation, clipboard fallback, execCommand fallback, and accessible status behavior.
3. RED→GREEN: an injected clock plus 30-second timer and `visibilitychange`/`focus`/`pageshow` checks detect UTC rollover exactly once—even on an otherwise idle visible page—show an explicit new-daily action without replacing the displayed challenge, preserve focus, and clean up timers when leaving daily.
4. RED→GREEN: `storage` event adopts newer/terminal state and blocks stale overwrites.
5. RED→GREEN: allowlist and once-only analytics transitions; prove rejected properties are stripped.
6. RED→GREEN: bilingual privacy disclosure for browser-profile-scoped daily persistence and a confirmed daily-only clear action; retain existing public-contact invariants and prove the guest reset does not clear daily history.

### Task 5 — Real-browser journeys and responsive UX

**Files:** `tests/daily-challenge-checks.js`, `tests/run-browser.py` registration as needed, optional screenshot artifacts under ignored `test-results/`

Use an isolated worktree server/port and named headless session because no user interaction is required.

1. Direct `?daily=1` at 1280×800, 375×667, and 320×568.
2. At each viewport verify no horizontal overflow, first career clue visible, 44 px targets, readable bilingual status, keyboard/focus order, and no console errors.
3. Complete win and loss journeys; verify disabled guesses, hint behavior, result focus, Share and Keep playing actions.
4. Reload mid-round and after completion; assert exact option order/state/time identity.
5. Switch unlimited→daily→unlimited in both unstarted and started-round cases; verify confirmation and exact state restoration.
6. Use a mocked signed-in account response to prove daily does not issue ranked mutation requests and exiting restores the cloud round.
7. Exercise two contexts/tabs for storage synchronization and stale-terminal protection.
8. Advance/fake UTC day and verify rollover banner/new attempt/history preservation.
9. Open the actual `file:` artifact with network disabled; complete daily with image decode checks. Repeat with localStorage denied and confirm the nonpersistent label.
10. Inspect screenshots at desktop and both mobile widths, not DOM assertions alone.

### Task 6 — Document, verify, review, and publish

**Files:** `README.md`, `DESIGN.md`, `TESTING.md`, `docs/adr/0021-device-local-daily-challenge.md`, `docs/analytics.md`

1. Document schedule versioning, local-only persistence, UTC rollover, non-ranked semantics, mode-switch timing warning, share behavior, privacy, and non-goals.
2. Run focused daily tests, all Node tests, browser harness, `python3 tests/source-check.py`, native PostgreSQL suite per `AGENTS.md`, and `git diff --check`.
3. Inspect the complete diff and scan added lines for secrets, unsafe HTML, unintended backend changes, debug output, or roster drift.
4. Request independent spec-compliance review, then independent code-quality/security review. Fix and re-review every blocking or important finding.
5. Commit with `[verified]`, push `feat/daily-challenge`, create a PR, and watch CI. Do not merge or deploy without explicit authorization.

---

## MVP acceptance gate

Implementation is ready for review when the **Core version (now)** behaviors above work and the focused Daily, model, account, guest, generator, source, and diff checks pass. The frozen payload/schedule must remain unchanged. Future-iteration items are explicitly not blockers for this MVP.
