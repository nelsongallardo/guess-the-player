# ADR 0028 — Put the game back on arrival

Date: 2026-10-08

Status: accepted (owner-directed correction of ADR 0027).

## Context

After using the release, the owner rejected the Play overview as cluttered and app-like. It replaced the engaging puzzle with instructions, destinations and another click to begin. The game must remain inviting for both new and returning players, while making groups discoverable without exploration.

## Decision

Open the selected puzzle immediately. Daily is the default; explicit Unlimited URLs resume that mode. Completed Daily opens its actual result directly. Resolve account identity and mandatory nickname enrollment before starting ranked play; auth-only group routes and standings remain inert. The existing read-only overview API is an internal status step, not a page. No backend, scoring, persistence or eligibility change is needed.

Retain the club crests and ink-blue pitch as the visual focus. Use a compact Daily / Unlimited switch, contextual Create group (or My groups) and Leaderboard links, and a compact brand/language/Account header. Help remains available in the footer. Remove the dashboard sections, Back to Play control, large navigation tabs and share-text preview.

Show the ten answer names in two columns at every width with readable wrapping and touch targets. Hide decorative answer letters/arrows and unrevealed hint boxes; retain wrong/correct markers, revealed clues and meaningful feedback. Scope answer presentation rules to #options because competition-picker buttons reuse .option and still need their counts and Completed labels.

A short invitation below the puzzle explicitly offers Create a group. Results offer Share and Unlimited beside the score, then existing groups for comparison or an invitation to create one. Weekly standings, trophies, membership rules and intent-preserving sign-in remain unchanged. The group page still has no Play Daily CTA.

## Boundaries

- Opening the game starts its scoring clock, as before ADR 0027. Existing clocks are not reset by reload, mode or language changes. The consent delay for a brand-new local clock remains.
- Group creation/joining stays explicit. Only Daily results finished after joining count, never global or earlier results.
- Cloud failure offers Retry or explicit unranked practice. Choosing Daily from signed-in practice first retries account resolution instead of inventing a local ranked result.
- Finished players see answer feedback before Show result; returning to a completed Daily goes straight to its summary. Changing modes removes stale summaries.
- Guest boundaries remain visible, bilingual, concise, and absent from portable file play. No new analytics, assets, framework or dependencies enter the runtime.

## Verification

Exercise guest HTTP/file play, denied storage, engaged reload/history, both languages and small screens. Exercise account entry/enrollment/retry/identity, completion, UTC rollover, competition restrictions, and actual PostgreSQL/Edge group creation → Daily → standings. Browser Auth is simulated; these checks are not a target-user study or new hosted OAuth verification.
