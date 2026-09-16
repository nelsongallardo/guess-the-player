# Accounts and leaderboards

## Delivery status and architecture

The Supabase schema and both Edge Functions are deployed. Hosted verification with a disposable admin-created Auth account passed ranked actions, idempotency, global/membership boards and account deletion with exact database readback; test data was removed. Google is the only enabled public signup provider, and the owner subsequently signed in through Google with saved ranked results observed in the hosted state. Full cancellation/refresh/cross-device browser coverage remains separate. Static publication is a separate main-branch Pages workflow; see [TESTING.md](../TESTING.md) for the evidence boundaries.

All migrations through `202609140003_roster_sync_60_to_80.sql` are applied to the live database (owner-run `supabase db push` via the CLI, 2026-09-14). The database had drifted to 60 players/119 candidates (last actually deployed there) while the roster in `index.html`/`202609130002_ranked_roster.sql` had grown to 80/154 through several undeployed batches; the gap was found by diffing a live read against the current computed roster (not assumed) before writing the additive sync migration. The 2 existing accounts' 13 `results` rows were confirmed untouched before and after.

`index.html` remains a portable offline guest game. Optional accounts load the pinned Supabase JS SDK (2.57.4), use Google OAuth/PKCE, and persist the session separately under `derabona.auth.v1`. Only the public project URL/publishable key belong in the browser. Never expose service-role keys, Google client secrets, access/refresh tokens or CLI credentials in docs, screenshots or commits.

- `supabase/migrations/202609130001_ranked_schema.sql`: private state, grants/RLS, transactional RPC and score projections.
- `supabase/migrations/202609130002_ranked_roster.sql`: frozen v1 roster, candidates, matching tiers/similarity and canonical memberships.
- `supabase/migrations/202609130003_automatic_animal_aliases.sql`: automatic stable animal aliases, enrollment and legacy-account backfill; custom names and gameplay records are preserved.
- `supabase/migrations/202609140001_faster_speed_decay.sql`: retunes `ranked_private.points()` to match [ADR 0009](adr/0009-speed-decay-anti-lookup-tightening.md)'s client-side speed-decay constants.
- `supabase/migrations/202609140002_ranked_third_hint.sql`: raises the hint cap from 2 to 3 (adds the club-years hint) and its matching `ranked_private.points()` pricing - see [ADR 0010](adr/0010-ranked-third-hint-parity.md).
- `supabase/migrations/202609140003_roster_sync_60_to_80.sql`: additive-only sync of the 20 players added across roster batches since the database was last actually deployed (it was live at 60 players; `202609130002`'s file content had since been regenerated in place to 80 without ever being re-deployed - see that file's own "do not overwrite" warning). Diffed against a live read of the database rather than assumed; zero existing rows touched. Every insert has `on conflict do nothing`, so it's also a safe no-op on a from-scratch deploy where `202609130002` alone already has all 80.
- `supabase/migrations/202609160002_expand_ranked_roster_120_to_160.sql`: generated forward roster synchronization from the published 120-player ninth batch to the reviewed 160-player model. It preserves results, receipts and active rounds, adds/updates roster and candidate metadata, adds memberships, and rebuilds future rival rows. Local fresh-replay and exact-prior-120-state upgrade tests pass; hosted application and readback remain a separate release step until explicitly recorded in `TESTING.md`.
- `scripts/export-ranked-roster.mjs --check`: read-only parity check against the actual inline model. Do not rewrite a ruleset already used for results; plan a reviewed migration/version transition.

### Applying migrations to the hosted database

A `main` push never applies `supabase/migrations/*.sql` to the live database (see below) - a new migration file only takes effect once someone with project access runs it. Two ways to do that:

