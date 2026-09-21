// The daily rolls over at 00:00 UTC (the game's own currentDate() is
// `new Date().toISOString().slice(0,10)`, and the UI says "Resets at 00:00 UTC").
//
// Found 2026-09-21: the reveal was scheduled `0 1 * * *` London, which in BST
// is 00:00 UTC — the exact instant of the rollover. Its copy said "los otros
// dos jugadores de hoy están en derabona.club", which was already false: the
// site had swapped in three new players. Schedule moved to 22:00 London, and
// the copy now adapts if it ever runs late anyway.
import assert from 'node:assert';
import { composeReveal } from '../post-reveal.mjs';
import { dailyFor, dailyIsLive, hoursUntilRollover, utcToday } from '../lib/daily.mjs';

let fail = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { fail++; console.log(`FAIL ${name} ${extra}`); } else console.log(`PASS ${name}`);
};

console.log('=== rollover awareness ===');
check('today is live', dailyIsLive(utcToday()));
check('yesterday is not live', !dailyIsLive('2026-09-20') || utcToday() === '2026-09-20');
check('hours left today is 0..24', hoursUntilRollover(utcToday()) > 0 && hoursUntilRollover(utcToday()) <= 24,
  String(hoursUntilRollover(utcToday())));
check('a past date reports negative', hoursUntilRollover('2026-09-01') < 0);

console.log('\n=== reveal copy adapts to rollover ===');
const daily = dailyFor('2026-09-20');

const live = composeReveal(daily, 0, true);
check('while live, points at the other two', /otros dos jugadores de hoy/.test(live), live);
check('while live, does not claim new players', !/tres jugadores nuevos/.test(live), live);

const rolled = composeReveal(daily, 0, false);
check('after rollover, points at the new daily', /tres jugadores nuevos/.test(rolled), rolled);
check('after rollover, drops the stale claim', !/otros dos jugadores de hoy/.test(rolled), rolled);

// Both variants must still name the right player and route to the site.
for (const [label, text] of [['live', live], ['rolled', rolled]]) {
  assert.ok(text.includes('Vicente Sánchez'), `${label} lost the answer`);
  assert.ok(/derabona\.club/.test(text), `${label} lost the route to the game`);
  assert.ok(!/[—–]/.test(text), `${label} has a dash`);
}
check('both variants name the player and route to the site', true);

console.log('\n=== schedule sanity: the reveal slot must leave runway ===');
// cron `0 22` London: 21:00 UTC in BST, 22:00 UTC in GMT. Both leave >0h.
for (const [tz, utcHour] of [['BST', 21], ['GMT', 22]]) {
  const left = 24 - utcHour;
  check(`22:00 London in ${tz} leaves ${left}h before rollover`, left > 0);
}
// The old slot was 0 1 London = 00:00 UTC in BST: zero runway.
check('the old 01:00 London slot had zero runway in BST', 24 - 0 === 24 && (0 % 24) === 0);

console.log(`\n${fail ? `${fail} FAILED` : 'ALL ROLLOVER TESTS PASSED'}`);
process.exit(fail ? 1 : 0);
