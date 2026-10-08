# ADR 0029 — One navigation shell for Play, Groups and Leaderboard

Date: 2026-10-08

Status: accepted (owner-approved redesign "B"). Amends [ADR 0028](0028-game-first-experience.md) navigation and [ADR 0020](0020-guest-ranked-disclosure.md) disclosure copy; game-first entry is unchanged.

## Context

A global review of the live site (`622493a`) found that the remaining problems were distribution and wording rather than missing features:

- The game used *Diaria / Sin límite / Crear grupo / Tabla* while standings used *Jugar / Grupos / Clasificación*; the same destination had three names, and groups were small text links.
- On a 390 × 844 phone the answer feedback and **Next player** landed below the fold after answering, with no scroll. The hint button stayed active after resolution and revealed clues appeared below the answers, far from the career.
- About 230 px of brand, tagline, links, rules and a three-line guest notice preceded the crests.
- The completed Daily linked to a group only by name. A group showed `0` and "Sin juego elegible" right after a Daily finished before joining, without saying why.
- Account showed career-only *played/correct* next to a combined points total, which disagreed with the public table.

## Decision

- **One vocabulary and one navigation on every page:** *Jugar · Grupos · Tabla* / *Play · Groups · Leaderboard*, the same `nav.site-nav` markup with icon + label on `index.html` and `leaderboard.html`. Above 800 px the links sit in the masthead; at 800 px and below the same element is a fixed, thumb-height bottom bar. The game still opens directly on the puzzle; this is not a lobby and adds no click before play.
- **Groups is always "Grupos".** It links to the groups page; creation stays one tap away there and directly below the puzzle and on the result.
- **Keep the next action in view.** When an answer resolves, the feedback and Next/Show result row is sticky above the bottom bar. The hint button sits beside the question (a short "Pista" label on phones, full label for assistive tech), hides once the round resolves, and revealed clues are chips inside the career panel.
- **Guest disclosure in one line** above the career: "Jugás como invitado: tus puntos no cuentan en la tabla. Iniciar sesión". The non-transfer and tab-scope detail remains in the Account dialog and the one-time post-answer reminder. It is still visible before the first answer, still bilingual, still absent from `file:` play.
- **Result as a scorecard:** dark card with per-player tiles, review and streak/countdown; Share is the primary action, Play Unlimited secondary. For a signed-in member, the result then shows the first group's weekly top three (plus your own row) from the existing read-only `standings` action, requested only once the result is visible, never on arrival.
- **Groups list shows your position:** each card reads your rank and weekly points from the same read-only `standings` action; failures leave the card without a rank instead of inventing zeros. Member states use plain language ("Todavía no sumó esta semana", "Jugó hoy antes de unirse · suma desde mañana").
- **Leaderboard naming:** the visible heading is *Tabla general / Leaderboard*; the document/OG title keeps "Clasificación pública — derabona" for search.
- **Account counts are labelled honestly** as Unlimited-only (*Sin límite: jugados / acertados*) until a reviewed migration adds Daily results to `progress.answered/correct`.
- The tagline stays in the DOM as the game's `h1` but is visually hidden at 800 px and below, where it was unreadably small.

## Boundaries

- No backend, schema, scoring, persistence, clock or eligibility change. The only new network use is the existing authenticated, read-only `private-leagues` `standings` action.
- Saved games, clocks, guest/ranked boundaries, consent-first analytics and single-file offline play are unchanged. The analytics banner sits above the bottom bar.
- Group details still have no Play Daily CTA; the bottom bar is site navigation, not a game action.

## Verification

Full Node suite with native PostgreSQL; full browser runner including the real local Edge/PostgreSQL group journeys; desktop and phone screenshots of guest play, answered state, result, groups, group standings and leaderboard. Account authentication remains simulated in browser checks.
