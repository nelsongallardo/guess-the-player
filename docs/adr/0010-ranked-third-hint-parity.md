# 10. Ranked mode gets the third hint (club years), matching guest/practice

Status: Accepted — implemented 2026-09-14.

## Context

Guest/practice mode has always offered 3 hints (country, position, then each
club's years in the timeline). Ranked mode's original schema
(`202609130001_ranked_schema.sql`) capped it at 2 (country, position) with no
years hint at all, and `AGENTS.md`/`DESIGN.md` documented the fallback this
forced: since there was no way to reveal years, ranked showed them
unconditionally by default rather than hiding information with no path to
uncover it. That was a real, working design, but it meant the two modes
played differently for no gameplay reason - a ranked player's career panel
gave away years for free from the first second, while a guest/practice
player had to spend a hint for the same information. Extending ranked's hint
count always needed a schema migration, not just a client change, so it
stayed at 2 until now.

## Decision

Raise ranked's hint cap to 3 and make years hidden-by-default there too,
identical to guest/practice:

- `supabase/migrations/202609140002_ranked_third_hint.sql` widens
  `rounds.hints`'s check constraint to `0 and 3`, raises the 'hint' action's
  `HINT_LIMIT` threshold from `>=2` to `>=3` inside `public.ranked_game()`,
  and widens `ranked_private.points()`'s hint multiplier from `least(2,...)`
  to `least(3,...)` so a 3rd ranked hint costs the same 20%-of-ceiling cut it
  already costs in guest/practice (ceiling: 100/80/60/40 for 0/1/2/3 hints,
  matching `CareerGame.pointsFor`).
- **No new server field.** The server never needed to send club years in the
  first place: ranked's client-side `player()` lookup already resolves the
  full career from the same embedded roster guest mode uses
  (`PLAYERS.find(p=>p.id===cloud.round.playerId)`), since only the player's
  *identity* needs server authorization, not the (public, unchanging) career
  data attached to it. So `RankedUI.renderRanked()` derives the reveal
  exactly like guest mode does - `$('timeline').classList.toggle
  ('years-revealed', r.hints>=3)` - with `r.hints` being the one piece of
  state that genuinely is server-authoritative.
- Client hint UI (count label, disabled state, the `#hints` list) now uses
  all 3 of `copy().hints` and reuses `copy().yearsRevealed` for the 3rd
  slot's "revealed" text, the same generic phrase guest mode already shows
  instead of a literal value (years differ per club, so there's no single
  clue string - the timeline itself is the display surface).
- All copy describing hints by mode (the "How to play" list, the points
  FAQ) is rewritten to state one shared 3-hint mechanic instead of a
  guest/ranked split, in both languages.

## Consequences

- Ranked's already-recorded `results` rows are untouched - they're immutable
  and keep whatever hint count/points they were actually played with. Only
  future rounds can now take a 3rd hint.
- `tests/ranked-backend.test.mjs` (hint-limit test, the SQL/JS `points()`
  parity sweep, the exact-ceiling scoring test) and the mocked-SDK browser
  test `tests/accounts-checks.js` are updated to the 3-hint cap.
- Like every schema migration in this project, pushing this file to `main`
  only deploys the static site - applying it to the live database is a
  separate, deliberately manual step (`.github/workflows/supabase-deploy.yml`
  or the CLI; see `docs/leaderboards.md`). Until that runs, the hosted
  database still enforces the old 2-hint limit even though the deployed
  client now offers a 3rd hint button - a ranked player would see
  `HINT_LIMIT` from the server on the 3rd click until someone applies this
  migration.
