# Verification report

## Origin-first rivals — 12 September 2026

Reproduced the user's Maradona/La Liga scenario with a failing seeded regression: the old matcher admitted a Spain-start rival into an Argentina-start career. The new matcher uses strict starting-football-system tiers before era/career ranking; selected competition is a small preference, not a hard wrong-answer filter. No roster, crest, score, deck-selection or saved-round migration changes were made. See [ADR 0002](docs/adr/0002-origin-first-distractors.md).

Actual final commands:

- `node --test tests/model.test.mjs`: **26 passed, 0 failed**, including the imported origin regression suite.
- `python3 tests/source-check.py`: **60 player sections / 198 literal source URLs; passed**.
- `python3 tests/run-browser.py`: **all seven suites passed**, no exclusions; run started at `2026-09-12T22:15:40.115886+00:00`.

The Maradona/La Liga model regression generates 500 seeded rounds; every rival starts in the Argentine senior system. The browser regression generates another 100, retains the 37-player La Liga deck, reloads exact choices, and completes hint/answer/Next with unchanged scoring. The rendered example offered Saviola, Crespo, Batistuta and Riquelme beside Maradona—not Henry or Mendieta. All-player/all-competition model checks cover origin-tier boundaries and mandatory retention of closer matches in thin pools. Messi, Cambiasso, Keane, Giggs, Swansea and Monaco classification exceptions are explicit tests.

Existing 60,000 randomized option samples, offline/localStorage-denied play, bilingual playthroughs, 600 responsive cases, brand checks and 30/40/50-player save fixtures remain green. Current saved rounds are deliberately not rerolled; the fix takes effect on newly generated rounds. Sparse origin groups and older eras still need more researched peers; the matcher does not guarantee equal difficulty for every legend.

## derabona rebrand — 12 September 2026

Rebranded the site with an original rabona-player SVG mark, an embedded favicon, a lowercase wordmark, editable SVG/PNG logo exports and a paper/ink/celeste UI. English and Spanish titles/copy are updated; Spanish brand copy uses Argentinian voseo. Repository URL and legacy storage keys are unchanged.

Actual verification:

- `node --test tests/model.test.mjs`: **21 passed, 0 failed**.
- `python3 tests/source-check.py`: **60 player sections; 198 literal source URLs; passed**.
- `python3 tests/run-browser.py`: **all six browser suites passed**, with no diagnostic exclusions. Run started at `2026-09-12T21:47:30.800098+00:00`; detailed output is in ignored `test-results/browser-results.json`.
- HTTP and offline local-file 60-round journeys, denied localStorage, English/Spanish play, Hard selection, competition/reset/history flows and published 30/40/50-player save compatibility passed.
- **600** player/language/viewport cases plus **14** header/branding cases passed. The previously failing longest-career initial 375×667 screen assertion now passes unchanged after mobile branding/layout adjustments.
- Desktop/mobile and exported-logo screenshots were visually reviewed. No blocking overlap, clipping or logo defects remained; the mobile “¿Quién es?” stays together. PNG export is 1280 × 320.
- Primary text/background contrast pairs were calculated: ink/paper 13.50:1, muted/paper 5.70:1, deep-blue/paper 6.24:1, light labels/ink 9.60:1 and celeste/ink 8.66:1. These are selected text pairs, not a claim of a complete accessibility audit.
- Direct source comparison verified the roster, crest data, model, career translations and UI behaviour after the copy block are unchanged from the pre-rebrand commit. SVG XML and local documentation links were validated.

During the tight responsive roster loop, Chromium rejected `decode()` on an already-loaded PNG. Yielding one animation frame after rendering each career resolved it; every image decode and every visibility assertion remains enforced. No tests were removed or weakened. Native Safari/Firefox remain outside the tested browser matrix.

The sections below are historical verification records, not outstanding failures in this rebrand run.

## Selector removal — 12 September 2026

Removed the difficulty control, explanatory status text and English/Spanish help instructions. All fresh games, future rounds, competition changes, reset and replay use the **already-published Hard behaviour: four rivals sampled from the closest eight**. Existing rounds are preserved exactly; saved Easy/Medium preferences no longer act as invisible settings. The published 60-player roster, competition controls, speed/hint scoring, results history and reset behaviour are retained.

