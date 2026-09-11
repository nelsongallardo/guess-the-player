# Verification report

Executed on **11 September 2026** using real Node and Chromium/Playwright runs. The final browser report began at `2026-09-11T09:38:08.708971+00:00`. Local environment: Node `v22.22.1`, Python `3.9.6`, Playwright CLI `0.1.13`.

## Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py
```

## Results

- **Model/data/localization tests: 10 passed, 0 failed.** Exactly 30 unique player records, 15 Europe / 15 South America; original career fields still match the frozen research snapshot. All Spanish country/position mappings and career-note translations are present.
- **30,000 randomized option samples:** every sample had five distinct names, exactly one correct answer and four valid distractors. Exact duplicate career signatures are excluded from distractor pools.
- **HTTP browser playthrough:** all 30 players appeared once. The mixed first-/second-/third-attempt-win and loss scenario finished with 23 wins, 2,300 points and a best streak of 3, as expected.
- **Offline local-file playthrough:** all 30 rounds completed with the browser context explicitly offline, reaching 3,000 points and a streak of 30. All 68 used public crest-source assets decoded without network access.
- **Network/errors:** zero external requests during normal gameplay; zero HTTP(S) requests during offline gameplay; zero browser errors in both runs.
- **Round behavior:** wrong answers turn red and disable; repeated guesses do not spend extra attempts; third misses end the round; third-attempt correct answers still win; completed rounds lock; rapid repeated Next clicks do not skip live rounds.
- **Hints:** country, position, displayed-name initials; exactly three reveals; no score or attempt cost.
- **Persistence:** exact choices, attempts, hints and progress survive reload; final recap survives reload; replay resets the deck and score; malformed JSON resets safely; deliberately denied localStorage does not stop gameplay.
- **Responsive:** 300 player/language/viewport combinations passed: all 30 players, English and Spanish, at 320, 375, 430, 580 and 768px. Every club is contained in the numbered grid; all crests fit the viewport after the career panel is brought into view. There is no horizontal scrolling on mobile. The longest 11-spell career also fits the initial 375×667 Spanish screen. Desktop at 1440px retains horizontal timeline navigation. Answer buttons remain at least 58px/65px high.
- **Spanish playthrough:** all 30 rounds completed with alternating wins/losses, yielding 15 wins. Spanish hints, feedback, rules, next/result buttons, recap and replay passed. Switching languages preserves exact game state, including guesses, hints and finished recaps. Explicit URL, saved preference and `es-AR` browser detection were exercised.
- **Regression tests (RED → GREEN):** the new no-horizontal-scroll check failed against the old mobile timeline, then passed against the grid. A visual review also caught an existing badge-label bug: incidental/negated mentions of loans incorrectly marked permanent spells as loans. The new test failed for Verón/Chelsea before the tag matcher was corrected, then passed; the underlying career data was unchanged.
- **Keyboard/motion:** help opens with Enter and closes with Escape; focus advances after guesses; timeline arrows and keyboard scrolling work; reduced-motion preference suppresses the success animation.
- **Mobile scroll regression (RED → GREEN):** reproduced the next career completely offscreen at 375×667 (`top: -380.625`, `bottom: -177.625`). The new regression failed against the old artifact. Next/replay now explicitly reveal the career panel; the regression and both complete playthroughs pass against the fixed artifact.
- **Visual inspection:** the final Spanish mobile screenshot passed with all 11 clubs visible, no clipped clubs, no overlapping controls and fully legible answer options. Secondary grid text was enlarged after the first pass. Desktop retains the previously verified design and explicit timeline arrows.
- **Citation plumbing:** all 30 player sections and 66 cited literal URLs match the 104-entry retrieved URL ledger.

Raw browser JSON and screenshots are generated locally in ignored `test-results/`, not committed as fabricated fixtures.

## Limits and known tooling issue

These are Chromium tests with desktop viewport emulation, not a physical-device Safari/Firefox certification or a formal WCAG audit. Local-file persistence varies across browsers, but denied storage is handled without preventing play.

The general-purpose citation verifier reports two false URL mismatches because it truncates literal closing parentheses in the Xavi and Ronaldo Wikipedia URLs, even in its own plain renderer output. The original URLs were preserved. `tests/source-check.py` independently verifies **exact full URL equality**, citation membership and all player sections; it passes. It validates citation plumbing, not the historical truth of a claim.

Career records are a manually cross-checked dated snapshot. The source document and [data policy](research/data-policy.md) disclose reserve overlap, actual playing returns, exceptional registrations and source disagreements. Automated tests cannot establish historical truth or guarantee future data currency.
