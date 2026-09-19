import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];
const dailyUI=block('daily-ui');
const gameUI=block('game-ui');

test('a daily-summary panel exists as markup, hidden by default, distinct from the whole-deck summary-panel',()=>{
  assert.match(html,/id="daily-summary"[^>]*hidden/,'the panel starts hidden, same convention as #summary-panel');
  assert.match(html,/id="daily-summary-grid"/,'a Wordle-style emoji grid element exists');
  assert.match(html,/id="daily-summary-line"/,'a one-line result summary element exists');
  assert.match(html,/id="daily-summary-streak"/,'current/best streak is shown');
  assert.match(html,/id="daily-summary-countdown"/,'a countdown to the next daily is shown');
  assert.match(html,/id="daily-summary-share"/,'a summary-scoped share action exists, distinct from #daily-share');
  assert.match(html,/id="daily-summary-share-preview"/,'the share text is previewed on screen, not only copied blind');
  assert.match(html,/id="daily-summary-keep-playing"/);
  assert.match(html,/id="daily-summary-review"/,'a per-player reveal (name, career, points) exists');
});

test('the daily summary is a fully separate section from the whole-deck summary panel',()=>{
  assert.notEqual(html.match(/id="daily-summary"/)?.index,html.match(/id="summary-panel"/)?.index);
  assert.doesNotMatch(html,/id="daily-summary"[^>]*class="summary-panel"/,'does not silently reuse the deck-summary class in a way that would leak its deck-only copy');
});

test('the daily countdown targets the next UTC midnight, not a fixed duration timer',()=>{
  // A hard-coded duration would drift every time the panel re-renders; the
  // countdown must always be computed against a fixed target instant.
  const source=dailyUI;
  assert.match(source,/nextRolloverAt|nextMidnightUTC|rolloverTarget/,'a function computing the next UTC-midnight instant exists');
  assert.doesNotMatch(source,/setInterval\([^,]*,\s*1000\)/,'no dedicated 1-second timer is added; reuse existing render cadence');
});

test('the countdown is a static, neutral count-DOWN to a fixed future instant, not a draining/pressure visual',()=>{
  // Distinguish from the anti-pattern the app already avoids for #elapsed-time:
  // no progress bar, no red/urgency color class, no depleting width or ring.
  assert.doesNotMatch(html,/daily-summary-countdown[^>]*class="[^"]*(bar|ring|fill|urgent|danger)/i);
  assert.doesNotMatch(html,/\.daily-summary-countdown\{[^}]*background:var\(--red\)/);
});

test('the summary reuses the existing Wordle-style shareText and totals, not a new format',()=>{
  assert.match(dailyUI,/shareText\(\{language[^}]*correctCount[^}]*totalGuesses[^}]*totalHints[^}]*totalPoints[^}]*currentStreak/s);
});

test('guest daily summary renders after the third round resolves and hides the dead round UI',()=>{
  const source=dailyUI;
  assert.match(source,/renderDailySummary|showDailySummary/,'a dedicated summary-render function exists in the guest path');
  // Must hide the same dead-board elements the bug report called out.
  assert.match(source,/getElementById\('round-panel'\)\.hidden=true/,'the finished round board is hidden, not left on screen with its 10 options');
  assert.match(source,/getElementById\('daily-summary'\)\.hidden=false/);
});

test('signed-in DailyRankedUI reaches summary parity with the guest DailyUI path',()=>{
  const source=gameUI;
  assert.match(source,/DailyRankedUI[\s\S]*renderDailySummary|renderDailySummary[\s\S]*DailyRankedUI/,'DailyRankedUI also drives the shared summary renderer, not a second bespoke one');
  assert.match(source,/daily\.streak\.current/,'signed-in summary uses the server-authoritative streak, not local history');
  assert.match(source,/daily\.streak\.best/);
});

test('bilingual copy exists for every new summary string',()=>{
  for(const key of ['summaryEyebrow','summaryCountdownLabel']){
    const enMatch=dailyUI.match(new RegExp(`en:\\{[\\s\\S]*?${key}:'([^']+)'`));
    const esMatch=dailyUI.match(new RegExp(`es:\\{[\\s\\S]*?${key}:'([^']+)'`));
    assert.ok(enMatch,`English ${key} exists`);
    assert.ok(esMatch,`Spanish ${key} exists`);
    assert.notEqual(enMatch[1],esMatch[1],`${key} is actually translated, not copy-pasted`);
  }
  // These are functions (they interpolate a count), so match the function
  // bodies rather than a bare string literal.
  for(const key of ['summaryStreakBest','summaryReviewTitle']){
    const enMatch=dailyUI.match(new RegExp(`en:\\{[\\s\\S]*?${key}:[^,]+`));
    const esMatch=dailyUI.match(new RegExp(`es:\\{[\\s\\S]*?${key}:[^,]+`));
    assert.ok(enMatch,`English ${key} exists`);
    assert.ok(esMatch,`Spanish ${key} exists`);
    assert.notEqual(enMatch[0],esMatch[0],`${key} is actually translated, not copy-pasted`);
  }
});

test('the summary panel keeps a live region for the share preview/status, same accessibility pattern as the existing share button',()=>{
  assert.match(html,/id="daily-summary-share-status"[^>]+aria-live="polite"/);
});

test('the countdown ticks via a lightweight second-interval, not by rerunning the whole summary render',()=>{
  assert.match(gameUI,/countdown\.dataset\.targetMs/,'the tick reads a stored target instant rather than recomputing it');
  assert.match(gameUI,/setInterval\(\(\)=>\{[\s\S]{0,600}\},1000\)/,'a dedicated 1s interval exists');
  const intervalMatch=gameUI.match(/setInterval\(\(\)=>\{[\s\S]{0,600}\},1000\)/);
  assert.match(intervalMatch[0],/daily-summary-countdown/,'the 1s interval is the one driving the countdown text');
});

test('the review list names the players, mirrors reviewWon/reviewLost, and does not duplicate the deck summary review list id',()=>{
  assert.match(html,/id="daily-summary-review"/);
  assert.doesNotMatch(html,/id="review"[^>]*id="daily-summary-review"/);
  const idOccurrences=(html.match(/id="review"/g)||[]).length;
  assert.equal(idOccurrences,1,'the existing #review id for the deck summary stays unique, unshared with the daily summary');
});
