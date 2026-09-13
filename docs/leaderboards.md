# Accounts and leaderboards

## Delivery status and architecture

The Supabase schema and both Edge Functions are deployed. Hosted verification with a disposable admin-created Auth account passed ranked actions, idempotency, global/membership boards and account deletion with exact database readback; test data was removed. Google is the only enabled public signup provider, but interactive Google OAuth remains unverified. Static publication is a separate main-branch Pages workflow; see [TESTING.md](../TESTING.md) for the evidence boundaries.

`index.html` remains a portable offline guest game. Optional accounts load the pinned Supabase JS SDK (2.57.4), use Google OAuth/PKCE, and persist the session separately under `derabona.auth.v1`. Only the public project URL/publishable key belong in the browser. Never expose service-role keys, Google client secrets, access/refresh tokens or CLI credentials in docs, screenshots or commits.

- `supabase/migrations/202609130001_ranked_schema.sql`: private state, grants/RLS, transactional RPC and score projections.
- `supabase/migrations/202609130002_ranked_roster.sql`: frozen v1 roster, candidates, matching tiers/similarity and canonical memberships.
- `scripts/export-ranked-roster.mjs --check`: read-only parity check against the actual inline model. Do not rewrite a ruleset already used for results; plan a reviewed migration/version transition.
- `supabase/functions/_shared/http.ts`: strict JSON/action validation and verified identity boundary.
- `supabase/functions/_shared/supabase.ts`: server-only Supabase dependency adapter.
- `supabase/functions/ranked-game/index.ts`, `supabase/functions/account-delete/index.ts`: Edge entrypoints.
- `supabase/config.toml`: local project/auth settings and function gateway configuration.

## Progress and public enrollment

Guest gameplay is per-tab sessionStorage with memory fallback. Language and analytics retain independent localStorage lifecycles. Legacy localStorage gameplay migrates as one linked snapshot only after complete destination write/readback verification. Conflicting snapshots remain separate; explicit recovery can replace the tab snapshot. No guest, legacy or practice score is imported into ranked play. See [ADR 0006](adr/0006-accounts-and-ranked-progress.md).

The server creates one active round per account across devices. A start for another competition resumes that round. Persisted server time includes time away; options, hints, guesses, points and terminal transitions are server-owned. There are at most two hints and three guesses. Only the first terminal result per account/player/ruleset counts; there is no ranked reset, replay or import endpoint. Exhausted start returns `completed: true` with `round: null`.

Enrollment is optional and requires a user-chosen public nickname, not a Google identity-derived default. Nicknames are trimmed, 3–24 permitted letters/numbers/spaces/underscore/dot/hyphen, and case-insensitively unique. Use a neutral nickname rather than a real name. Public boards require both enrollment and at least one verified result in the selected board. Enrollment, an active round or preliminary wrong guesses alone produce no row. A terminal loss qualifies with zero points.

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
| `enroll` | `nickname`, UUID `idempotencyKey` |
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
python3 tests/run-browser.py --suite guest-session-checks.js --suite accounts-checks.js --suite offline-checks.js
```

Account browser tests route-mock SDK/API. Label them as rendered frontend contract tests, not live OAuth or database evidence. Historical full-suite limitations remain in [TESTING.md](../TESTING.md).

## Separate release gates

The Pages workflow validates branch pushes, PRs and manual runs with all Node tests (native PostgreSQL included), source/roster parity and Deno checks/tests. Browser suites are separate. Only validated non-PR `main` runs deploy `index.html`, `privacy.html`, `assets/derabona-social-es-v1.png`, `robots.txt`, `sitemap.xml` and `favicon.svg`. It never deploys Supabase or configures Google.

Before claiming hosted accounts work, the release owner must verify the intended project's migrations/functions and server-only environment; configure Google provider credentials and authorized Supabase callback; verify canonical/language-preserving redirect allowlists; and exercise real Google login, cancellation, session refresh, cross-device progress, identity rejection, anonymous/enrolled boards, offline practice isolation and approved account deletion/readback. Publish/read back the actual static artifact and privacy page and run deployed browser smoke checks. Keep credentials and disposable-user details out of public artifacts. Provisioning alone, mocked OAuth and local SQL success do not satisfy these gates.
