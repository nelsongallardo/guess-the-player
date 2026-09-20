// 40-day simulation against the REAL daily schedule: char limits, correct
// cost per link policy, no answer leaks, and a monthly budget that fits the cap.
import assert from 'node:assert';
import { composeText, wantsLink, LINK_DAYS } from '../post-daily.mjs';
import { composeReveal } from '../post-reveal.mjs';
import { dailyFor, EPOCH_DAY } from '../lib/daily.mjs';
import { weightedLength, containsUrl, postCost, POST_LIMIT } from '../lib/x-client.mjs';
import { COST, MONTHLY_CAP } from '../lib/state.mjs';

let worstPuzzle = 0, worstReveal = 0, fallbacks = 0, linkDays = 0, spend = 0;

for (let i = 0; i < 40; i++) {
  const date = new Date((EPOCH_DAY + i) * 86400000).toISOString().slice(0, 10);
  const daily = dailyFor(date);
  const withLink = wantsLink(date);
  const puzzle = composeText(daily, withLink);
  const reveal = composeReveal(daily);

  // Link policy and actual content must agree, or we mis-bill.
  assert.strictEqual(containsUrl(puzzle), withLink, `#${daily.challengeNumber} link policy mismatch`);
  assert.strictEqual(postCost(puzzle), withLink ? COST.postWithUrl : COST.post, `#${daily.challengeNumber} puzzle cost`);

  // The reveal never carries a paid link.
  assert.ok(!containsUrl(reveal), `#${daily.challengeNumber} reveal linkified`);
  assert.strictEqual(postCost(reveal), COST.post, `#${daily.challengeNumber} reveal cost`);

  assert.ok(weightedLength(puzzle) <= POST_LIMIT, `#${daily.challengeNumber} puzzle ${weightedLength(puzzle)} > ${POST_LIMIT}`);
  assert.ok(weightedLength(reveal) <= POST_LIMIT, `#${daily.challengeNumber} reveal ${weightedLength(reveal)} > ${POST_LIMIT}`);

  // No answer leaks from the puzzle; every answer appears in the reveal.
  for (const r of daily.rounds) {
    assert.ok(!puzzle.includes(r.player.name), `#${daily.challengeNumber} leaks ${r.player.name}`);
    assert.ok(reveal.includes(r.player.name), `#${daily.challengeNumber} reveal missing ${r.player.name}`);
  }
  // Every post must route to the game somehow.
  assert.ok(/derabona\.club/.test(puzzle), `#${daily.challengeNumber} has no route to the game`);

  if (withLink) linkDays++;
  if (!puzzle.includes('→')) fallbacks++;
  if (i < 30) spend += postCost(puzzle) + COST.media + postCost(reveal);
  worstPuzzle = Math.max(worstPuzzle, weightedLength(puzzle));
  worstReveal = Math.max(worstReveal, weightedLength(reveal));

  if (i < 2 || (withLink && linkDays === 1)) {
    console.log(`=== ${date} — Rabona Diaria #${daily.challengeNumber} ${withLink ? '[LINK DAY]' : '[bare domain]'} ===`);
    console.log(puzzle);
    console.log(`  ↳ ${reveal.replace(/\n+/g, ' | ')}`);
    console.log(`  [puzzle ${weightedLength(puzzle)}ch $${postCost(puzzle)} · reveal ${weightedLength(reveal)}ch $${postCost(reveal)}]\n`);
  }
}

const replies = 5 * 30 * COST.post;
const reads = 300 * COST.read;
const total = spend + replies + reads;

console.log(`40 days simulated. Link days: ${linkDays}/40 (policy: weekday ${LINK_DAYS.join(',')})`);
console.log(`max weighted length — puzzle ${worstPuzzle}, reveal ${worstReveal} (safe limit ${POST_LIMIT}, X nominal 280)`);
console.log(`long-career fallback used on ${fallbacks}/40 days`);
console.log(`\n30-day budget:`);
console.log(`  posts+media+reveals  $${spend.toFixed(2)}`);
console.log(`  replies (5/day)      $${replies.toFixed(2)}`);
console.log(`  reads (1 scout/day)  $${reads.toFixed(2)}`);
console.log(`  TOTAL                $${total.toFixed(2)}  (cap $${MONTHLY_CAP.toFixed(2)})`);
assert.ok(total <= MONTHLY_CAP, `budget $${total.toFixed(2)} exceeds cap $${MONTHLY_CAP}`);
console.log('\nALL ASSERTIONS PASSED');
