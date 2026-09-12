# derabona — design & acceptance contract

## Product
A football-career guessing game in one portable `index.html`: no build, framework, account, API key, external fonts, or runtime network dependency. Sixty curated players, split equally between European and South American national teams, organized into five competitions (Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão) plus an All Players mode. Data verification precedes app implementation; supporting research lives alongside (not required to play).

## Visual direction
**derabona / fútbol, de memoria.** An Argentinian football-memory identity with an original rabona-player badge and a heavy italic lowercase wordmark. Warm match-programme paper around an ink-blue pitch; celeste accents, compact records-style labels and authentic club crests. See [BRAND.md](BRAND.md) for logo sources, usage and tokens.

- Paper `#f7f4eb`; ink `#122a38`; celeste `#89cff0`; deep-blue text accent `#176180`; panel `#fffdf7`; muted text `#52636a`.
- Success `#17613e` on pale green; error `#a93637` on pale red. Text/icons accompany both colors.
- System sans-serif body, heavy editorial headings and monospaced metadata. No runtime font downloads.
- Desktop retains the horizontal career timeline and arrow/keyboard navigation. At 800px and below, show every club in numbered four-column rows in chronological DOM order; read left to right, then the next row.
- On mobile, the competition selector gets its own header row. Keep logo/language/help separate without overlap. Keep the longest career's crests inside the initial 375×667 viewport and avoid horizontal scrolling.
- Answer targets remain at least 58px on narrow mobile and 65px otherwise. Preserve keyboard focus, readable supporting text, localized live feedback and reduced-motion support.
- The logo and favicon are embedded in `index.html`. Preserve legacy storage namespaces and all gameplay during the rebrand.

## Game contract
- Choose a competition (Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão) or All Players (the default) from the prominent competition badge, reachable at any time and never forced. The chosen competition persists in the saved game state and survives reload.
- Shuffle the selected competition's players into a deck without replacement (60 players for All Players; each competition's own current pool otherwise); an explicit end-of-deck recap follows the final round, offering both "play again" (same competition) and "change competition" (back to the picker).
- Each player record explicitly contains country, broad pitch position, ordered club metadata, crest image URLs, a pool of incorrect player names, and one or more competition tags.
- Every round samples four distinct distractors from the current player's pool, inserts exactly one correct name, then shuffles all five. Exclude any player with an identical ordered club-name signature from the distractor pool so the visible career cannot have two valid choices. Inside a competition, the distractor pool is first restricted to players who also carry that competition's tag; if fewer than four qualify, the round falls back to the full pool so no round is ever unplayable.
- Use existing Hard behaviour automatically, with no difficulty selector or difficulty instructions (2026-09-12: reduce cognitive load while preserving already-published gameplay). Rank eligible distractors (the competition-scoped pool where one applies, otherwise the full pool) by `12 × shared unique clubs + 5 × same country + 4 × overlapping broad role + 3 × career-year intersection/union + 2/(1 + unique-club-count difference)`. Reserve B/C sides share their parent only for similarity scoring, not chronology or ambiguity exclusions. Active `present` endpoints use the research snapshot year.
- Hard samples four rivals from the top eight, preserving the published repetition-reduction behaviour. Shuffle candidates before ranking to randomize ties, then shuffle final answer positions. These are roster-relative difficulty heuristics, not a guarantee that every round is equally hard.
- Normalize old saved difficulty preferences to Hard on load without changing any existing rounds, answer order, guesses, hints, deck, points or competition. Future rounds, competition changes, reset and replay use Hard. Keep historical results and their localized difficulty labels intact; the level helpers remain internal for legacy testing.
- Three attempts per round. A wrong answer turns red, disables itself, and consumes one attempt only. A correct answer turns green, animates, awards points and increments consecutive wins. A loss reveals the correct answer and resets the streak.
- Scoring (see `docs/adr/0001-local-results-history-and-speed-based-scoring.md`): a round is worth up to 100 points, reduced 20% per hint used (a hard cap regardless of speed) and by answer speed — full value inside a 5s grace window from when the round became active, decaying to a 50% floor by 30s. A won round always scores at least 20. The earned total is shown in the win feedback.
- Every finished game is appended to a local, per-device results history (`localStorage`, capped at the last 100 games), shown on the recap screen alongside lifetime best score/streak. A footer "Reset my results" button (confirm-gated) clears both the current game and this history — always reachable, not just at game end.
- Hints reveal country, position, then initials of the displayed name, in that exact order; all revealed hints remain visible. Repeated clicks after hint three do nothing.
- Finish a round before Next Player appears. All options and hints lock on completion. Rapid repeated clicks cannot award extra points or skip multiple rounds.
- Display current score, current streak, round progress, and attempts left. Save valid game state locally when storage is available; restricted storage must not prevent playing.
- Source links and career caveats become available after answer reveal, never leak the answer before play.
- English/Spanish UI, hints, notes, rules and accessibility labels share one offline artifact. Language changes never reset game state. Explicit URL language overrides saved preference, which overrides browser-language detection. Preserve original proper names and source article titles.

