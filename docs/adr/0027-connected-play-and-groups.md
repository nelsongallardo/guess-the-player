# ADR 0027 — Explicit play and consistent site navigation

Date: 2026-10-08

Status: partly superseded by [ADR 0028](0028-game-first-experience.md): the lobby, explicit Start gate and app-style navigation were rejected after release. Read-only status, identity boundaries, group intent and scoring contracts remain.

## Context

The owner rejected successive isolated private-league layout revisions because people still had to explore the site to discover group creation and infer how games, scores and groups fit together. The approved [whole-experience design](../superpowers/specs/2026-10-08-whole-experience-design.md) covers first and returning visits, gameplay, results, invitations, accounts and recovery.

Opening the game previously started timed play before a person chose to begin. A completed guest Daily also caused the bare URL to select Unlimited on their next visit. These behaviors undermined orientation and continuity.

## Decision

Play, Groups and Leaderboard are stable, labeled destinations. Groups are no longer nested conceptually beneath public standings. The public/friends switch is replaced by primary navigation; a group's breadcrumb provides local navigation while Groups remains the active destination. “Group / Grupo” is the user-facing term; the private-league database/API terminology is unchanged.

Play begins with an overview of today's Daily, groups and Unlimited. Daily status determines Start, Continue or View result. New timed rounds require explicit activation; loading the overview, changing language, returning from sign-in or browsing other destinations does not create rounds. Once started, an existing round's clock remains authoritative and includes time away. This is not a pause or reset feature.

A new authenticated `overview` action reads status without creating Daily or career rounds or revealing unstarted clues. Existing `dailyProgress` remains compatible with older clients. New database behavior is delivered through a forward migration; no applied migration or score/result is rewritten.

Visible group creation appears before play and after appropriate results, as well as on populated and empty Groups pages. Creation/invitation intent survives sign-in. Authentication does not itself create a group or accept membership; these remain explicit actions. Joining continues to count only eligible Daily results finished after joining. Neither earlier Daily points nor global points transfer, and no replay is granted.

Account and Help have readable labels at narrow widths. The shared header no longer displays an unlabeled global point total; account and ranking surfaces retain explicit score context. This intentionally supersedes ADR 0020's header-label treatment and ADR 0021's visible combined-score masthead placement, while preserving their disclosure and combined-account-score contracts.

The Daily result remains accessible on return. Results connect to group comparison or creation and name Unlimited as the optional next mode. Weekly standings stay the group's primary content, with Today as a compact filter, readable trophy history, and secondary management/rules. The owner's removal of the Play Daily CTA from group detail remains in force.

## Consequences

- The game remains a portable single HTML file with inline data/assets and guest play. No framework, external font or analytics expansion is introduced.
- Game initialization must distinguish reading status from activating play. Browser history, reload, OAuth, identity changes and the elapsed-time renderer all need the same activation boundary.
- The compatible database/Edge changes must be deployed before the new frontend. Pages publication does not deploy Supabase.
- Existing tests that assumed automatic play or icon-only account controls must be updated where those contracts intentionally change, while retaining model, privacy, clock, saved-state and backend behavioral coverage.
- Browser verification establishes functional journeys and responsive behavior. Usability with nontechnical people still requires observation; passing a screen-fit test is not a user study.
