# ADR 0008 — Standalone leaderboard destination

- Date: 2026-09-13
- Status: Accepted — "Account controls remain on the game" and the page's lightweight-size intent are amended by [ADR 0014](0014-leaderboard-competition-crests-and-account-dialog-parity.md): the page now embeds competition crests and a near-full copy of the account dialog for component parity, with only the Google OAuth handshake itself still requiring a trip to `index.html`.

## Context

Rankings are a core engagement surface, not incidental account settings. The initial dialog hid that surface, offered little space for hierarchy and had no direct shareable destination. The owner requested a dedicated page with deliberate UI and UX.

## Decision

Serve a lightweight static `leaderboard.html` alongside the portable game. Use prominent Play / Leaderboard links, a clear heading, global/competition scope, an authenticated personal-position section, semantic ranking rows and bounded pagination. Language and competition are URL state. Preserve shared server ranks for ties and use distinct loading/error/retry/empty/no-result/guest states instead of invented activity or competitive metrics.

Keep the existing cream/navy/celeste identity, system typography, visible keyboard focus and mobile touch targets. Public access requires no login. Reuse the game's public backend configuration and persistent Supabase auth storage contract for optional personal placement, with configuration parity tests to catch drift.

The destination only reads leaderboard projections: it does not start a round, alter gameplay, import guest results, rename profiles or exchange OAuth callbacks. Authentication failure degrades to the anonymous board. Account changes invalidate private projections and stale responses. It loads no analytics; the game's independent consent-first analytics remains unchanged.

## Consequences

- `index.html` stays a complete offline guest game; only online rankings need the separate file and network.
- GitHub Pages packaging and sitemap now include the leaderboard. No backend migration or OAuth-provider reconfiguration is required.
- The leaderboard dialog is removed. Account controls remain on the game.
- Browser checks cover real page navigation/save preservation, URL filters/language, mobile fit, public/authenticated views, request failure, ties and pagination. SDK/API mocks establish UI contracts, not hosted Google OAuth.
- No score or alias policy change: ADRs 0006 and 0007 still govern immutable verified results and automatic animal aliases.
