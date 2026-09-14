# 9. Tighter speed-decay window to discourage answer lookups

Status: Accepted — implemented 2026-09-14. Amends [ADR 0001](0001-local-results-history-and-speed-based-scoring.md); the formula and mechanism (hints as a hard ceiling cut, elapsed time as a separate decaying multiplier) are unchanged, only three constants are retuned. The 12s floor-time below is itself superseded by [ADR 0011](0011-longer-decay-window-and-guest-clock-persistence.md) (now 24s); the grace window, floor value and rationale here are otherwise still current.

## Context

ADR 0001's original constants gave a correct answer full value for the first
5 seconds, then decayed linearly to a 50% floor by 30 seconds. That grace
window is comfortable for genuine recall, but it is also comfortable for
opening a new tab, searching the player's name, and coming back — 30 seconds
is generous enough that looking an answer up barely costs anything (you still
keep half the points), which undermines the entire point of a "guess from
memory" game once any leaderboard or bragging rights are involved.

We looked at how Kahoot!, the most widely used live-quiz product with a
similar time-pressure design, handles this. Per Kahoot's own support
documentation, its formula is `points = ceil(1000 × (1 − (responseTime /
timeLimit) / 2))`: full value decays linearly to a firm 50% floor exactly at
the question's time limit (their limits run 5–120s depending on the
question), with a special case awarding max points for any answer under
0.5s. Kahoot's game design assumes an honest live-quiz setting (a shared
screen, a room, a limit typically well under what an outside lookup would
take), so its 50% floor is tuned for "did you hesitate," not "did you cheat."
Ours is not: derabona is played solo, unmonitored, on the player's own
device, so the model needs a floor and a decay window built specifically to
make a lookup a bad trade, not merely a suboptimal one.

## Decision

Retune the three constants in `pointsFor`'s `timeFactor` (`index.html`,
`game-model` script block) and the mirrored server-side
`ranked_private.points()` SQL function (used by ranked mode's
server-authoritative scoring):

| Constant | Was | Now |
|---|---|---|
| Grace window (full value) | 5,000ms | 2,000ms |
| Time to reach the floor | 30,000ms | 12,000ms |
| Floor value | 50% | 25% |

The hint penalty (`HINT_PENALTY = 0.2` per hint, hard cap regardless of
speed) is unchanged — it already does its job independently of time.

2 seconds of grace still covers normal reaction/click time without
penalizing anyone for not being inhumanly instant. 12 seconds is enough to
read a career timeline and answer from genuine recognition, but short enough
that opening another tab, typing a search, reading a result and returning no
longer earns a competitive score: a fast, honest guess now clearly
outscores a slow, looked-up one (100 vs. 25, before any hint penalty), where
before it was closer (100 vs. 50).

Applies identically to guest/practice (client-computed, matches ADR 0001's
existing trust model — there's no leaderboard at stake there) and to ranked
mode, where it matters more since ranked has a real public leaderboard and a
server-authoritative clock (`started_at` in Postgres) that a client cannot
falsify. The ranked SQL function is changed via a new migration
(`202609140001_faster_speed_decay.sql`, `create or replace function`) rather
than editing the original schema migration in place, consistent with this
project's migration practice of appending changes rather than rewriting
already-applied files.

## Consequences

- Every already-recorded score (guest history entries, ranked results) is
  unaffected — this only changes how *future* answers are scored, exactly
  like ADR 0001's original formula did when it replaced flat 100-point
  scoring.
- `tests/model.test.mjs`'s scoring test and
  `tests/ranked-backend.test.mjs`'s guest/SQL parity test are updated to the
  new constants.
- The "How to play" dialog's scoring bullet (both languages) now states the
  12-second floor explicitly and includes a small static bar-chart example
  (0–2s → 100, 7s → 63, 12s+ → 25, no hints) so the curve is legible at a
  glance rather than only described in prose.
