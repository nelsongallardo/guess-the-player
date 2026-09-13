# 5. A player answered once never comes back, ever; competitions can complete

Status: Accepted — implemented 2026-09-13.

## Context

Until now, "no repeated player" only held *within one deck*. `CareerGame.
create(difficulty, competitionId)` always builds its deck from that
competition's **full** roster, so switching competitions, replaying, or even
just picking "All Players" after finishing "La Liga" would show you players
you had already correctly (or incorrectly) answered minutes earlier. That
was fine when competition-switching was new and score was per-deck (ADR
0001), but now that score/streak are a lifetime total that follows you
across competitions (ADR 0004), the natural next expectation is that the
*players themselves* don't repeat either — once you've answered someone,
right or wrong, you've "used" them, on this device, until you deliberately
reset.

The open design question was what happens when a competition's pool is
fully exhausted this way — e.g. Brasileirão only has 13 players today, so
one full playthrough answers all of them. Three options were considered:
keep serving already-seen players once the unseen pool runs out; only ever
exclude *correct* answers (a miss earns another shot later); or mark the
competition **Completed** and simply not let it be played again until
Reset. The last one was chosen — it's the simplest mental model ("once
you've been asked, you've been asked; a competition is either open or done"),
and it makes the Reset button's meaning literal: it's the *only* thing that
un-completes anything.

## Decision

A fourth `localStorage` key, `touchline.seen.v1`, holds the set of player
ids that have been the subject of a **resolved** round (won or lost) at
least once, ever, on this device — updated in the same `tallyRound` hook
that already updates the lifetime score (ADR 0004), so it's exactly as
reliable: folded in once per round resolution, never recomputed from
`state`, unaffected by reloads.

- `CareerGame.create(difficulty, competitionId, excludeIds)` gained a third,
  optional parameter: when given a `Set` of ids, the deck is built from
  `playersFor(competitionId)` **minus** those ids, instead of the full
  roster. Every existing call site (and every existing test) omits it and
  is completely unaffected — this is additive, not a behavior change to the
  default path.
- `create()` throws if the resulting pool is empty rather than silently
  building a deck with no players in it (`playerAt`/`makeRound` would
  otherwise blow up on `deck[0]` being `undefined`). Detecting "nothing left"
  and deciding what to show instead is the caller's job, not the model's.
- The UI wraps this in `startGame(difficulty, competitionId)`, which returns
  `null` when `remainingFor(competitionId)` (i.e. `playersFor(id).filter(p
  => !seen.has(p.id))`) is empty, and a real state otherwise. Every place
  that used to call `CareerGame.create(...)` directly for a *new* game
  (competition picker, Replay) now goes through `startGame` and handles
  `null`:
  - The competition picker shows the **remaining** count instead of the
    total, and once that hits zero the option reads "Completed" and is
    disabled — you cannot even attempt to select an exhausted competition.
  - Replay, after finishing a deck, has (by construction) just made every
    player in that exact competition "seen" — so it will almost always find
    that competition instantly exhausted. Rather than fail or build a
    broken empty game, it reopens the competition picker so the next choice
    is obvious, instead of leaving the player stuck on a dead "Play again."
  - Initial page load falls back to `startGame('hard','all') ||
    CareerGame.create()` — the unrestricted `create()` only fires in the
    (extremely rare) case where literally every one of the 60 playable
    careers has already been seen and there is truly nothing left to serve;
    a graceful repeat here was judged better than a broken boot. This is a
    known, accepted edge case (see Consequences).
- `validate()`'s deck-length check changed from *exact equality* with the
  competition's full roster to a *range*: `1 <= deck.length <=
  playersFor(activeCompetition).length` (and, for the unscoped/"all" case,
  `1 <= deck.length <= PLAYERS.length`, replacing the old fixed
  `[30,40,50,60]` allow-list). A smaller-than-full deck is now exactly as
  legitimate as a full one; only genuinely impossible shapes (empty, too
  long, wrong ids, duplicates, foreign competition membership) are rejected.
  This is the one change here that touches an existing, shared invariant —
  see Consequences for the test updates it required.
- The confirmed Reset clears `touchline.seen.v1` alongside the other three
  keys (current game, history, lifetime) and resets the in-memory `seen`
  Set — it remains the single action that un-does everything.

## Why "seen" is a separate key, not part of the deck or `stats()`

Same reasoning as ADR 0001's history and ADR 0004's lifetime total: it has
its own lifecycle (grows forever until Reset, independent of any one deck),
its own failure mode (a write failure here shouldn't touch the playable
current game), and it's already the exact shape a future backend's
`seen_players` join table would need (`user_id`, `player_id`).

## Consequences

- **A relaxed model invariant.** `tests/model.test.mjs`'s
  `s.deck.pop()` mutation (previously asserted invalid — "deck length must
  match the pool") and the `wrongLength` case in the competition-validation
  test both had to change: a deck one player short of the full competition
  roster is now an accepted, legitimate shape, not corruption. Both were
  replaced with assertions that document the *new* rule directly (a
  shrunken deck validates true; an empty deck, or one exceeding the
  competition's total pool, still doesn't) plus a direct test of
  `create(..., excludeIds)` and its throw-on-empty behavior.
- **Finishing a competition now visibly "spends" it.** This is the
  intended, chosen behavior, not a bug: complete Brasileirão's 13 players
  once, and Brasileirão reads "Completed" (disabled) until Reset — as does
  every other competition once its own roster is fully seen. "All Players"
  is the last one to run out, at 60/60.
- **An accepted, rare edge case.** If "All Players" itself is ever fully
  exhausted (every one of the 60 careers answered at least once, ever) and
  the current save is simultaneously missing/invalid, page load falls back
  to an unrestricted `create()` rather than a dead page — meaning a repeat
  is possible only in that specific, unlikely intersection. A dedicated
  "you've finished the entire game" screen was considered and deferred as
  disproportionate to how rarely it can occur; worth revisiting if this
  becomes a real player experience rather than a theoretical corner.
- Verified end-to-end with a scripted DOM run (jsdom) in the environment
  this was authored in, since no `playwright-cli`/browser was available
  here: a full Brasileirão playthrough correctly marks all 13 as seen,
  Brasileirão shows Completed and is disabled in the picker, clicking
  Replay on the just-exhausted competition reopens the picker instead of
  building a broken game, All Players' remaining count drops by exactly the
  players just seen, and Reset restores everything. `node --test
  tests/model.test.mjs` passes (35/35). Re-run `python3 tests/run-browser.py`
  to confirm the Playwright suite too.
