# 16. Show the whole career as a wrapping grid at every width, not just on mobile

Status: Accepted — implemented 2026-09-15.

## Context

The owner relayed feedback from a friend testing the game: on desktop, a long career produces a horizontal scrollbar under the club timeline, requiring an extra scroll/click/arrow-key interaction to see every club. Mobile already avoided this — at 800px and below, the timeline switched to a four-column wrapping grid showing every club at once, with the horizontal-scroll arrows (`#career-navigation`) hidden. The friend's suggestion was simply to make desktop behave the same way mobile already did.

## Decision

- The four-column wrapping grid, per-club card styling, and hidden decorative pitch outline that were previously scoped to `@media(max-width:800px)` now apply unconditionally, at every viewport width. `.timeline` gets a `max-width:640px;margin:0 auto` so columns stay a sensible width on wide screens instead of stretching to fill a 1000px+ panel.
- Only the crest disc's pixel size (56px vs. the base 79px) stays width-dependent, folded into a narrower `@media(max-width:800px)` block, so desktop keeps its larger, more legible crests inside the same four-column layout.
- `#career-navigation` (the "scroll/swipe" hint text plus the `#career-back`/`#career-forward` arrow buttons) is removed entirely, along with `moveCareer()`, `updateNavigation()`, their event listeners (click, scroll, resize), the now-unused `mobile()` viewport helper, and the `scroll`/`earlier`/`later`/`navigation`/`timeline` copy keys in both locales. None of it has a reason to exist once no width scrolls this list horizontally.
- `#timeline-scroll` drops `tabindex="0"` (it's no longer an independently scrollable region a keyboard user would tab into) but keeps `role="region"` with a static, bilingual aria-label (the old `grid` copy key, now applied via the existing `text`/`attributes` language-switch bindings instead of being computed per-render) describing the reading order.
- Both languages' "How to play" copy dropped the "on mobile, read left to right" qualifier — the reading order is no longer mobile-specific.

## Consequences

- No viewport width shows a horizontal scrollbar under the career timeline, and no width requires the former scroll/arrow-key/button interaction to see every club — matching the existing, already-tested mobile behavior, now everywhere.
- `tests/browser-checks.js`'s per-width layout loop (320/375/768/1440px) asserts `timelineContent<=timelineWidth` at every width instead of branching on `width<=800`; its `#career-forward`/`#career-back`/keyboard-arrow-scroll block is removed since the buttons no longer exist.
- `tests/mobile-language-checks.js`'s `#career-navigation` visibility assertion is removed for the same reason (nothing left to assert).
- `AGENTS.md`'s "Desktop retains horizontal timeline navigation" product invariant is superseded by this ADR; the grid-at-every-width description in `DESIGN.md` and `TESTING.md` replaces the old desktop-scrolls-independently language.
- Very long careers (the 16-spell longest case used in mobile-language-checks.js) now wrap to more rows on desktop instead of scrolling — verified to stay within the timeline panel with no overflow at 1440px, the same way it already did at 375px.
