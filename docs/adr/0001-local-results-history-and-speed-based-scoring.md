# 1. Local results history and speed/hint-based scoring

Status: Accepted — implemented 2026-09-12. The speed-decay constants below (5s grace, 30s floor, 50% floor value) are superseded by [ADR 0009](0009-speed-decay-anti-lookup-tightening.md) (2s/12s/25%); the formula and hint-penalty mechanism remain as described here.

## Context

Touchline is a single `index.html` file with no server, account or database. The
only state that survives a visit is whatever the browser's `localStorage`
holds under `touchline.career.v1`: the in-progress (or just-finished) deck. As
soon as a player replays or starts a new competition, that game is gone —
there is no record of *how you've done over time* on this device, and every
correct answer has always been worth a flat 100 points regardless of how it
was won (instant recall vs. three hints and 25 seconds of thinking score the
same). The team's near-term plan is to move to a real backend + database, but
that isn't happening yet, and the ask right now is: track a user's results
locally, give them a way to reset that, and make scoring reward genuine
skill (speed, not needing hints) rather than just "did you eventually pick
the right button."

## Decision

### 1. A separate, additive local history ledger

Add a second `localStorage` key, `touchline.history.v1`, holding an array of
finished-game summaries:

```json
{
  "finishedAt": "2026-09-12T18:04:00.000Z",
  "score": 4620,
  "wins": 55,
  "completed": 60,
  "best": 12,
  "difficulty": "hard",
  "competition": "la-liga"
}
```

One entry is appended the moment a game reaches `state.finished` (guarded by
a `state.historyLogged` flag so reloading a finished recap, or replaying,
never double-counts). The list is capped at the last 100 entries
(`HISTORY_LIMIT`) so it can't grow unbounded on a device someone plays on for
years.

