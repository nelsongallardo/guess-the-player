# 2. Origin-first distractors

Status: Accepted — implemented 2026-09-12. The roster-only restriction and top-eight sampling below are superseded by [ADR 0003](0003-researched-contemporary-rivals.md); origin-first and save-preservation rules remain active.

## Problem

A La Liga round showed Maradona's Argentina-first career alongside Henry and Mendieta. Shared Barcelona/La Liga history had outweighed a more decisive visible clue: where the career starts. That made wrong answers easy to discard without recognizing the full career.

Nationality is not an adequate substitute. The displayed senior careers of Messi and Cambiasso start in Spain; Robbie Keane and Giggs start in the English football system. Youth careers and birthplaces are not displayed clues and must not drive this classification.

## Decision

The selected competition continues to determine the **correct-answer deck**. It no longer hard-restricts Hard/Medium distractors. Rivals are chosen from the existing researched roster, excluding the correct answer and identical ordered careers, with three strict origin tiers:

1. Same starting domestic football system.
2. Same broad starting region (Europe or South America).
3. Other starting region, only if needed to produce four distinct rivals.

Always consume the tighter tiers first. If four or more same-system rivals exist, every wrong answer comes from that system. If only one, two or three exist, keep all of them and fill only the remaining places from the next tier. Randomness must never drop a stronger-origin match in favour of a weaker-origin match.

Within the final tier needed, rank by:

```text
6 × shared unique clubs
+ 12 × same first senior club
+ 4 × same represented national team
+ 8 × overlapping broad playing role
+ 8 × career-year intersection / union
− 2 × absolute difference in starting years
− 0.5 × absolute difference in ending years
+ 2 / (1 + absolute difference in unique-club counts)
+ 2 if the rival belongs to the selected competition
```

The competition bonus cannot cross an origin tier. Visible career dates now have a meaningful effect instead of acting as a tiny tie-breaker behind shared famous clubs.

Preserve answer variety: Hard samples the remaining slots from the highest-ranked `8 − required tighter-tier rivals` candidates in the boundary tier. Medium's internal helper uses 16 instead of 8. Shuffle before ranking to break ties, then shuffle the final five answer positions. Easy remains an internal legacy/test helper; there is still no difficulty selector.

## Origin data

`ORIGIN_CLUBS` in the model maps the first displayed senior club to its domestic football system. Parent B/C teams share that classification, without changing the timeline itself. All current first-club identities come from the existing curated records; no careers or player nationalities are rewritten.

This is a broad football-system classification, not a claim about a particular season's divisional level or an international appearance. Cross-border exceptions are intentional:

- Swansea City is based in Wales but plays in the English league system. See [Swansea City](https://en.wikipedia.org/wiki/Swansea_City_A.F.C.).
- Monaco plays in the French league system. See [AP's Monaco academy report](https://apnews.com/article/monaco-academy-arsenal-champions-league-70bf628d4648d78be8eaf1f90c769ad7).

Origin coverage is mandatory when adding a player. An unmapped starting club is an explicit error, not a silent nationality guess. Check the actual first senior spell, including a reserve side or initial loan, rather than assuming the player's best-known youth club.

## Compatibility and limits

- Existing saved options, guesses, hints, points and round order remain untouched. The improved matcher applies to newly generated rounds, including the next round of an existing save. Refreshing does not reroll the current round.
- Keep current competition decks, all 60 player records, crests, scoring and UI unchanged apart from help text describing the new rival policy.
- Small origin pools still need a regional fallback to provide five answers. Old legends also lack enough close-era peers in this roster. The algorithm cannot make every career equally hard, and must not fabricate researched players to fill gaps. Future roster expansion should target those gaps, especially earlier Argentine peers.

## Verification

`tests/distractors.test.mjs` is imported by the existing model test entry point. It covers the Maradona/La Liga regression over 500 seeded rounds, first-senior-club exceptions, tier preservation across every player and competition, era sensitivity, thin-pool fallback and exact legacy progress preservation.

`tests/origin-checks.js` exercises the screenshot scenario in the real Spanish mobile UI: La Liga keeps its deck, wrong options have Argentine senior origins, reload preserves choices, and hint scoring/Next still work. It also samples 100 browser-generated Maradona rounds. Existing model, source, responsive, localization, offline and save suites remain enabled.
