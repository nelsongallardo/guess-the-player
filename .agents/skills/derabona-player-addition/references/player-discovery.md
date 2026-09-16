# Player Discovery Reference

Use this reference when the user has not supplied a final list of footballers, or asks the agent to recommend who Derabona should add next. Discovery produces a reviewable shortlist; it does not authorize roster edits, outreach or deployment.

## Baseline Gap Audit

Before naming candidates, inspect the current inline roster, `research/verified-players.json`, `research/verified-distractors.json`, competition memberships, `ORIGIN_CLUBS` and the coverage audit.

Record:

- current playable and bank-only IDs and names;
- counts by continent, national-team country, position, first-club football system, debut decade and competition;
- systems or eras with fewer than four eligible same-system contemporaries inside the eight-year debut window;
- thin competition pools, repeated career shapes and overrepresented country/era combinations;
- existing bank profiles that could be promoted after a full playable-career re-audit;
- likely new crest keys and whether those assets already exist.

Rank the three to five most useful gaps. A gap is useful only if filling it improves player recognition, competition coverage, career variety or rival quality—not merely a symmetric count.

Completion criterion: the discovery file contains the live baseline, named gaps and the commit used to derive them.

## Candidate Source Families

Search multiple public source families rather than copying a single “best players” list:

1. Existing researched bank profiles and their evidence ledgers.
2. Official league, federation, tournament, club-history, hall-of-fame and award pages.
3. Reputable encyclopedic career indexes and major football publications.
4. Public squad, appearance and transfer records used as discovery leads—not as sole proof of a complete career.
5. Era/system peer searches derived from a specific roster gap.

Use `web_search` to generate leads and `web_extract` or the browser to confirm that pages are retrievable. Example query shapes:

```text
"<competition or football system>" notable retired players "<decade>"
"<club or national team>" squad "<tournament/year>"
site:<official-domain> "<position or award>" "<year range>"
"<candidate name>" clubs career
```

Do not treat search-result snippets, AI-generated lists, social popularity, private databases or guessed URLs as evidence. Avoid scraping personal data; football career facts and public professional profiles are sufficient.

Completion criterion: every longlist entry records `sourceFamily`, the exact discovery `query`, result `url` and `retrievedAt` timestamp, plus at least two plausible independent evidence domains.

## Longlist Construction

1. Set `mode` to `discovery`, set `targetCount` to an integer greater than zero and record any requested continent, country, competition, era, position or recognizability constraints. Use `mode: "supplied"` only when the user gave the exact names; that mode skips the 3× longlist requirement but keeps every other gate.
2. Copy `templates/candidate-shortlist.json` into the task's reviewed research area; never edit the template in place.
3. Generate a longlist containing at least three times the target count after consolidating accidental within-batch duplicates. Keep current playable matches only as rejected audit entries, and keep a bank-only profile only when marked as a promotion.
4. Normalize proposed IDs with the repository's existing slug style, while preserving the player's actual display name. Match both proposed ID and Unicode-casefolded display name against the playable and bank datasets.
5. Set `existingStatus` to exactly `new`, `bank-promotion` or `already-playable`. Populate `existingMatch` with dataset, ID, name and evidence file for every non-new candidate. A bank match can never be labelled `new`; a playable match must be retained only as `already-playable` with `decision: "reject"`.
6. Capture only enough chronology to judge fit: national-team country, broad position, first senior system, approximate debut/end years, likely competitions and ordered-club outline.
7. Add two independent evidence leads from different domains. Full excerpts and final chronology belong to the later player-record research phase.
8. Record a concrete reason for every rejection; never silently drop an inconvenient candidate.

Completion criterion: the longlist is at least 3× the target, deduplicated against both current datasets and complete enough to score.

## Hard Gates

A candidate cannot be selected unless all applicable gates pass:

- `notAlreadyPlayable`: ID and display name are absent from the playable roster.
- `bankStatusResolved`: both ID and casefolded display name were checked against `research/verified-distractors.json`; any match is recorded as `bank-promotion` with a populated `existingMatch`.
- `promotionHandled`: an existing bank profile is explicitly treated as a promotion and will be removed from the bank source batch. Use `null` when `existingStatus` is `new`; do not treat a non-applicable promotion gate as a failure.
- `distinctCareer`: the likely in-scope ordered club sequence is distinguishable from every playable career.
- `seniorScopePlausible`: the candidate has a material professional senior career under `research/data-policy.md`.
- `twoDomainsLikely`: at least two independent retrievable evidence domains are available.
- `identityResolved`: no substantive ambiguity about which player or club route is being evaluated.
- `rivalPlan`: at least four likely eligible same-system contemporaries exist within the eight-year debut window, or the shortlist names the additional bank research needed.
- `constraintsFit`: the candidate satisfies the user's explicit scope.

A failed gate means `decision: "reject"`, except a resolvable rival/evidence gap may be `reserve` with a named next action. High recognizability never overrides a hard gate.

## Candidate Scorecard

Score each dimension from 0 to 3 only after hard gates are evaluated. Keep the six field names exactly as shown so candidates can be sorted programmatically. All six dimensions have equal weight; do not introduce hidden multipliers.