## Data contract
- Research the full senior career and country/position using retrieved career records plus independent corroboration. Date the snapshot; do not imply active-player data remains current forever.
- National teams, youth teams, coaching teams and testimonials never appear as timeline clubs. The documented Roberto Carlos senior tour loan is the explicit friendly-only exception and is visibly tagged.
- Include senior reserve-team spells and actual loans/returns. Reserve/first-team dates can overlap; document ordering. Do not invent parent playing spells between back-to-back loans.
- Distinguish announced signings from completed registration and appearances. Career-stint endpoints may denote departure or retirement rather than a last match; disclose this explicitly and never extend a retired career to an unfulfilled contract expiry. See DATA_AUDIT.md.
- Preserve continuous loan-to-permanent spells as one node, annotated. Preserve genuinely separate return spells as separate nodes.
- Embed fetched crest bytes as data URLs for reliable offline rendering. Keep original public image URLs for provenance. Crest trademarks remain their owners'; no club affiliation implied. Do not pretend a fallback is an authentic crest.

## Verification matrix
1. Data: exactly 60 unique player IDs/names; continent count 30/30; sources for every entry; all ordered club names mapped to valid crest bytes; no national-team nodes; every pool has four or more distinct incorrect names excluding the answer; every player carries at least one recognized competition tag.
2. Options: exactly five unique buttons with one correct answer across every player and many shuffles, both unscoped and within each competition.
3. Correct first/second/third try: score increments once, streak increments once, next appears, controls lock.
4. Wrong choices: disable/red/attempt decrements, repeated selection no-op, third error ends round, correct answer revealed, streak resets.
5. Hint order and boundary: country → position → displayed-name initials; no fourth hint; no attempt or score deduction.
6. Deck: every round in the active competition's pool appears once before recap; replay resets session stats and keeps the same competition; changing competition rebuilds the deck; rapid clicks do not skip rounds.
7. Persistence: reload recovers attempts, hints, choices, score, deck and the active competition; published 30/40/50-player full-roster saves finish their original decks under a missing (implicitly "all") competition field; malformed storage falls back safely; denied storage works.
8. Browser: no console errors; all images decode; local file opening and HTTP both work; no runtime external requests; offline gameplay remains functional.
9. Responsive/accessibility: every player in both languages at 320, 375, 430, 580 and 768px; every club visible in the numbered grid without horizontal overflow. Desktop 1440px keeps horizontal navigation. Thumb-sized answers, keyboard focus, translated live feedback, reduced motion, language persistence, and a complete Spanish playthrough are required.
10. GitHub: inspect commit content for secrets/generated clutter and verify remote SHA/visibility. The owner requested a public repo for GitHub Pages hosting; deploy only the game artifact, require model/data checks first, and verify the public HTTPS response and gameplay before claiming publication.
