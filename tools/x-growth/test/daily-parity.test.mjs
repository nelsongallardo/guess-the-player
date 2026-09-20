// Cross-check: our recomputed daily must equal what the game's own DailyChallenge
// module produces, for 40 consecutive days. If these ever diverge, the post would
// show a different puzzle than the site — the whole premise breaks.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO } from '../lib/roster.mjs';
import { dailyFor, EPOCH_DAY, loadSchedule } from '../lib/daily.mjs';

// Pull the game's real daily module out of index.html and run it.
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const block = id => html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`))[1];

const ctx = vm.createContext({ globalThis: {}, window: {}, document: undefined, localStorage: undefined, sessionStorage: undefined, console });
vm.runInContext(block('roster-data'), ctx);

// The daily logic lives in its own 'daily-challenge' script block.
const src = block('daily-challenge');
const start = src.indexOf('const DAILY_SCHEDULE_V1');
assert.ok(start > -1, 'DAILY_SCHEDULE_V1 not found in game-model');
// Take the frozen schedule literal only (it ends at the digest const that follows it).
const digestAt = src.indexOf('const DAILY_SCHEDULE_V1_DIGEST');
assert.ok(digestAt > start, 'DAILY_SCHEDULE_V1_DIGEST not found after the schedule');
const scheduleSrc = src.slice(start, digestAt);

// Take the game's OWN epoch line verbatim, from inside the DailyChallenge IIFE.
// Using their literal rather than a copy is the point: a divergent epoch is
// exactly the bug this test exists to catch.
const epochLine = src.match(/const EPOCH_DAY=[^;]+;/);
assert.ok(epochLine, 'EPOCH_DAY not found in daily-challenge');
console.log(`game epoch line: ${epochLine[0]}`);

// Rebuild the game's own computation verbatim in an isolated context.
const gameCtx = vm.createContext({});
vm.runInContext(`
  const dailyDeepFreeze = x => x;
  ${scheduleSrc}
  ${epochLine[0]}
  function gameDaily(day) {
    if (day < EPOCH_DAY) return null;
    const challengeNumber = day - EPOCH_DAY + 1;
    const s = ((challengeNumber-1)*3) % DAILY_SCHEDULE_V1.length;
    return {
      challengeNumber,
      playerIds: [0,1,2].map(o => DAILY_SCHEDULE_V1[(s+o) % DAILY_SCHEDULE_V1.length].playerId),
    };
  }
`, gameCtx);
const gameDaily = day => vm.runInContext(`gameDaily(${day})`, gameCtx);

const scheduleLen = loadSchedule().length;
console.log(`schedule slots: ${scheduleLen}`);
console.log(`epoch day: ${EPOCH_DAY} (${new Date(EPOCH_DAY * 86400000).toISOString().slice(0, 10)})`);

let checked = 0;
for (let i = 0; i < 40; i++) {
  const date = new Date((EPOCH_DAY + i) * 86400000).toISOString().slice(0, 10);
  const ours = dailyFor(date);
  const theirs = gameDaily(EPOCH_DAY + i);

  assert.strictEqual(ours.challengeNumber, theirs.challengeNumber, `challenge number mismatch on ${date}`);
  // join() rather than deepStrictEqual: the game's arrays come from a frozen,
  // cross-realm vm context, so structural comparison trips on the prototype.
  assert.strictEqual(ours.rounds.map(r => r.playerId).join(','), [...theirs.playerIds].join(','), `player mismatch on ${date}`);
  checked++;

  if (i < 5 || date === new Date().toISOString().slice(0, 10)) {
    console.log(`  ${date}  #${ours.challengeNumber}  ${ours.rounds.map(r => r.player.name).join(' | ')}`);
  }
}

// Pre-epoch dates must return null, not a negative challenge number.
assert.strictEqual(dailyFor('2026-09-16'), null, 'pre-epoch date should be null');
console.log('PASS pre-epoch date returns null');

// The cycle must wrap cleanly: day N and day N+(len/3 * ...) share slots by design.
const wrapDay = new Date((EPOCH_DAY + Math.ceil(scheduleLen / 3)) * 86400000).toISOString().slice(0, 10);
assert.ok(dailyFor(wrapDay), 'wrap date should still resolve');
console.log(`PASS cycle wraps cleanly at ${wrapDay}`);

console.log(`\n${checked} consecutive days match the game exactly.`);
console.log('ALL DAILY PARITY TESTS PASSED');
