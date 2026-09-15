# 17. Cap the desktop career grid at two rows, scroll sideways past that

Status: Accepted — implemented 2026-09-15. Amends [ADR 0016](0016-career-grid-at-every-width.md).

## Context

ADR 0016 made the four-column career grid apply at every width, removing desktop's horizontal-scroll timeline entirely so a long career never needed the old scroll/arrow-key interaction to see every club. That solved the friend's original complaint, but introduced a new one from the owner: on desktop the game panel is usually the whole browser viewport, so a career with many clubs now grows to three, four or more rows, pushing the answer options below the fold - the player has to scroll *down* just to reach "Who is this player?".

Mobile doesn't have this problem: the whole page already scrolls vertically there for other reasons, so extra timeline rows cost nothing. The issue is desktop-specific.

## Decision

- The plain four-column wrapping grid from ADR 0016 (unbounded rows, no scroll) goes back to being mobile-only, scoped to `@media(max-width:800px)` - functionally unchanged from ADR 0016 at those widths.
- Desktop (`@media(min-width:801px)`) gets a different layout: `.timeline{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,auto);grid-auto-columns:150px;...}`. `grid-auto-flow:column` fills each column top-to-bottom (two cards) before starting the next column, capping the grid at exactly two rows regardless of career length; a career longer than fits in two rows just grows more columns, which the parent `.timeline-scroll` (`overflow-x:auto`, a real scrollbar again) lets the player reach by scrolling right - `#timeline-scroll` gets `tabindex="0"` back for keyboard scrolling too. Most careers (up to ~14 clubs at a typical desktop width) still need no scrolling at all; only exceptionally well-traveled players do.
- Reading order stays strictly chronological in the DOM either way - only the *visual* path changes. On desktop, each odd/top card points down to the card directly below it (same column, next chronological club). Each even/bottom card points **up-right** to the next column's odd/top card. A plain right arrow here is wrong: it visually targets the next column's bottom card and skips one chronological stop. The path therefore reads as chronological pairs: down within a pair, then up-right to the next pair - not the single unbroken row ADR 0016 (and the original pre-0016 desktop) used.
- The `#timeline-scroll` aria-label copy (`grid` key) was simplified to "Club career, in chronological order." in both languages, dropping the specific "read left to right, then the next row" claim - that description is no longer accurate at every width, and the actual reading order is already conveyed by the DOM order screen readers walk through regardless of visual layout.
- `#career-navigation` (the old scroll-hint text and arrow buttons, removed in ADR 0016) stays removed. The visible scrollbar plus a partially-cut-off column at the edge is the affordance now, matching how the pre-ADR-0016 desktop version relied on its own visible scrollbar rather than the buttons being the primary cue.

## Consequences

- Verified in a real browser: the 16-club longest career now renders as exactly 2 rows at 1440px (was 4 under ADR 0016) with genuine horizontal overflow (`scrollWidth > clientWidth`), and `scrollBy` actually moves `scrollLeft` - confirming the fallback scroll path works, not just the CSS cap. An 8-club career (Zlatan Ibrahimović) fits in 2 rows with zero horizontal overflow at 1440px, so most careers never need to scroll. Mobile at 375px is pixel-for-pixel unchanged from ADR 0016 - same longest-career screenshot, no horizontal scroll, all 16 clubs present.
- `tests/browser-checks.js`'s per-width layout loop now branches like it did before ADR 0016: `width<=800` still asserts no horizontal overflow (mobile), `width>800` now asserts the desktop career is capped at 2 distinct row positions *and* genuinely overflows horizontally for the 16-club fixture, replacing ADR 0016's blanket "never overflows at any width" assertion.
- No change to the model, scoring, hints or DOM order - `CareerGame`/`renderCareer` output the same list of `<li class="club">` elements in the same chronological order as before; only the CSS placement and connector-arrow styling differ by width.

## Connector correction

The initial implementation inherited the base horizontal `➜` connector on even/bottom cards. In a column-major two-row grid that arrow appeared to connect bottom-to-bottom, so a six-stop route rendered as three vertical branches plus a separate lower row rather than one sequence. The desktop override now renders `↗` in the inter-card gap for each non-final even card. A dedicated static regression test and a browser check use Diego Milito's six-stop route to assert `↓, ↗, ↓, ↗, ↓` on desktop while preserving the mobile row-major arrows.