### `recognizability`

- **0:** unlikely to be recognized outside a very narrow audience.
- **1:** locally or club-specific recognizable.
- **2:** broadly recognizable to regular football followers.
- **3:** internationally recognizable without relying only on megastar status.

### `careerDistinctiveness`

- **0:** ambiguous or effectively duplicates an existing route.
- **1:** mostly common route with limited memorable variation.
- **2:** several distinctive clubs, returns, countries or transitions.
- **3:** highly memorable but still evidence-verifiable chronology.

### `rosterBalance`

- **0:** deepens an already crowded country/system/era without another benefit.
- **1:** neutral addition.
- **2:** fills one material country, system, era, position or competition gap.
- **3:** fills multiple documented gaps without creating a new coverage problem.

### `evidenceAvailability`

- **0:** complete chronology is unlikely to be verifiable.
- **1:** two leads exist but important scope questions remain.
- **2:** two solid independent domains appear to cover the full route.
- **3:** strong official/primary material plus independent corroboration is readily retrievable.

### `crestWorkload`

Higher is easier and safer:

- **0:** several unresolved clubs/assets or doubtful identities.
- **1:** multiple new crest keys or difficult source assets.
- **2:** one or two well-sourced new crests.
- **3:** all likely club keys and authentic assets already exist.

### `rivalCoverage`

- **0:** no viable same-system contemporary plan.
- **1:** coverage requires several new bank-only profiles.
- **2:** four likely peers exist but need detailed validation.
- **3:** the current audited bank/roster already provides strong coverage.

`totalScore` is the integer sum of the six dimensions, with a maximum of 18. Do not add hidden weights. Explain any tie-break rather than altering scores after the fact.

## Selection Rules

1. Reject every hard-gate failure before ranking totals.
2. Normally select candidates scoring at least 12, with both `evidenceAvailability` and `rivalCoverage` at least 2.
3. Put scores of 9–11, or candidates with one specifically resolvable uncertainty, in reserve.
4. Reject scores of 8 or below unless the user explicitly changes the selection objective; document that override.
5. Optimize the batch as a portfolio: country, system, era, position, competition and career shape should not all cluster together.
6. Unless the user requests otherwise, select no more than two players from the same country and debut era in one batch.
7. Prefer a recognisable sub-megastar with a distinctive route over a famous name whose career is ambiguous, poorly evidenced or impossible to support with rivals.
8. Re-check rival coverage after the final group is chosen because promotions and shared peers can change the bank plan.

Completion criterion: every selected player passes all hard gates, meets the normal score floor or has an explicit user-approved override, and improves the batch as a whole.

## Shortlist Validation

Before presenting or persisting the shortlist, validate it programmatically:

- `targetCount` is an integer greater than zero and selected candidates do not exceed it;
- candidate IDs and names are unique within the persisted longlist; matches in the playable dataset use `existingStatus: "already-playable"` and `decision: "reject"` so discovery mistakes remain auditable;
- `existingStatus` uses only the three allowed values; bank matches use `existingStatus: "bank-promotion"`, populate `existingMatch`, set `bankStatusResolved` true and have a promotion-removal plan;
- every score is an integer from 0 through 3 and `totalScore` is the exact sum of the six visible score fields;
- each candidate has at least two retrievable evidence leads from distinct organizational domains, not two subdomains or mirrors of one source;
- `decision` is exactly `selected`, `reserve` or `reject`;
- `results.selected`, `results.reserve` and `results.rejected` partition every candidate ID exactly once and agree with each candidate's `decision`;
- selected candidates pass all applicable hard gates; reserve candidates name a resolvable next action; rejected candidates state a reason;
- the selected portfolio is rechecked for country/era concentration and rival coverage after promotions.

Run the checked-in validator from the repository root:

```sh
node .agents/skills/derabona-player-addition/scripts/validate-shortlist.mjs path/to/candidate-shortlist.json
```

If validation fails, correct the shortlist data or move the candidate to reserve/reject; never alter the rules merely to make the file pass.

Completion criterion: the persisted shortlist parses, recomputed totals match, all decisions are allowed and every candidate is accounted for exactly once.

## Required Output

Return and persist three sections using the template fields:

- **Selected:** up to the target count, ordered by recommendation, with total score, gap served, concise rationale, evidence leads, crest impact and rival plan. If fewer than `targetCount` pass, report the shortage and do not lower hard gates or invent extra candidates.
- **Reserve:** credible substitutes with the missing research or condition required for promotion.
- **Rejected:** every removed longlist entry with a specific gate failure or score-based reason.

Also include:

- baseline commit and timestamp;
- target constraints;
- `baseline.longlistCounts` with discovered, before-deduplication and after-deduplication totals;
- coverage gaps the selected batch improves;
- `summary` with the expected number of new playable records, bank-only profiles and crest keys;
- `summary.unresolvedDecisions` for questions requiring the user.

Stop after discovery when the user asked only for recommendations. Begin full record research and repository edits only when the requested task includes adding the selected players.

Completion criterion: another agent can reproduce why every candidate was selected, reserved or rejected without relying on conversational memory.
