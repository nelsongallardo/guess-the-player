# Guess the Player — design & acceptance contract

## Product
A football-career guessing game in one portable `index.html`: no build, framework, account, API key, external fonts, or runtime network dependency. Fifty curated players, split equally between European and South American national teams. Data verification precedes app implementation; supporting research lives alongside (not required to play).

## Visual direction
**Touchline / after-dark match programme.** Ink-black canvas, warm white typography, acid-lime accents, fine pitch markings and restrained motion. A compact football insignia and language selector lead the page. Desktop uses the horizontal crest runway with arrow/keyboard navigation. At 800px and below, show every club in numbered four-column rows, with no horizontal scrolling; preserve chronological DOM order and read left to right, then the next row. The mobile masthead/hero are compact enough for the longest career's badges to fit the initial 375×667 screen. Answer buttons use two columns on desktop, with the fifth spanning both; one column at 420px and below.

- Background `#0b100e`; card `#121b16`; raised `#1a251e`; border `#2d3b31`.
- Primary text `#f1f5ec`; muted `#a4b2a8`; lime `#c5f76a`.
- Success `#83e7a8`; failure `#ff9999`. Text/icons accompany both colors.
- System sans-serif headings, system monospace for small labels and numbers.
- Options minimum height 58px on narrow mobile screens and 65px otherwise. All controls have visible `:focus-visible` outlines.
- Respect `prefers-reduced-motion`; never require animation to understand state.

## Game contract
- Shuffle a 50-player deck without replacement; an explicit end-of-deck recap and play-again action follows round 50.
- Each player record explicitly contains country, broad pitch position, ordered club metadata, crest image URLs, and a pool of incorrect player names.
- Every round samples four distinct distractors from the current player's pool, inserts exactly one correct name, then shuffles all five. Exclude any player with an identical ordered club-name signature from the distractor pool so the visible career cannot have two valid choices.
- Difficulty is Easy/Medium/Hard, default Medium. Rank eligible distractors by `12 × shared unique clubs + 5 × same country + 4 × overlapping broad role + 3 × career-year intersection/union + 2/(1 + unique-club-count difference)`. Reserve B/C sides share their parent only for similarity scoring, not chronology or ambiguity exclusions. Active `present` endpoints use the research snapshot year.
- Easy samples the full eligible pool; Medium samples its top twelve; Hard uses its top four. Shuffle candidates before ranking to randomize ties, then shuffle final answer positions. These are roster-relative difficulty heuristics, not a guarantee that every round is equally hard.
- Save the selected difficulty and each new round’s actual difficulty. Apply changes immediately only before guesses/hints; otherwise defer until the next player. Never reset score, guesses, hints or deck on a settings change. Legacy saves retain exact current options, default their existing rounds to Easy for display, and use Medium for future rounds. Replay preserves the preference.
- Three attempts per round. A wrong answer turns red, disables itself, and consumes one attempt only. A correct answer turns green, animates, awards 100 points and increments consecutive wins. A loss reveals the correct answer and resets the streak. No deductions for hints; scoring is clearly explained.
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
1. Data: exactly 50 unique player IDs/names; continent count 25/25; sources for every entry; all ordered club names mapped to valid crest bytes; no national-team nodes; every pool has four or more distinct incorrect names excluding the answer.
2. Options: exactly five unique buttons with one correct answer across every player and many shuffles.
3. Correct first/second/third try: score increments once, streak increments once, next appears, controls lock.
4. Wrong choices: disable/red/attempt decrements, repeated selection no-op, third error ends round, correct answer revealed, streak resets.
5. Hint order and boundary: country → position → displayed-name initials; no fourth hint; no attempt or score deduction.
6. Deck: all fifty distinct rounds before recap; replay resets session stats; rapid clicks do not skip rounds.
7. Persistence: reload recovers attempts, hints, choices, score and deck; published 30/40-player saves finish their original decks; malformed storage falls back safely; denied storage works.
8. Browser: no console errors; all images decode; local file opening and HTTP both work; no runtime external requests; offline gameplay remains functional.
9. Responsive/accessibility: every player in both languages at 320, 375, 430, 580 and 768px; every club visible in the numbered grid without horizontal overflow. Desktop 1440px keeps horizontal navigation. Thumb-sized answers, keyboard focus, translated live feedback, reduced motion, language persistence, and a complete Spanish playthrough are required.
10. GitHub: inspect commit content for secrets/generated clutter and verify remote SHA/visibility. The owner requested a public repo for GitHub Pages hosting; deploy only the game artifact, require model/data checks first, and verify the public HTTPS response and gameplay before claiming publication.
