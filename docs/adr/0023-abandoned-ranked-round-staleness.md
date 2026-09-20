# 23. Replace abandoned untouched ranked rounds instead of resurrecting their clock

Status: Accepted — implemented 2026-09-20.

## Context

The owner reported three times, over several days, that the elapsed-time readout showed an implausibly large number on a freshly opened tab. The first two reports were genuinely different bugs and were fixed separately:

1. A guest `sessionStorage` clock surviving a browser session/crash restore, fixed with a six-hour ceiling in `restoredRoundClockStart`.
2. The readout itself having no ceiling for server-backed clocks, fixed with the shared `displayableElapsedMs` display cap.

The third report — "TIME PLAYED 73:25", signed in, **Unlimited play**, **3 attempts left** — was neither, and 73 minutes sits *below* both existing six-hour caps, so neither fix could have applied. The distinguishing facts were that the player was **signed in** (so the clock came from the server, not local storage) and the round was **untouched** (three attempts remaining).

The cause is structural, not a display artefact:

- `ranked_private.rounds.started_at` defaults to `clock_timestamp()` **at row creation**.
- `RankedUI.sync()` auto-starts a round on page load whenever no round is open (`if(gameplayCurrent()&&mode==='ranked'&&!cloud.round) await mutate('start',…)`).
- `public.ranked_game`'s `start` branch returns any existing `status='playing'` round rather than dealing a new one.

So merely landing on the site while signed in creates a round with a running scoring clock, whether or not the player ever looks at it. Close the tab, come back later, and the same untouched round is handed back with its original `started_at`.

This is **not** only a display problem. `ranked_private.points()` charges `clock_timestamp() - r.started_at`, and the curve reaches its 25% floor at 24 seconds. A player returning to an abandoned round was therefore locked to the minimum score before ever seeing the puzzle — a silent, permanent scoring penalty for having opened the site earlier.

## Decision

In `public.ranked_game`'s `start` branch, an existing playing round that has **no guesses and no hints** and whose `started_at` is older than **30 minutes** is deleted and replaced with a freshly dealt round carrying a fresh clock.

The condition is deliberately narrow:

- **Untouched only.** The elapsed penalty is the anti-lookup mechanism ([ADR 0009](0009-speed-decay-anti-lookup-tightening.md)). The moment a player spends a hint or a guess, the round is engaged and keeps its clock no matter how long they disappear — otherwise leaving and returning would be a free scoring reset, which is exactly the exploit ADR 0011 closed on the guest side. Requiring `cardinality(guesses)=0 AND hints=0` means the player demonstrably never interacted.
- **30 minutes.** Far beyond any real interruption, and far below the multi-hour gaps actually reported. Because the score floor is already reached at 24 seconds, a round resumed *inside* the window is unaffected in practice — the window's only job is separating "stepped away briefly" from "abandoned".
- **Career rounds only.** Daily rounds are created explicitly by `dailyProgress` for a fixed calendar day and are meant to persist across that whole day; they are untouched by this change.

Deleting rather than re-stamping `started_at` is safe and preferable: results are only written on a terminal transition, so an abandoned round has no `results` row. Deletion consumes nothing — the same player can be dealt again — and the partial unique index `ranked_one_open_round` keeps the one-open-round invariant intact. Re-stamping would instead have preserved a round the player may no longer want and would have needed a separate `version` bump to stay consistent with optimistic concurrency.

## Consequences

- A signed-in player who opens the site, walks away, and returns later now gets a fresh puzzle at a fresh clock and a full 100-point ceiling, instead of a stale timer and a guaranteed 25 points.
- The anti-lookup boundary is unchanged for every engaged round.
- The client-side `displayableElapsedMs` six-hour display cap stays. It is now a redundant second layer for this path rather than the only defence, and still covers the window between deploying the frontend and applying this migration — which matters, because hosted migrations are a deliberately manual step here.
- This is a `create or replace function` migration and must be based on the **current** definition of `public.ranked_game`, which lives in `202609180001_daily_rabona_schema.sql`, not the older career-only `202609140006_ranked_ten_options_v2.sql`. Rebasing on the older text would silently revert every `dailyProgress`/`dailyHint`/`dailyAnswer` action. This was caught in testing when ten daily tests regressed.

## Alternatives considered

- **Set `started_at` on first engagement instead of at creation.** Conceptually the cleanest — the clock would measure thinking time by construction. Rejected for now as a much larger change: `started_at` is `not null` and is read by `projection()`, the points function, and the client readout, so it would need a nullable-or-sentinel redesign across all of them, plus a backfill decision for in-flight rounds. Worth revisiting if the 30-minute window proves too blunt.
- **Display-only patch.** Would have hidden the symptom while leaving the real scoring penalty in place. Explicitly rejected once the scoring impact was confirmed.