Executed `node --test tests/model.test.mjs`, `python3 tests/source-check.py` and `python3 tests/run-browser.py` after integrating published commit `2b9457f`. All **21 model tests** and source checks passed. The full browser runner is **not entirely green**: its initial-screen longest-career assertion fails at 375×667. Running that same test against an unchanged HTML artifact from `origin/main` reproduced the identical failure. The layout and failing assertion are deliberately left unchanged.

The five browser scripts were then run individually through the same Playwright CLI session. HTTP, offline, selector and legacy-expansion suites passed unchanged. For the mobile/language diagnostic run only, the independently reproduced initial-screen assertion was omitted **in memory**, not from the checked-in test; all remaining checks passed. Results are saved locally in `test-results/selector-final-results.json`.

- Selector absence and updated help verified in both languages; 60-round Hard playthrough in each language.
- Easy, Medium, Hard and pre-difficulty saves retain exact existing rounds, guesses, hints and score; subsequent rounds use Hard.
- All competition choices and reload preserve Hard; changing competitions preserves results history; reset clears results and starts Hard. Reset confirmation is captured in-page for this handler test because the CLI owns native dialogs.
- HTTP, offline local-file play, denied localStorage, 600 responsive player/language/width cases and published 30/40/50-player save compatibility passed, subject to the separately documented initial-screen limitation.
- Updated legacy browser assertions to account for the published competition migration and hint-adjusted scoring, without changing either production behaviour.

## Prior roster-expansion verification (historical)

Executed on **11 September 2026** using Node and real Chromium/Playwright. The final second-expansion browser run began at `2026-09-11T17:32:15.009118+00:00`.

## Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py
uv run --with pillow python research/verify_expansion2_crests.py
```

Environment: Node v22.22.1; Python 3.9.6; playwright-cli 0.1.13. Pillow verification runs through uv.

## Passed

- **Model/data/localization: 15 tests, 0 failures.** Exactly 50 unique players, 25 Europe / 25 South America. All 50 Spanish note sets and every national-team/position hint have translations. UI footer/help counts are asserted in both languages.
- **50,000 randomized option samples** check five distinct choices, one correct answer and no identical-career distractors. Another **15,000 seeded samples** verify difficulty ranking and shuffling.
- **HTTP:** 50 rounds, 140 embedded crest-source assets, 38 wins, 3,800 points and best streak 3. Attempts, all hints, wrong-answer lockout, Next, recap, reload and replay passed.
- **Offline file:** 50 rounds and 5,000 points with network disabled. All crest assets decoded. File save/reload and deliberately denied localStorage passed. No network requests or browser errors.
- **Spanish:** 50 rounds, alternating wins/losses, 25 wins. Language switching preserves progress; URL preference, saved preference and Spanish browser detection passed.
- **Every difficulty/language combination:** 300 completed rounds across Easy/Medium/Hard in English/Spanish. Pending changes after hints, reload, replay and offline operation without storage passed.
- **Real published-save compatibility:** both `tests/legacy-save.json` (30 players) and `tests/legacy-save-40.json` (40 players) reload byte-for-byte, finish their original decks and replay into 50 while preserving Hard. The 40-player fixture was generated by executing published model `cbec929e40305535dc0d83dbbd4848defbb691e7`: round six, 500 points, one hint and one incorrect guess. No fixture was invented as plausible output.
- **Responsive:** 500 player/language/viewport cases across 320, 375, 430, 580 and 768px. No horizontal overflow; every club crest visible in the grid. The longest careers have 16 spells; the initial 375×667 Spanish screen also passed. Desktop 1440px retains independent horizontal timeline navigation; answer targets remain at least 58px/65px high.
- **Crests:** Pillow decoded all second-expansion artwork. A contact-sheet review found no identity issue. A small-screenshot Panathinaikos concern was rejected after the full-resolution crest clearly showed ΠΑΝΑΘΗΝΑΪΚΟΣ and a trefoil. Toledo was retrieved from its actual club-page infobox because ESPN has no logo for that team.
- **Citation plumbing:** 50 source sections / 178 literal source URLs and 50 audit sections / 174 cited URLs, matched to their ledgers. Ten new audit records each contain evidence from at least two independent domains. Previous forty curated player records are unchanged.

## Findings fixed during this run

- Extended saved-deck validation to retain both published 30- and 40-player games.
- Updated stale footer/help totals and added regression assertions.
- The desktop back-scroll test encountered a 1px rounding remainder after a fractional-width scroll step. Its assertion now matches the existing UI’s 1px boundary tolerance; no production navigation behavior was weakened.
- Giuly’s unresolved Lyon B record was not imported; independently researched Joe Cole replaced him.

## Limits

Software/source consistency tests do **not** establish historical truth. Career evidence and remaining date/scope qualifications are in [DATA_AUDIT.md](DATA_AUDIT.md), including Riise’s overlapping Monaco reserve/first-team order and earlier roster qualifications. Professional playing spells exclude youth, coaching, unused registrations and post-retirement amateur football.

Browser testing covers Chromium, not native iOS Safari or Firefox. Current/source-era club marks are not historical season-specific artwork. Raw articles, screenshots and execution JSON remain local under ignored research/test-result paths; only the standalone HTML is deployed.

## Update — 12 September 2026: competitions and third player batch

Added a competition-organization layer (Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão, plus All Players) and a third ten-player batch (Fernando Torres, Xabi Alonso, Thierry Henry, Iker Casillas, Andrea Pirlo, Diego Maradona, Javier Mascherano, Cafu, Marcelo Salas, Rivaldo), bringing the roster to 60 (30 Europe / 30 South America).

### Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
```

