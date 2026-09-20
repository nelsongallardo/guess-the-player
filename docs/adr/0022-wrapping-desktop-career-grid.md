# 22. Wrap the desktop career grid at six columns instead of paging it

Status: Accepted — implemented 2026-09-18. Supersedes [ADR 0018](0018-row-major-paged-career-grid.md)'s eight-club pages and relaxes [ADR 0017](0017-desktop-two-row-career-cap.md)'s hard two-row cap.

## Context

The owner reported missing arrows in a 16-club career and asked why. The arrows were in fact working as specified — `.club:nth-child(4n):after{content:none}` deliberately drops the connector at each row end — but investigating surfaced a real defect underneath.

ADR 0018 grouped clubs into pages of up to eight (a 4×2 block) and laid pages side by side on desktop, reachable through `.timeline-scroll`'s horizontal scrollbar. That puts card 9 immediately to the **right** of card 4, because page 2's top row sits beside page 1's:

```
page 1          page 2
1 2 3 4         9  10
5 6 7 8
```

A left-to-right layout invites reading straight across the top row, which yields `1 → 2 → 3 → 4 → 9 → 10 → 5 → 6 → 7 → 8`: chronology jumps from the 4th club to the last, then back to the middle. The row-end arrow suppression made this worse rather than better, since the one place a connector could have warned "do not continue straight across here" is exactly where it was removed. The only remaining cue was the gap between pages.

This affects careers longer than eight clubs; shorter ones are a single page and were always correct.

## Decision

- `renderCareer()` emits **one flat list** of `.club` cards with no page wrappers. `:last-child` and `nth-child` therefore mean "the career", not "this page" — the mismatch that produced the bug.
- Desktop (`min-width:801px`) uses the same plain wrapping grid mobile already uses, at **six columns** instead of four. Visual order is then always chronological order.
- Connector suppression is **not** global. Each grid suppresses on its own column count: `4n` on mobile, `6n` on desktop. A global rule would strike mid-row cards in whichever grid has a different column count.
- Careers longer than 12 clubs get a `.timeline-long` class that compacts card, crest and label sizing. This keeps the answer options as close to the fold as possible without scrolling or paging. The class is set at every width but every rule is scoped inside the desktop media query; mobile stays pixel-identical to ADR 0016.
- Mobile is unchanged.

## Consequences

Measured across all 220 careers at 900/1128/1280/1440px:

- **Visual order equals chronological order for every career** — 0 mismatches. The defect class is eliminated rather than signposted.
- **No career needs horizontal scrolling** — 0 of 220, versus 74 (34%) on the paged layout. This restores ADR 0016's promise that every club is visible without an extra scroll interaction.
- Row distribution: 92 careers fit one row, 108 two, 19 three, 1 four.
- The worst case (Paulo da Silva, 19 clubs) puts the first answer option at y≈1023px, which is **better** than the paged layout's y≈1071px for the same career, because compaction more than offsets the extra rows. Both are below a 900px fold; that is pre-existing for this career and not introduced here.

ADR 0017's underlying concern — the career grid growing downward until the answer options fall off the fold — is addressed for 91% of careers (one or two rows) and improved even in the worst case, so its hard two-row cap is relaxed rather than reinstated.

## Alternatives considered

- **Restore a connector at page boundaries only.** Minimal change, but it signposts the ambiguity instead of removing it, and leaves the 34% horizontal-scroll rate untouched.
- **One single uninterrupted row.** Chronologically unambiguous and simple, but measured at **159 of 220 careers (72%) requiring horizontal scrolling**, including six- and seven-club careers that previously fit comfortably. That directly contradicts ADR 0016, whose entire purpose was eliminating that interaction, so it was rejected after measurement.

## Testing notes

Two checked-in browser suites were found to be silently testing the wrong thing and were fixed here: `tests/career-arrow-checks.js` and `tests/browser-checks.js` both loaded `index.html?lang=en` without `&unlimited=1`. Since Daily became the default landing mode, `render()` short-circuited into `DailyUI` and their Unlimited fixtures were never exercised. `tests/browser-checks.js` also computed row counts from `.timeline-page`, which no longer exists.
