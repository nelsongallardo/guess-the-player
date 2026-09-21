// State + spend ledger tests. Run against a throwaway state dir.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-state-'));
process.env.DERABONA_STATE = tmp;

const s = await import('../lib/state.mjs');

// atomic write + read
s.writeState('t.json', { a: 1 });
assert.deepStrictEqual(s.readState('t.json'), { a: 1 });
assert.strictEqual(s.readState('missing.json', 'fallback'), 'fallback');
console.log('PASS read/write + fallback');

// no .tmp litter left behind
assert.ok(!fs.readdirSync(tmp).some(f => f.includes('.tmp.')), 'temp file left behind');
console.log('PASS atomic write leaves no temp files');

// kill switch
assert.strictEqual(s.isPaused(), false);
fs.writeFileSync(path.join(tmp, 'PAUSE'), '');
assert.strictEqual(s.isPaused(), true);
fs.unlinkSync(path.join(tmp, 'PAUSE'));
console.log('PASS kill switch');

// spend priority reserves
s.writeState('spend.json', { month: s.currentMonth(), spent: 5.10, entries: [] });
assert.strictEqual(s.canSpend(0.005, 4).ok, false, 'reads should be refused at $5.10');
assert.strictEqual(s.canSpend(0.015, 3).ok, true, 'replies still allowed at $5.10');
assert.strictEqual(s.canSpend(0.015, 1).ok, true, 'daily puzzle must always be allowed');
console.log('PASS priority reserve at $5.10 (reads blocked, puzzle allowed)');

s.writeState('spend.json', { month: s.currentMonth(), spent: 5.50, entries: [] });
assert.strictEqual(s.canSpend(0.015, 3).ok, false, 'replies refused at $5.50');
assert.strictEqual(s.canSpend(0.015, 2).ok, true, 'reveal still allowed at $5.50');
assert.strictEqual(s.canSpend(0.015, 1).ok, true, 'puzzle still allowed at $5.50');
console.log('PASS priority reserve at $5.50 (replies blocked, reveal+puzzle allowed)');

// hard cap
s.writeState('spend.json', { month: s.currentMonth(), spent: 5.99, entries: [] });
assert.strictEqual(s.canSpend(0.02, 1).ok, false, 'hard cap must stop even priority 1');
console.log('PASS hard cap stops everything');

// month rollover resets
s.writeState('spend.json', { month: '2020-01', spent: 99, entries: [] });
assert.strictEqual(s.spentThisMonth(), 0, 'stale month should reset to 0');
console.log('PASS month rollover resets ledger');

// idempotency helper
s.writeState('posts.json', []);
assert.strictEqual(s.postedToday('puzzle'), null);
s.recordPost({ kind: 'puzzle', edition: 1, playerId: 'x', tweetId: '1', text: 't' });
assert.ok(s.postedToday('puzzle'), 'same-day puzzle must be detected');
assert.strictEqual(s.postedToday('reveal'), null);
console.log('PASS same-day idempotency guard');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nALL STATE TESTS PASSED');
