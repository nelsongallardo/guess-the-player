# 25. Position first, nationality second, club years third

Status: Accepted — implemented locally 4 October 2026; production application is separate.

## Decision

All guest/practice and signed-in ranked Daily/Unlimited surfaces use position → nationality → each club's years, in ES/EN labels, help, points FAQ and live hint announcements. Nationality still means the represented senior national team (`country` in the data/API), not birthplace. Years still reveal only at three hints. Three-hint cap, attempts, the 100/80/60/40 ceilings, time curve, options, roster and frozen Daily payload/schedule are unchanged.

The authoritative ranked contract is not merely a count: `ranked_private.projection` and `daily_projection` also gate `cluePosition` and `clueCountry`. Forward migration `202610040001_position_first_hints.sql` replaces only these two functions, copied from the current `202609290001_combined_account_score.sql` definitions. Position is returned at ≥1 hints, country at ≥2. Combined account totals, nicknamePrompted, career-only counters, Daily streak and response shapes remain intact. No applied SQL, RPC mutation implementation, scoring function, constraints or grants are edited.

## Persisted-round compatibility

Persisted rounds store a hint count, not an ordered history of clue identities. Preserve the document/schema keys and all rows: counts, guesses, options/order, player/deck, versions, clocks, status, points and immutable results stay unchanged. Apply the new display/projection semantics to existing rounds too: one hint now displays position only; two show position plus nationality; three also show club years. No free second hint, count increase, reshuffle, clock reset, save deletion, result rewrite or new ruleset. A returning one-hint player may remember the nationality they saw before release; it cannot be unlearned, but it is not retained as an extra displayed clue or retroactively charged.

Old account-scoped idempotency receipts must remain exact immutable responses. A repeated pre-release one-hint receipt can still contain country and no position. The new client gates by the current order/count, hides that unreached country and shows `Position: —` rather than inventing position from the public local roster. A fresh progress read/reload obtains the new projection without spending another hint. Missing backend clues are never filled locally. This is also the safe, temporary behavior if the frontend is published before the migration.

## Release requirements

Merging/deploying Pages does **not** apply the SQL migration. Coordinate the frontend publication with separately authorized application of `202610040001` against the verified hosted predecessor; inspect all pending migrations rather than assuming this file is the only one. Until both are deployed, old/new frontend/backend combinations can show a first-clue placeholder. No Edge Function redeploy is required: action/request schemas are unchanged. Read back both function definitions and migration history, verify first/second/third-hint hosted projections and preserve gameplay rows/results/receipts. Production work is left to the release owner.

## Verification

`tests/hint-order.test.mjs` executes all four shipped renderer expressions, including overpopulated and missing server clue cases; it checks ES/EN labels/help and legacy Unlimited/Daily saves at 1/2/3 hints. The native PostgreSQL suite tests the exact current predecessor's 0/1/2/3-hint career and Daily rows, immutable receipts, raw gameplay preservation, new projections and unchanged score parity. `tests/hint-order-checks.js` exercises isolated mobile HTTP, actual offline file play, reloads, language changes, Next and denied storage writes; account SDK/API are explicit mocks, not hosted OAuth or database evidence. See TESTING.md for actual command outcomes and limitations.
