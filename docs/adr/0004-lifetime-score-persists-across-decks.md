# 4. Score and streak are a lifetime running total, not per-deck

Status: Accepted — implemented 2026-09-13. Amends [ADR 0001](0001-local-results-history-and-speed-based-scoring.md).

## Context

ADR 0001 introduced speed/hint-based scoring but left the header's "YOUR
SCORE" and "WIN STREAK" as a direct read of `CareerGame.stats(state).score`
/`.streak` — a value derived entirely from the *current deck's* rounds. That
was fine while a deck was the only unit of play, but it has an obvious,
reported problem: `CareerGame.create(...)` builds a brand-new deck (and so a
fresh, empty `stats()`) every time someone switches competition or hits
Replay. In practice that meant picking a different competition — something
the game explicitly invites you to do "at any time and never forced" — wiped
the number on screen back to zero, even though nothing was actually lost or
undone. That reads as "my points got deleted," which is the opposite of what
scoring is supposed to feel like.

## Decision

Score and streak become a **lifetime, per-device running total**, tracked
independently of which deck happens to be active, in a third `localStorage`
key: `touchline.lifetime.v1` — `{score, streak, bestStreak, wins, rounds}`.

- It updates exactly once per round, the moment that round resolves (won or
  lost), via a `tallyRound(previousOutcome)` call in the options click
  handler that compares the outcome just before and just after
  `CareerGame.answer(...)`. A win adds that round's already-computed
  `points` and extends the streak; a loss resets the streak to zero. Nothing
  about it is derived by re-scanning `state.rounds`, so — unlike
  `CareerGame.stats()` — it survives `CareerGame.create()` being called for
  an entirely new deck.
- Switching competition, hitting Replay, or a difficulty/legacy-preference
  migration never touch it. Only the footer's Reset button clears it
  (alongside the current game and the results history, exactly as before).
- The header (`#score`, `#streak`) and the big recap number now read from
  this lifetime object instead of `stats(state)`. The recap screen's
  supporting sentence (`t.recap`, "X / total found · best streak · accuracy")
  keeps reporting on *that specific deck*, which is what its wording already
  implies — only the prominent number is lifetime, so it never visibly drops
  the moment a deck finishes.
- `CareerGame.stats(state)` itself is untouched — it's still the right tool
  for "how did this specific deck go" (used by the recap line, and by every
  existing model test), and remains a pure function with no knowledge of
  anything beyond the state it's given.

## Why a fourth key instead of changing `stats()` or the deck model

- `stats()` is deliberately a pure, stateless projection of `state.rounds` —
  changing it to reach outside `state` would break that purity and every
  test that relies on `stats()` describing exactly the given deck (legacy
  save fixtures, the 60-round playthrough tests, etc.).
- Folding a lifetime counter into `state` itself (so it would survive
  `create()`) would mean deliberately special-casing which fields
  `CareerGame.create()` preserves versus resets — a much larger, riskier
  change to a heavily validated object, for a concept (`lifetime` totals)
  that has nothing to do with a deck's shape or validity.
- A separate key mirrors exactly how `touchline.history.v1` (ADR 0001) was
  already justified: independent failure mode, independent lifecycle, and a
  shape that's already what a future backend's `users` row would look like
  (`score`, `streak`, `bestStreak`, `wins`, `rounds` are all plain scalars).

## Consequences

- The header number now genuinely means "your total on this device," not
  "your total in the deck you happen to be looking at" — consistent with
  the product's existing framing of competition-switching as a free,
  reversible choice, not a fresh start.
- `winDetail`'s streak figure and the header's streak are now the same
  number (lifetime), whereas before a fresh deck's streak and the header's
  streak were trivially the same thing by construction; no visible behavior
  changes there, only the semantics underneath.
- `tests/difficulty-checks.js`'s existing competition-switch/reset loop was
  extended (not replaced) to assert the header/lifetime value survives every
  competition switch, reload, and replay in that loop, and is zeroed only by
  Reset — this could not be executed in the environment this change was
  authored in (no `playwright-cli`/browser available); re-run
  `python3 tests/run-browser.py` to confirm.