- **Manual, no setup**: `supabase login` (needs a personal access token from the Supabase dashboard's Account > Access Tokens), `supabase link --project-ref <ref>` (ref is in Project Settings > General), then `supabase db push`. Or paste each pending `.sql` file into the dashboard's SQL Editor in order - simpler for a one-off, but Supabase then has no record of it as an applied migration, so mix this with `db push` carefully (pick one method consistently, or `supabase migration repair` afterward).
- **`.github/workflows/supabase-deploy.yml`**: a manual-only (`workflow_dispatch`, never on push) GitHub Action that runs `supabase db push` against the linked project. Requires repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` (see the workflow file's header comment for where each comes from) added once by a repo admin in Settings > Secrets and variables > Actions. Deliberately gated behind a typed confirmation input and never triggered by a push, since it mutates the production schema directly and this repo has more than one person (and agent) pushing to `main`.
- `supabase/functions/_shared/http.ts`: strict JSON/action validation and verified identity boundary.
- `supabase/functions/_shared/supabase.ts`: server-only Supabase dependency adapter.
- `supabase/functions/ranked-game/index.ts`, `supabase/functions/account-delete/index.ts`: Edge entrypoints.
- `supabase/config.toml`: local project/auth settings and function gateway configuration.

## Standalone leaderboard destination

`leaderboard.html` is a real static page, not a dialog or embedded game. Primary Play / Leaderboard links make rankings discoverable. The board is publicly readable without login and uses the same optional persistent Supabase session as the game to show the server-provided personal position, including outside the current page. Merely viewing it never starts a timed round or imports guest progress.

Global and competition filters use the existing server contract. Language and competition are shareable URL state; pagination is bounded and changing competition starts from the first page. Loading, failed reads with Retry, empty boards, guests and signed-in users without a result have distinct states. Equal scores retain server ties; no invented podium, weekly reset or rank movement. Nicknames render as text.

The game shows a translated loading card during account verification, progress retrieval and round start; it clears as soon as that single request's response arrives (see [ADR 0013](adr/0013-single-round-trip-ranked-mutations.md) - every `ranked_game` action already returns a full, authoritative `projection()`, so there is no separate confirming read-back stage any more). Errors hide the private round and expose retry/practice; this is not optimistic scoring.

The leaderboard shows a decorative table skeleton and announced loading status during account/API/filter/page waits, then removes the placeholder completely. A connection hint warms the existing API origin; it is not a new analytics dependency or a measured backend speed improvement. The entire SDK/session read has a five-second deadline, followed by an anonymous public read with an account-verification warning on failure; the board fetch retains its fifteen-second abort. No-JS shows an explanation rather than an endless loader. No private cache or speculative duplicate public/authenticated reads are introduced.

The page keeps the cream/navy/celeste identity, semantic responsive table, strong numeric hierarchy, keyboard focus and touch-friendly navigation. It does not load analytics. Offline guest play remains self-contained in `index.html`; rankings need connectivity. See [ADR 0008](adr/0008-standalone-leaderboard-page.md).

## Progress and automatic public aliases

Guest gameplay is per-tab sessionStorage with memory fallback. Language and analytics retain independent localStorage lifecycles. Legacy localStorage gameplay migrates as one linked snapshot only after complete destination write/readback verification. Conflicting snapshots remain separate; explicit recovery can replace the tab snapshot. No guest, legacy or practice score is imported into ranked play. See [ADR 0006](adr/0006-accounts-and-ranked-progress.md).

The server creates one active round per account across devices. A start for another competition resumes that round. Persisted server time includes time away; options, hints, guesses, points and terminal transitions are server-owned. There are at most three hints (country, position, club years — see [ADR 0010](adr/0010-ranked-third-hint-parity.md)) and three guesses. Only the first terminal result per account/player/ruleset counts; there is no ranked reset, replay or import endpoint. Exhausted start returns `completed: true` with `round: null`.

Every account automatically receives a stable unique random-animal alias and leaderboard participation, without a form or checkbox. Existing unnamed accounts are backfilled without changing scores; existing custom nicknames are preserved. The alias is independent of Google identity by default; the optional nickname field also suggests the player's own Google name as an editable, one-time starting point ([ADR 0019](adr/0019-suggest-google-name-as-nickname.md)) - nothing beyond the random alias is ever published unless the player explicitly edits or accepts the suggestion and saves it. An accessible bilingual tooltip explains optional custom naming in Account. Custom nicknames are trimmed, 3–24 permitted letters/numbers/spaces/underscore/dot/hyphen, and case-insensitively unique. Public boards still require at least one verified result in the selected board: an active round or preliminary wrong guesses alone produce no row. A terminal loss qualifies with zero points. See [ADR 0007](adr/0007-automatic-animal-aliases.md).

Global points count each verified player once. Competition boards filter results through **all canonical memberships**, not the selected deck. These are overlapping views of the same result, not extra awards. Equal points share SQL `rank()` values; nickname order stabilizes pagination without breaking ties. Public rows expose only nickname, points, answered, correct and rank. The `own` projection uses verified identity internally without publishing it. Unrelated boards have no row for that result.

Cloud failure locks ranked mutations. The player must explicitly select unranked practice or retry/reconnect; practice never queues for upload. Sign-out starts a fresh guest session but retains cloud results. Account deletion is a distinct confirmed destructive action, not a score reset.

## HTTP contract

POST `application/json` to `/functions/v1/ranked-game`, with the project's public `apikey` header and, except anonymous board reads, `Authorization: Bearer <session access token>`. Never put actual session credentials into examples or logs. Responses are JSON and `Cache-Control: no-store`; bodies are limited to 8,192 streamed bytes and unknown fields are rejected.

| Action | Accepted fields besides `action` |
| --- | --- |
| `progress` | None |
| `start` | Optional `competition`; required UUID `idempotencyKey` |
| `hint` | UUID `roundId`, integer `expectedVersion`, UUID `idempotencyKey` |
| `answer` | Same as hint, plus opaque UUID `optionId` |
| `enroll` | `nickname`, UUID `idempotencyKey`; retained API name for optional nickname changes |
| `leaderboard` | Optional `competition`, integer `limit` (1–100, default 25), integer `offset` (0–10000, default 0) |

Competition IDs: `all`, `champions-league`, `premier-league`, `la-liga`, `argentine-primera`, `brasileirao`. Omitted competition defaults to `all`. Expected versions must be nonnegative integers, at most 999999999.

Progress/mutation responses contain `profile`, `progress`, `round`. Progress includes `totalPoints`, answered/correct counts, seen IDs and per-competition answered/total counts. Round includes id/version/playerId/competition, stable five `{id,label}` options, guesses, hints/clues, status, points and server `startedAt`; it does not return the private correct-option/candidate mapping. Board responses include `entries`, `own`, `total` and pagination metadata. `own` may be outside the page or null.

Each account's transitions serialize. `expectedVersion` rejects stale distinct actions. Account-scoped idempotency keys replay immutable exact response snapshots; reuse with another payload returns `IDEMPOTENCY_CONFLICT` (409). Preserve the same key/body for uncertain transport retries and reconcile authoritative progress. Known permanent rejections must allow a corrected payload with a new key. Do not revive a prior finished round after an exhausted start.

Errors use `{error:{code,message}}`: malformed input 400; unverified identity 401; missing round 404; version/terminal/hint/duplicate-guess/nickname/idempotency conflicts 409; account rate budget 429 with `Retry-After: 60`; unexpected failures 500. Disallowed origins return 403. Allowed browser origins are canonical HTTPS and localhost development; CORS is not authentication.

POST `/functions/v1/account-delete` accepts **only** `{"confirmation":"DELETE"}` with verified bearer identity and returns `{"deleted":true}`. Hard Auth deletion targets that verified account only; foreign-key cascades remove account state, rounds, results, receipts, rate state and public board participation. Verify hosted deletion using an explicitly approved disposable account and readback; local cascade tests alone do not prove hosted deletion.

## Security and privacy boundaries

Both functions set `verify_jwt = false` at the gateway intentionally: the public board accepts no bearer, and publishable keys are not JWTs. The handler independently verifies supplied bearer tokens with Supabase Auth `getUser(token)`; it never trusts decoded JWT fields. Missing identity is accepted only for leaderboard reads; invalid tokens and anonymous Auth users are rejected. The browser refreshes SDK session state and may retry a 401/403 public leaderboard read once anonymously, never a mutation.

`ranked_private` tables have RLS and revoked client access. Only the service role can execute `public.ranked_game(uuid,jsonb)`; the Edge handler supplies the verified user separately, never a payload user ID. Client scores, elapsed time, hint counts and imported saves are rejected. Per-account requests are limited to 120/minute, including rejected transitions; anonymous boards lack an application rate bucket. Bounded pagination is not complete abuse protection. Review production anonymous-read controls separately.

This protects authoritative score integrity, not answer secrecy: the offline roster is public. It is not bot-proof or protection against multiple Google accounts. Google sign-in and enrollment do not grant analytics consent; no account identity goes to PostHog. The early callback scrubber removes OAuth URL values before analytics. Only locally initiated PKCE code exchanges may establish a callback session; unsolicited access/refresh-token fragments are scrubbed and never imported. Authenticated state, pending mutations and response acceptance are bound to the initiating user ID; identity changes clear previous private projections, while same-user token refresh preserves gameplay. See [analytics](analytics.md) and [public privacy page](../privacy.html).

## Local verification

From the repository root, with Node 22, Python 3 and Deno 2 installed:

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs tests/guest-session.test.mjs
node scripts/export-ranked-roster.mjs --check
python3 tests/source-check.py
deno check supabase/functions/ranked-game/index.ts supabase/functions/account-delete/index.ts
deno test tests/ranked-backend-edge.test.ts
```

For native PostgreSQL with standard binaries including `psql`:

```sh
PG_BIN=/path/to/postgresql/bin node --test tests/ranked-backend.test.mjs
```

The existing ignored macOS ARM64 runtime can reproduce the real SQL tests without Homebrew changes:

```sh
PG_BIN="$PWD/test-results/pg-runtime/node_modules/@embedded-postgres/darwin-arm64/native/bin" \
PG_CLIENT="$PWD/tests/ranked-backend-pg-client.mjs" \
PG_MODULE="$PWD/test-results/pg-runtime/node_modules/pg/lib/index.js" \
node --test tests/ranked-backend.test.mjs
```

If absent, the recorded runtime setup used `npm install --prefix test-results/pg-runtime --no-save @embedded-postgres/darwin-arm64@17.10.0-beta.17 pg@8`. Its native package install script hydrates required library symlinks; do not skip it. The Node helper substitutes for missing `psql`, not the database. Tests create a temporary isolated server using a Unix socket, run migrations and remove it afterward. Supabase Auth schema/roles are simulated; SQL, constraints, grants, locks and independent concurrent connections are real.

If Deno dependency downloads stall, the recorded fallback installs the pinned SDK under ignored `test-results/edge-runtime` and checks from there with `--node-modules-dir=manual`; see the local `test-results/backend-contract.md` report. HTTP tests inject Auth/RPC/deletion mocks and are not hosted verification.

With a verified local server on port 4173 and installed `playwright-cli`:

```sh
python3 tests/run-browser.py --suite guest-session-checks.js --suite accounts-checks.js --suite leaderboard-checks.js --suite offline-checks.js
```

Account browser tests route-mock SDK/API. Label them as rendered frontend contract tests, not live OAuth or database evidence. Historical full-suite limitations remain in [TESTING.md](../TESTING.md).

## Separate release gates

The Pages workflow validates branch pushes, PRs and manual runs with all Node tests (native PostgreSQL included), source/roster parity and Deno checks/tests. Browser suites are separate. Only validated non-PR `main` runs deploy `index.html`, `leaderboard.html`, `privacy.html`, `assets/derabona-social-es-v1.png`, `robots.txt`, `sitemap.xml` and `favicon.svg`. It never deploys Supabase or configures Google - `supabase-deploy.yml` is a separate, manual-only workflow for that (see "Applying migrations to the hosted database" above); it is not part of the Pages workflow and never triggers on push.

Before claiming hosted accounts work, the release owner must verify the intended project's migrations/functions and server-only environment; configure Google provider credentials and authorized Supabase callback; verify canonical/language-preserving redirect allowlists; and exercise real Google login, cancellation, session refresh, cross-device progress, identity rejection, anonymous/enrolled boards, offline practice isolation and approved account deletion/readback. Publish/read back the actual static artifact and privacy page and run deployed browser smoke checks. Keep credentials and disposable-user details out of public artifacts. Provisioning alone, mocked OAuth and local SQL success do not satisfy these gates.
