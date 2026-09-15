# 15. Patch answer options and the ranked "new career" flag instead of rebuilding on every interaction

Status: Accepted — implemented 2026-09-15.

## Context

The owner reported that "Pedir pista"/Get Hint, and even clicking an answer option, always produced a visible flash - not a network-latency symptom (already addressed for ranked in ADR 0013), but present in guest/practice too, which is 100% client-side and instant. They suspected supposedly-isolated UI components were too tightly coupled.

They were right, on two counts:

1. **Guest `render()` and ranked `renderRanked()` both unconditionally did `$('options').replaceChildren()` followed by rebuilding all ten option buttons from scratch, on every single call** - including a hint click, which never changes `r.options` or `r.guesses` at all. Ten DOM nodes were destroyed and recreated for an interaction that touches none of their state.
2. **A genuine, pre-existing bug in `sendPending()`'s `finally` block** (present before this session's own ADR 0013 work - confirmed by diffing that commit, which left this specific line untouched): `render(false,true)` was called unconditionally for every ranked action (hint, answer, start, enroll alike), always passing `newCareer=true`. `renderRanked()`'s own guard against unnecessary rebuilds - `if(newCareer||$('timeline').dataset.rankedPlayer!==p.id)` - was therefore always taking the `true` branch regardless of the second, more precise condition, rebuilding the entire crest timeline on every hint and every answer in ranked mode, not just when a round actually starts.

## Decision

- `sendPending()`'s finally block now passes `render(false,payload.action==='start')` - `newCareer` is `true` only for an actual `'start'` response, `false` for hint/answer/enroll. `renderRanked()`'s existing `dataset.rankedPlayer` check now does the job it was already written to do.
- Both `render()`'s and `renderRanked()`'s option-rendering split into two phases: a **build** phase that only runs when the round's own option set actually changed (different count, or any option's identity - `dataset.name` for guest, `dataset.optionId` for ranked - not matching the current `r.options` in order), and a **patch** phase that always runs, updating each existing button's `disabled`/class list/`aria-label`/state-icon text in place. Click handlers are attached once, at build time, and read fresh state (`CareerGame.outcome(state)`, `CareerGame.playerAt(state)`) at click time rather than closing over render-time locals that would otherwise go stale now that the closure isn't recreated every render.

## Consequences

- Hint clicks and non-resolving wrong guesses no longer touch the DOM nodes of any option button at all except the one or two whose state actually changed; a genuinely new round (competition switch, Next Player, Replay, Reset) still fully rebuilds, exactly as before.
- Verified directly, not assumed: real-Chrome checks (guest and a mocked ranked session) tagged every option/timeline-card DOM node with a marker before interacting, then confirmed the markers survive hint clicks and non-winning answers unchanged (same node reused, not recreated), while a winning answer still applies `correct`/`goal`/`muted` classes exactly as before and "Next Player" still produces entirely fresh nodes (new round, expected rebuild).
- No behavior change to scoring, hints, guesses or any model-level contract - `tests/model.test.mjs`'s exhaustive option-sampling and full-roster round tests (which exercise `CareerGame` directly, unaffected by this DOM-layer change) still pass unmodified, as does the rest of the suite.
- The ranked `newCareer` bug being present since before ADR 0013 means every ranked interaction has been needlessly rebuilding the crest timeline for as long as `sendPending()`'s current shape has existed - worth noting since it means the "coupling" the owner suspected was real and had been there a while, not something introduced recently.