Environment: Node v24.18.0, Python 3.11.4. Neither `playwright-cli` nor a Python `playwright` install was available in this environment, so `tests/run-browser.py` (and the browser-driven `difficulty-checks.js`/`expansion-checks.js`/`mobile-language-checks.js` it runs) could **not** be executed here. Those three files were still updated for the new 60-player/30-30 counts and a fourth legacy-save fixture, but their assertions are unverified until someone runs the suite with a real browser.

### Passed

- **Model/data/localization: 20 tests, 0 failures.** Exactly 60 unique players, 30 Europe / 30 South America. Every player carries a recognized competition tag. All 60 Spanish note sets and every country/position (including the new Chile and Midfielder/Defender combination) have translations, and all five competition labels are present in both languages.
- **60,000 randomized option samples** (unscoped) plus a targeted competition-scoped sample check five distinct choices, one correct answer, no identical-career distractors, and — when a competition is active — distractors drawn from that competition first, with a verified fallback to the full pool when a synthetic scoped pool has fewer than four candidates.
- **`create(difficulty, competitionId)`** produces a deck matching each competition's current pool size (Champions League 59, Premier League 30, La Liga 37, Argentine Primera División 19, Brasileirão 13, All Players 60) and falls back to All Players for an unrecognized id instead of erroring.
- **`validate()`** accepts a legacy save with no `competition` field (treated as All Players), and rejects a deck whose length or membership no longer matches its stated competition.
- **Real published-save compatibility:** `tests/legacy-save.json` (30 players), `tests/legacy-save-40.json` (40 players) and the new `tests/legacy-save-50.json` (50 players, generated directly against the pre-expansion 50-player roster with the same first-five-wins-then-one-in-progress-round shape as the existing 40-player fixture) all reload, finish their original decks, and replay into the current 60-player All Players deck while preserving Hard difficulty.
- **Citation plumbing:** 60 source sections / 198 literal source URLs and 60 audit sections / 194 cited URLs, matched to their respective ledgers. The ten new records each cite at least two independent domains (Wikipedia plus National Football Teams).
- **Crest assets:** all 16 newly embedded crests (Sagan Tosu, Real Sociedad, SD Eibar, New York Red Bulls, Porto, Brescia, Reggina, Napoli, Hebei China Fortune, Juventude, Universidad de Chile, Santa Cruz, Mogi Mirim, Bunyodkor, São Caetano, Kabuscorp) were fetched from their Wikipedia infobox crest files, checked for real PNG magic bytes and non-zero dimensions (the same check `model.test.mjs` runs on every embedded asset), and confirmed to be the only unused-vs-used assets in `CREST_ASSETS` (156 total, all referenced). No pixel-level visual review of the new crests was performed — that step used Pillow contact sheets in the prior expansion and could not be repeated without it here.

### Not verified in this environment

- No real-browser playthrough of the competition picker, the "change competition" flow, or the summary-panel button — the UI wiring was reviewed by reading the generated script and syntax-checking every `<script>` block with Node's `vm.Script`, not by clicking through it.
- No responsive/accessibility pass at the five mobile widths for the new picker dialog or the ten new players' career timelines.
- No visual crest review for the 16 new assets.