This is deliberately a **second, independent key**, not a field bolted onto
`touchline.career.v1`:
- The current-game key's job is "resume exactly where I left off" and is
  already covered by an existing, tested contract (`DESIGN.md` "Persistence"
  acceptance line, `tests/model.test.mjs`'s legacy-save tests). Mixing
  long-lived history into that object would put a slow-growing array in the
  hot path of every single save, and risk that contract.
- It fails independently: if history writes ever throw (quota, private
  browsing, corruption), the current game is completely unaffected, and vice
  versa.
- It's the natural shape for the eventual backend migration described below.

### 2. A visible, always-reachable reset control

A "Reset my results" button lives in the page footer — outside the game
panels, so it's present regardless of whether someone is mid-round or on the
recap screen ("cada usuario que visite la página" was explicit: this is not
hidden behind a settings menu or only offered at the end of a game). It asks
for confirmation (`window.confirm`, since this is a purely local, walk-back-able-only-by-losing-data action, not something that needs a custom modal),
then clears **both** `touchline.career.v1` and `touchline.history.v1` and
starts a fresh game. There is no partial reset (e.g. "clear history but keep
today's game") — one button, one clearly-scoped action, matching the size of
the feature.

### 3. Scoring: 100 points, reduced by hints and by answer speed

Each round is still worth up to 100 points, now computed as:

```
points = round(100 × (1 − 0.2 × hintsUsed) × timeFactor(elapsedMs))
```

- **Hints**: each of the up to 3 hints taken reduces the *ceiling* by 20%
  (0/1/2/3 hints → 100%/80%/60%/40% max), regardless of how fast the answer
  came — taking a hint is a deliberate, visible trade a player makes, so it's
  a hard cap, not something speed can buy back.
- **Speed**: `timeFactor` is 1.0 (full value) for any answer inside a 5-second
  grace window from when the round became active, decays linearly down to a
  0.5 floor by 30 seconds, and stays at that floor beyond that — a player who
  needs real time to study an unfamiliar career never drops to 0, but genuine
  instant recognition is rewarded over a slow, exhaustive process of
  elimination.
- Combined, a round is worth between 20 (3 hints + slow) and 100 (no hints +
  fast) points. A **lost** round still awards 0, unchanged.

Where the elapsed clock lives matters and was the trickiest part of this
decision:

- **It is not persisted.** The model's `answer(state, name, elapsedMs)` takes
  `elapsedMs` as a plain argument — the `CareerGame` model has no `Date.now()`
  dependency at all, stays a pure function of its inputs, and is exactly as
  easy to unit-test as before (`tests/model.test.mjs` calls `answer(s, name)`
  everywhere with no clock plumbing and gets the same 100 it always did,
  since omitting `elapsedMs` defaults to 0 → full marks).
- **The UI keeps one plain in-memory timestamp** (`roundClockStart`), reset
  whenever a round genuinely becomes the active one: a fresh game, a
  competition switch, `Next Player`, a difficulty reroll, and — importantly —
  a full page load/reload. That last one is the deliberate choice: a player
  who reloads mid-round (or leaves the tab open overnight and comes back)
  gets a fresh clock rather than being penalized for wall-clock time they
  spent away from the page. The trade-off is that repeatedly reloading before
  answering is a way to always get full time-marks; for a casual, offline,
  no-anti-cheat party game (anyone can already open devtools and edit
  `localStorage` directly to set any score) this is an acceptable, low-stakes
  gap, not a threat model this app has ever tried to close.
- Because nothing timing-related is persisted, the existing byte-for-byte
  "reload preserves state" and "published save preserved byte-for-byte"
  invariants (`tests/browser-checks.js`, `tests/expansion-checks.js`) needed
  **no changes** — only the small number of assertions that checked an actual
  *score value* after a hint-then-win or reload-mid-round sequence needed
  updating to the new, still-deterministic numbers (see `tests/*.js` diffs
  in this change).

The one thing that *is* persisted is the final `points` value, stored on the
round the moment it's won (`round.points`), so a completed round's score
survives reload exactly like everything else in it. Old saves from before
this feature (or any round some future refactor forgets to stamp) simply have
no `points` field; `stats()` falls back to the historical flat 100 for those,
so nobody's already-recorded progress silently changes value.

## Migration path to a real backend

The history entries are shaped to make a future sync trivial without a
redesign:
- Every field is already what a `results` table row would look like
  (`finishedAt` ISO 8601, not a locale string; flat scalars, no DOM/UI
  concerns).
- The device has no stable identity today (there's no login), so entries are
  anonymous and device-scoped. When accounts/backend arrive, the natural
  migration is: on first sign-in, read `touchline.history.v1` client-side and
  POST it once to associate it with the new account, then treat the server as
  the source of truth going forward (this app doesn't need to build that
  upload path yet, but nothing here blocks it — the array is already
  ship-as-is JSON).
- `touchline.career.v1` (the resumable in-progress game) is intentionally
  *not* part of this migration story — a live, in-progress round is a
  client-side UX convenience, not a "result," and doesn't need to survive a
  device change the way a results history does.

## Alternatives considered

- **Store history inside `touchline.career.v1`.** Rejected — see "additive"
  reasoning above; couples an unrelated, ever-growing list to the
  frequently-rewritten, invariant-heavy current-game object.
- **IndexedDB instead of `localStorage`.** More headroom and a real query
  API, but this history is small (capped at 100 rows, each a few dozen
  bytes) — `localStorage`'s synchronous, dead-simple API is a better fit for
  a feature this size, and it's what the rest of the app already uses.
  Revisit if/when a real per-user history (post-backend) needs richer local
  querying.
- **A hard "reset everything vs. keep today's game" choice.** A single
  confirm-gated button that clears both keys was chosen over a
  finer-grained settings panel — this app has no settings surface today, and
  splitting the action into two buttons for a niche case wasn't worth the
  UI weight.
- **Penalizing wrong attempts directly in the score formula.** Considered
  (in addition to hints/speed) but left out: three wrong guesses already
  costs real time (which the speed factor already captures) and ends the
  round at 0 points on a loss, so a separate per-attempt penalty would be
  double-counting the same signal.

## Consequences

- Scores are no longer purely a function of "did you get it right" — two
  players who both eventually answer correctly can score anywhere from 20 to
  100 for the same round. `winDetail` copy now shows the actual points
  earned (not a hardcoded "+100") so this is visible in the moment, not just
  in the aggregate.
- Local history is per-browser/per-device, not per-person — clearing site
  data, using a different browser, or switching devices loses it, same as
  the existing game-progress save already does. This is called out in the
  reset button's confirm text and is consistent with the rest of the app's
  no-account model.
- `tests/model.test.mjs` gained a dedicated scoring test (pure `pointsFor`
  behavior, `answer(..., elapsedMs)`, legacy fallback, validate() bounds);
  the Playwright browser suite's small number of score-value assertions were
  updated to the new deterministic numbers but could not be re-run in this
  environment (no `playwright-cli`/browser available) — re-run
  `python3 tests/run-browser.py` to confirm before fully trusting them.
