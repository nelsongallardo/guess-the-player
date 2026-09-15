# 20. Disclose guest score before play and remind once after the first result

Status: Accepted — implemented 2026-09-15. Extends [ADR 0006](0006-accounts-and-ranked-progress.md) and [ADR 0011](0011-longer-decay-window-and-guest-clock-persistence.md).

## Context

The game deliberately starts immediately without an account gate. Signed-out players could see a prominent leaderboard link and result copy such as `+25 points` while the default guest/unranked mode label and cumulative guest total were hidden. The account dialog accurately explained that guest progress is never imported, but only after a player found the icon-only account control and opened it. Players could therefore complete several valid guest rounds before learning that those results were local rather than ranked.

The optional analytics-consent banner also covers part of the first mobile round on a new canonical-site visit. The guest scoring clock previously started behind that choice, charging the player for time in which gameplay was not meaningfully available.

## Decision

- Keep immediate guest play. Do not add a startup dialog, mode-selection gate or mandatory account creation.
- On configured online play while signed out, show a persistent, non-dismissible status directly above the career panel. In both languages it states that the player is a guest, the score stays in the tab, cannot transfer after sign-in and does not appear on the leaderboard. Its CTA opens the existing Account dialog; it never starts OAuth directly.
- Make the signed-out Account label visible above 580px and benefit-specific ("Sign in to compete" / "Iniciar sesión para competir"). Keep the compact icon plus accessible name on narrow phones. Signed-in controls keep their existing treatment.
- Qualify guest win feedback as guest score and unranked. After the first resolved signed-out guest round, show one inline, nonmodal polite status announcement that the result cannot transfer and future leaderboard points require signing in before the next player. Store only a `shown` flag in `sessionStorage`, so it is capped per tab and survives refresh without becoming a long-term identifier. Language changes translate the open reminder without changing gameplay.
- Hide both guest disclosures promptly after authentication and omit the online-account CTA from portable `file:` play. Practice after a cloud failure retains its explicit unranked-mode treatment.
- On a new canonical-site round with no saved round clock and an unresolved analytics choice, hold guest elapsed time at zero. Resolving the choice locally or through a cross-tab storage event starts and persists a fresh clock. If gameplay is nevertheless activated behind the banner first, stop pausing and preserve the original page-load timestamp so the pending choice cannot produce a zero-time score. An existing valid per-player `CLOCK_KEY` remains authoritative and is never reset by reload. Consent still controls analytics only; accepting or declining does not change gameplay state or emit pre-consent events.
- Correct the How to Play copy to the current ten-option, 110-player game.

## Consequences

- Guest answers remain fully playable and locally scored, but the UI no longer invites an inference that local points are ranked points.
- The reminder is contextual and frequency-capped rather than a repeated interruption. Its sign-in action preserves the account dialog's existing non-transfer warning and informed Google-login step.
- Portable/offline guest play, saved gameplay keys, ranked APIs, Supabase schema and analytics event/property allowlists are unchanged.
- Browser coverage must verify desktop/mobile disclosure, bilingual switching, CTA routing, one-time reminder persistence and announcement, offline omission, no horizontal overflow, behind-banner gameplay and local/cross-tab consent-clock fairness. Static coverage keeps current rules copy and the signed-out label contract from drifting.
