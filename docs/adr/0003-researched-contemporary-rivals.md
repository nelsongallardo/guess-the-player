# 3. Researched contemporary rivals

Status: Accepted — implemented and verified 2026-09-13. Research snapshot: 2026-09-12.

Supersedes the boundary-tier sampling and roster-only candidate restrictions in [ADR 0002](0002-origin-first-distractors.md). Origin-first classification and saved-round preservation remain in force.

## Problem

The first origin fix removed Henry/Mendieta from Maradona's options but replaced them with Argentina-start players who debuted decades later. The fixed top-eight pool also allowed randomness to drop a clearly stronger candidate: a reproduced Messi regression omitted Iniesta for a substantially weaker match. Increasing score weights cannot supply contemporaries missing from the candidate database.

The owner explicitly authorized Wikipedia research beyond the playable roster. Candidate quality, not preserving the old sampling algorithm, is the objective.

## Research independently of the playable deck

Keep the 60 playable careers, competition decks, complete crest timelines and translated notes unchanged. Add a separate, embedded `DISTRACTOR_PROFILES` bank containing researched names and matching features: national-team country, broad role, senior start/end, senior club route, starting football system/region, source excerpts and caveats. These profiles are **wrong-answer candidates only**, not additional playable rounds. They do not claim the full crest/date/translation audit required to become playable targets.

Use retrieved Wikipedia career tables as discovery and chronology evidence, with an independent retrieved domain per person. Cover sparse systems as well as old legends: Argentina, Brazil, Portugal, France, Netherlands, Sweden, Norway, Iceland, Czechia, Peru, Chile, Uruguay and Italy. Do not infer origin from nationality. Do not treat youth, coaching, announced-but-unused contracts or post-retirement amateur matches as professional career spells. Uncertain endpoints and exceptional returns are disclosed in the source ledgers.

`research/verified-distractors.json` is the curated bank; its exact JSON content is embedded in the model. Regional evidence ledgers retain literal source URLs and short retrieved excerpts. There is no runtime Wikipedia/API request. First-club origins are checked against the existing map; contradictory system assignments fail explicitly.

## Matching

Build eligibility from the existing curated wrong-name pool plus bank profiles, excluding the target and identical ordered club routes. Keep the old wrong names eligible so already-saved rounds remain valid.

Use six strict tiers, consumed in order:

1. Same starting football system, contemporary.
2. Same system, other era.
3. Same region, contemporary.
4. Same region, other era.
5. Other region, contemporary.
6. Other region, other era.

A contemporary has an overlapping senior career and a debut no more than **eight years** from the target's debut. Eight years is an explicit game-design heuristic, not a historical definition. Starting football system remains the stronger visible clue. Retain every stronger-tier candidate before filling the final required tier; never discard a stronger tier just for variety.

Within the boundary tier retain ADR 0002's career-similarity score. For Hard, add independent uniform noise in `[0, 3)` to each candidate's score, then take only the number of names still required. A candidate can never replace another more than three base-score points stronger in the same tier. Shuffle beforehand for ties and shuffle the final five answer positions. Strong matches may recur; variety is not worth obvious giveaways.

The internal Medium helper retains its broader sampling within the new tiers. Easy retains its legacy playable-roster behavior. Neither is exposed as a difficulty selector. Bank profiles have no competition-membership bonus because those tags are not part of their research scope; competition still selects the playable deck, not the rival pool.

## Compatibility and limits

- No migration rerolls an existing round, whether started or unstarted. Guesses, hints, order, points and history survive; only newly generated rounds use the bank and matcher.
- Validate bank-backed wrong names against researched eligibility, but reject unknown names and bank IDs in playable decks.
- The extra bank is intentionally distinct from the playable roster. A repeat player who learns the entire target roster could learn that these names are never correct; promoting researched profiles to full playable careers is a separate future improvement, not silently claimed here.
- An origin/era match is not a guarantee of equal difficulty. Legends and short/single-club careers remain recognizable, and thin exact-era cohorts fall back explicitly rather than inventing data.
- Source consistency tests verify embedding and provenance structure, not historical truth. Retrieved research and documented qualifications remain essential.

## Verification contract

Reproduce both old failures before implementation. Test every target/competition for unique eligible names, origin/era-tier preservation and the bounded quality gap; test researched bank embedding, source domains, roles, IDs and coverage; preserve fixtures generated from published 30/40/50/60-player models. Exercise the actual Spanish Maradona case, wrong guesses, hints, reload, Next and existing scoring in a browser. Run all HTTP, bilingual, mobile, offline-file, denied-storage and brand suites without exclusions. Verify the deployed artifact and live gameplay before declaring this published.
