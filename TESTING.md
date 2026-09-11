# Verification report

Executed on **11 September 2026** using real Node and Chromium/Playwright runs. The final browser report began at `2026-09-11T09:12:22.989460+00:00`. Local environment: Node `v22.22.1`, Python `3.9.6`, Playwright CLI `0.1.13`.

## Commands actually run

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py
```

## Results

- **Model/data tests: 8 passed, 0 failed.** Exactly 30 unique player records, 15 Europe / 15 South America; complete final HTML data matches the frozen research snapshot.
- **30,000 randomized option samples:** every sample had five distinct names, exactly one correct answer and four valid distractors. Exact duplicate career signatures are excluded from distractor pools.
- **HTTP browser playthrough:** all 30 players appeared once. The mixed first-/second-/third-attempt-win and loss scenario finished with 23 wins, 2,300 points and a best streak of 3, as expected.
- **Offline local-file playthrough:** all 30 rounds completed with the browser context explicitly offline, reaching 3,000 points and a streak of 30. All 68 used public crest-source assets decoded without network access.
- **Network/errors:** zero external requests during normal gameplay; zero HTTP(S) requests during offline gameplay; zero browser errors in both runs.
- **Round behavior:** wrong answers turn red and disable; repeated guesses do not spend extra attempts; third misses end the round; third-attempt correct answers still win; completed rounds lock; rapid repeated Next clicks do not skip live rounds.
- **Hints:** country, position, displayed-name initials; exactly three reveals; no score or attempt cost.
- **Persistence:** exact choices, attempts, hints and progress survive reload; final recap survives reload; replay resets the deck and score; malformed JSON resets safely; deliberately denied localStorage does not stop gameplay.
- **Responsive:** 320px, 375px, 768px and 1440px widths all had zero whole-page horizontal overflow. Answer buttons measured at least 58px high on narrow screens and 65px otherwise. The long timeline alone scrolls horizontally.
- **Keyboard/motion:** help opens with Enter and closes with Escape; focus advances after guesses; timeline arrows and keyboard scrolling work; reduced-motion preference suppresses the success animation.
- **Mobile scroll regression (RED → GREEN):** reproduced the next career completely offscreen at 375×667 (`top: -380.625`, `bottom: -177.625`). The new regression failed against the old artifact. Next/replay now explicitly reveal the career panel; the regression and both complete playthroughs pass against the fixed artifact.
- **Visual inspection:** actual final 375px mobile and 1440px desktop screenshots reviewed; no missing visible crests, unintended overlap or clipping outside the intentional timeline scroller. Small informational text was enlarged and explicit timeline navigation added after the first visual pass.
- **Citation plumbing:** all 30 player sections and 66 cited literal URLs match the 104-entry retrieved URL ledger.

Raw browser JSON and screenshots are generated locally in ignored `test-results/`, not committed as fabricated fixtures.

## Limits and known tooling issue

These are Chromium tests with desktop viewport emulation, not a physical-device Safari/Firefox certification or a formal WCAG audit. Local-file persistence varies across browsers, but denied storage is handled without preventing play.

The general-purpose citation verifier reports two false URL mismatches because it truncates literal closing parentheses in the Xavi and Ronaldo Wikipedia URLs, even in its own plain renderer output. The original URLs were preserved. `tests/source-check.py` independently verifies **exact full URL equality**, citation membership and all player sections; it passes. It validates citation plumbing, not the historical truth of a claim.

Career records are a manually cross-checked dated snapshot. The source document and [data policy](research/data-policy.md) disclose reserve overlap, actual playing returns, exceptional registrations and source disagreements. Automated tests cannot establish historical truth or guarantee future data currency.
