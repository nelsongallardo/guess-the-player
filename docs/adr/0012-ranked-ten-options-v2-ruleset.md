# 12. Ranked moves to ten options under a new v2 ruleset

Status: Accepted — implemented 2026-09-14/15. Amends [ADR 0002](0002-origin-first-distractors.md)'s 2026 amendment, which deliberately left "ranked mode's server schema... untouched, still deals 4/5" pending a real migration decision.

## Context

Guest/practice moved from 5 options (1 correct + 4 rivals) to 10 (1 + 9) as a deliberate harder-game decision (ADR 0002's amendment). Ranked mode was left at 5 on purpose - extending it needed a schema migration, not just a client change, and the owner asked for it directly once the rest of this session's fixes landed.

Guessing among 10 names is not a cosmetic change: a lucky guess drops from a 1-in-5 chance to 1-in-10, which measurably changes what a "win" represents on a leaderboard built on immutable, permanent per-player results (`primary key(user_id,player_id,ruleset)` on `ranked_private.results`, "first result per player/ruleset only" per README). Silently widening the existing `'v1'` ruleset in place would mean some already-recorded points were earned against 5 options and others against 10, indistinguishable on the same board - the exact kind of quiet unfairness this project has consistently avoided when retuning scoring (see ADR 0009/0011's careful handling of already-recorded scores).

The owner chose to treat this as a new ruleset (`'v2'`) rather than mutate `'v1'`: old results stay exactly as recorded, immutable and untouched, but the active leaderboard and account progress now reflect `'v2'` only - every account effectively starts the board fresh under the harder format, same as everyone else. Given the leaderboard has only a handful of participants at the time of this change, the cost of that reset is minimal now and only grows the longer it's deferred.

## Decision

`ranked_private.rounds` already had a `ruleset` column (`text not null default 'v1' check(ruleset = 'v1')` — forward-looking from the original schema, never used until now) and `unique(user_id,player_id,ruleset)`; `ranked_private.results` already had its own `ruleset check(ruleset = 'v1')` and `primary key(user_id,player_id,ruleset)`. Migration `202609140006_ranked_ten_options_v2.sql`:

- Widens both check constraints to `ruleset in ('v1','v2')` (dropped by inspecting `pg_constraint` rather than assuming an auto-generated name, matching the pattern `202609140002_ranked_third_hint.sql` established).
- Ties the options count to the ruleset directly in a constraint: `check((ruleset = 'v1' and jsonb_array_length(options) = 5) or (ruleset = 'v2' and jsonb_array_length(options) = 10))` - the database itself now enforces that a v1 round can never end up with 10 options or a v2 round with 5, rather than trusting the application code alone.
- Sets `rounds.ruleset`'s default to `'v2'`, so new rounds are v2 without every `insert` needing to name it explicitly (mirroring how the original schema relied on `default 'v1'`).
- `public.ranked_game`'s `'start'` branch: the rival-candidate `limit` goes from 4 to 9 (confirmed safe first - see Consequences), and the "already answered" exclusion switches from checking `ruleset='v1'` to `ruleset='v2'`, so v1-only history no longer blocks a player from being drawn again under v2 (that's the intended reset, not a bug).
- `results` insert switches from the hardcoded literal `'v1'` to `r.ruleset` - the round's own actual value - so any round that was already in flight (5 options, v1) when this migration ships still resolves and records correctly as v1, with zero special-cased transition logic needed. The single-active-round partial index (`ranked_one_open_round ... where status = 'playing'`) doesn't care about ruleset either, so an in-flight v1 round simply finishes normally and the account's next `'start'` call is v2.
- `ranked_private.projection()` and `ranked_private.leaderboard()`: every aggregate against `results` (`totalPoints`, `answered`, `correct`, `seenPlayerIds`, `competitionCounts`, the leaderboard join) now filters `ruleset='v2'`, so the active board and account progress reflect only the new format. v1 rows remain in the table, immutable, simply excluded from these live aggregates - not deleted, not migrated, available if a future decision wants to surface v1 history separately.

Client (`index.html`): ranked's rival-count comment/assumption of exactly 5 no longer holds; `renderRanked()`'s answer caption switches from the now-identical `chancesRanked` copy key to the shared `chances` key guest already uses ("Ten names. Three chances." / "Diez nombres. Tres intentos."), and the dead `chancesRanked` key is removed from both locales.

## Consequences

- Verified before writing this migration, not assumed: `select min(cnt) from (select player_id, count(*) cnt from ranked_private.rivals group by player_id) x` against the live database returned 118 as the minimum rivals stored per player, comfortably above the 9 now requested - no player can hit a short-candidate-pool failure.
- Every account's ranked leaderboard position and progress effectively resets to zero under v2. No one's already-earned v1 points are deleted or altered; they simply stop counting toward the active board, exactly as previewed to the owner before this shipped.
- `ranked_private.rounds`'s and `results`'s check constraints now do real, non-trivial validation work (tying option count to ruleset) rather than a single fixed literal - any future ruleset change (a hypothetical v3) needs to extend that same `case`-shaped constraint and touch the same set of aggregate queries this ADR lists, not just the schema's leading edge.
- No guest/practice change of any kind - this migration and its client-side follow-up touch ranked mode exclusively.
