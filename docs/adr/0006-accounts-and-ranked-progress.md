# ADR 0006 — Optional accounts and server-authoritative ranked progress

- Status: Accepted; implemented. Manual nickname enrollment below is superseded by [ADR 0007](0007-automatic-animal-aliases.md); Google login and persisted results have since been observed in the hosted account state.
- Date: 2026-09-13.
- Supersedes the device-lifetime/reset scope of [ADR 0004](0004-lifetime-score-persists-across-decks.md) and [ADR 0005](0005-permanent-seen-ledger-and-completed-competitions.md), not the pure guest model, scoring formula or compatible-save guarantees.

## Context

Device-local scores cannot establish trustworthy cross-device rankings. The owner approved optional Google accounts, public boards with optional nickname enrollment, and one verified result per player across all canonical competition memberships. Offline play must remain usable without login, analytics consent or a frontend build.

## Decision

1. Preserve the portable single-file guest game. Guest current game, history, cumulative score/streak and seen ledger use per-tab sessionStorage with memory fallback. Refresh normally retains them; ordinary tab closure ends the session subject to browser session restore. Language and analytics remain separate local preferences.
2. Migrate legacy localStorage gameplay as a complete linked unranked snapshot. Verify every destination before removing originals. Never mix conflicting snapshots or backfill missing keys across them; preserve originals and offer explicit replacement recovery. Preserve decks, engaged rounds and history. No guest/legacy/practice import or score credit to accounts.
3. Use Supabase Auth with Google/PKCE and separately persisted auth sessions. Private PostgreSQL state and service-role-only RPCs behind authenticated Edge Functions own ranked options, guesses, hints, persisted start time and scoring. The browser sends allowed actions, versions and idempotency keys, never points, elapsed time or account identity.
4. Keep one active server round per account across devices. Serialize mutations, reject stale versions and replay exact idempotent responses. Reload does not restart server time. The first terminal result per account/player/ruleset is immutable; no ranked reset, replay farming or alternate-deck rescore. Exhausted starts return completed with no new round.
5. Count each first result globally once and on every canonical competition membership, regardless of the selected deck. Public listing requires explicit nickname enrollment and at least one result in the selected board. A verified zero-point loss qualifies; enrollment or an unfinished round does not. Equal points share rank; nickname ordering only stabilizes pagination. Publish aggregates and nickname, never Google identity or account IDs.
6. Fail ranked mutations closed on cloud failure. Offer explicit unranked practice and retry/reconnect without silent mode switching or upload queues. Sign-out starts fresh guest play. Confirmed guest Reset affects only unranked session state; cloud deletion is a separate explicit destructive account action with cascading record removal.
7. Keep analytics independent: sign-in/enrollment do not grant tracking consent or link Google identity to anonymous PostHog identity. Scrub OAuth callback values before analytics. Include bilingual `privacy.html` in the static deployment.

## Consequences and limits

Guest progress is intentionally not durable account storage. Ranked time includes time away, unlike the guest in-memory clock. Server-authoritative results prevent client score forgery and replay awards, but the public roster permits answer lookup and this design does not prevent bots or multiple Google accounts. Anonymous boards have bounded pagination but no application rate bucket; review abuse controls before broader release.

The frozen v1 roster/matching export needs reviewed migration/version policy rather than retroactive edits after ranked use. Backend deployment and Google OAuth configuration are separate from static Pages delivery. Local PostgreSQL enforcement, mocked HTTP handlers and route-mocked account browsers are distinct evidence, none proving hosted Google login.

## Verification and delivery

See [accounts and leaderboards](../leaderboards.md) for exact action schemas, security boundaries, native PostgreSQL/Deno/browser commands and hosted release gates; [TESTING.md](../../TESTING.md) attributes actual local runs and preserves historical limitations. Hosted API actions and deletion have been verified with a disposable admin-created Auth account. This is not proof of interactive Google OAuth, which remains unverified. Static publication is verified separately through Pages and live artifact readback.
