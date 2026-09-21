// 40-day simulation against the REAL daily schedule: char limits, correct
// link policy, no answer leaks, and a recurring worst-case calendar-month
// budget. The approval flow caps replies at five/day, but the $6 plan funds at
// most five approved replies in a 31-day month with five Sundays after accounting
// for each approval's source-post read.
import assert from 'node:assert';
import { composeText, wantsLink, LINK_DAYS } from '../post-daily.mjs';
import { composeReveal } from '../post-reveal.mjs';
import { dailyFor, EPOCH_DAY } from '../lib/daily.mjs';
import { weightedLength, containsUrl, postCost, POST_LIMIT } from '../lib/x-client.mjs';
import { COST, MONTHLY_CAP } from '../lib/state.mjs';

let worstPuzzle = 0, worstReveal = 0, fallbacks = 0, linkDays = 0;

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

  // No answer leaks from the puzzle.
  for (const r of daily.rounds) {
    assert.ok(!puzzle.includes(r.player.name), `#${daily.challengeNumber} leaks ${r.player.name}`);
  }
  // The reveal names ONLY the player whose career the card showed. The other
  // two of the day's three rounds had no clue in the post, so naming them
  // would spoil them for nothing.
  assert.ok(reveal.includes(daily.rounds[0].player.name),
    `#${daily.challengeNumber} reveal missing the shown player`);
  for (const r of daily.rounds.slice(1)) {
    assert.ok(!reveal.includes(r.player.name),
      `#${daily.challengeNumber} reveal leaks unshown ${r.player.name}`);
  }
  // Every post must route to the game somehow.
  assert.ok(/derabona\.club/.test(puzzle), `#${daily.challengeNumber} has no route to the game`);

  if (withLink) linkDays++;
  if (!puzzle.includes('→')) fallbacks++;
  worstPuzzle = Math.max(worstPuzzle, weightedLength(puzzle));
  worstReveal = Math.max(worstReveal, weightedLength(reveal));

  if (i < 2 || (withLink && linkDays === 1)) {
    console.log(`=== ${date} — Rabona Diaria #${daily.challengeNumber} ${withLink ? '[LINK DAY]' : '[bare domain]'} ===`);
    console.log(puzzle);
    console.log(`  ↳ ${reveal.replace(/\n+/g, ' | ')}`);
    console.log(`  [puzzle ${weightedLength(puzzle)}ch $${postCost(puzzle)} · reveal ${weightedLength(reveal)}ch $${postCost(reveal)}]\n`);
  }
}

// Recurring worst case: a 31-day month can contain five configured link days.
// Five account timelines/day × X's five-post minimum = 25 reads/day.
const budgetDays = 31;
const worstLinkDays = Math.ceil(budgetDays / 7);
const approvedRepliesPerMonth = 5;
const posts = worstLinkDays * COST.postWithUrl
  + (budgetDays - worstLinkDays) * COST.post
  + budgetDays * (COST.media + COST.post); // image + reveal
const reads = 5 * 5 * budgetDays * COST.read;
const replyCost = COST.read + COST.post; // source lookup + reply in approve.mjs
const replies = approvedRepliesPerMonth * replyCost;
const total = posts + replies + reads;
const oneMoreReply = total + replyCost;

console.log(`40 days simulated. Link days: ${linkDays}/40 (policy: weekday ${LINK_DAYS.join(',')})`);
console.log(`max weighted length — puzzle ${worstPuzzle}, reveal ${worstReveal} (safe limit ${POST_LIMIT}, X nominal 280)`);
console.log(`long-career fallback used on ${fallbacks}/40 days`);
console.log(`\nworst-case ${budgetDays}-day budget (${worstLinkDays} link days):`);
console.log(`  posts+media+reveals  $${posts.toFixed(3)}`);
console.log(`  approved replies (${approvedRepliesPerMonth}/month) $${replies.toFixed(3)}`);
console.log(`  reads (5 accounts × 5 posts/day) $${reads.toFixed(3)}`);
console.log(`  TOTAL                $${total.toFixed(3)}  (cap $${MONTHLY_CAP.toFixed(2)})`);
assert.ok(total <= MONTHLY_CAP, `budget $${total.toFixed(3)} exceeds cap $${MONTHLY_CAP}`);
assert.ok(oneMoreReply > MONTHLY_CAP,
  `budget unexpectedly funds more than ${approvedRepliesPerMonth} replies in the worst month`);
console.log('\nALL ASSERTIONS PASSED');
