// 14-day dry-run simulation: distinct players, incrementing editions,
// no URLs, every post within the weighted limit, correct reveal cost.
import assert from 'node:assert';
import { composeText } from '../post-daily.mjs';
import { composeReveal, colourLine } from '../post-reveal.mjs';
import { buildQueue, computeTiers } from '../lib/queue.mjs';
import { loadRoster, playerById } from '../lib/roster.mjs';
import { weightedLength, containsUrl, postCost } from '../lib/x-client.mjs';
import { COST } from '../lib/state.mjs';

const { players } = loadRoster();
const q = buildQueue(1);
const tiers = computeTiers(players);

console.log(`roster: ${players.length} players, queue: ${q.order.length}\n`);

const seen = new Set();
let worstPuzzle = 0, worstReveal = 0;

for (let day = 0; day < 14; day++) {
  const id = q.order[day];
  const edition = day + 1;
  const p = playerById(id);

  assert.ok(!seen.has(id), `repeat within 14 days: ${id}`);
  seen.add(id);

  const puzzle = composeText(p, edition);
  const reveal = composeReveal(p);

  assert.ok(!containsUrl(puzzle), `puzzle ${edition} contains a URL`);
  assert.ok(!containsUrl(reveal), `reveal ${edition} contains a URL`);
  assert.ok(weightedLength(puzzle) <= 280, `puzzle ${edition} is ${weightedLength(puzzle)}`);
  assert.ok(weightedLength(reveal) <= 280, `reveal ${edition} is ${weightedLength(reveal)}`);
  assert.strictEqual(postCost(reveal), COST.post, `reveal ${edition} would cost extra`);
  assert.ok(!puzzle.includes(p.name), `puzzle ${edition} leaks the player name`);

  worstPuzzle = Math.max(worstPuzzle, weightedLength(puzzle));
  worstReveal = Math.max(worstReveal, weightedLength(reveal));

  if (day < 4) {
    console.log(`=== día ${edition} — ${p.name} [${tiers[id]}] ===`);
    console.log(puzzle);
    console.log('  ↳ ' + reveal.replace(/\n+/g, ' | '));
    console.log();
  }
}

// no repeat across the full cycle
assert.strictEqual(new Set(q.order).size, q.order.length, 'queue has duplicates');

// weekly difficulty mix
const week1 = q.order.slice(0, 7).map(id => tiers[id]);
const counts = week1.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});

console.log(`14 days simulated, all distinct.`);
console.log(`full cycle: ${q.order.length} players, no repeats -> ${(q.order.length / 30).toFixed(1)} months before one repeats`);
console.log(`week 1 mix: ${JSON.stringify(counts)}`);
console.log(`max weighted length — puzzle ${worstPuzzle}, reveal ${worstReveal} (limit 280)`);

// longest career must still compose safely
const longest = [...players].sort((a, b) => b.clubs.length - a.clubs.length)[0];
const lt = composeText(longest, 999);
console.log(`\nlongest career (${longest.clubs.length} clubs) -> ${weightedLength(lt)} chars, fallback used: ${!lt.includes('→')}`);
assert.ok(weightedLength(lt) <= 280);
console.log(`colour line: ${colourLine(longest)}`);
console.log('\nALL ASSERTIONS PASSED');
