// Regression test for the 2026-09-21 rollover bug: the 01:00 London reveal
// runs at UTC 00:00, already past the UTC date rollover, so a same-day
// (today() ===) match against the puzzle's date silently found nothing and
// the job no-opped. mostRecentUnrevealed() must find it regardless of which
// UTC date the job actually runs on.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-reveal-'));
process.env.DERABONA_STATE = tmp;

const { writeState, mostRecentUnrevealed } = await import('../lib/state.mjs');

// Puzzle posted 2026-09-20 18:10 London; reveal job runs 2026-09-21 01:00
// London == 2026-09-21 00:00 UTC. today() at run time would be "2026-09-21",
// but the puzzle's recorded date is "2026-09-20" — the exact live mismatch.
writeState('posts.json', [{
  date: '2026-09-20', kind: 'puzzle', challengeNumber: 4, playerId: 'vicente-sanchez',
  tweetId: '2101735662177132895', text: 'puzzle text',
}]);

const found = mostRecentUnrevealed();
assert.ok(found, 'must find the puzzle across the UTC date rollover');
assert.strictEqual(found.challengeNumber, 4);
console.log('PASS finds puzzle across UTC rollover (the live bug case)');

// Once a reveal for that challengeNumber exists, must not fire again —
// this is the idempotency guard, now keyed on challengeNumber not date.
writeState('posts.json', [
  { date: '2026-09-20', kind: 'puzzle', challengeNumber: 4, tweetId: 't1' },
  { date: '2026-09-21', kind: 'reveal', challengeNumber: 4, tweetId: 't2' },
]);
assert.strictEqual(mostRecentUnrevealed(), null, 'must not re-reveal an already-revealed challenge');
console.log('PASS does not re-reveal an already-revealed challenge');

// No puzzle at all yet.
writeState('posts.json', []);
assert.strictEqual(mostRecentUnrevealed(), null, 'no puzzle means nothing to reveal');
console.log('PASS nothing to reveal when no puzzle exists');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nALL REVEAL-ROLLOVER TESTS PASSED');
