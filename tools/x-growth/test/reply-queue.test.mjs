import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-reply-queue-'));
const filePath = path.join(dir, 'reply-jobs.json');
const { ReplyQueue } = await import('../lib/reply-queue.mjs');

const now = new Date('2026-09-21T12:00:00.000Z');
const candidate = {
  sourceId: '2099999999999999999',
  sourceUrl: 'https://x.com/club/status/2099999999999999999',
  sourceHandle: 'club',
  sourceText: 'un post retrospectivo de fútbol suficientemente largo',
  replyText: 'che, esa camiseta era hermosa',
  draftId: 'batch-1-1',
  batchId: 'batch-1',
};

let queue = new ReplyQueue({ filePath });
const first = queue.enqueue(candidate, { mode: 'approved', now });
assert.equal(first.status, 'queued');
assert.equal(first.sourceId, candidate.sourceId);
assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8'))).sort(), ['events', 'jobs', 'version']);
console.log('PASS enqueue stores a durable JSON queue');

const replay = queue.enqueue(candidate, { mode: 'approved', now });
assert.equal(replay.id, first.id);
assert.equal(queue.all().length, 1);
assert.throws(() => queue.enqueue({ ...candidate, replyText: 'texto distinto' }, { mode: 'approved', now }), /different payload/);
console.log('PASS source id is idempotent and rejects changed payload');

const claimed = queue.claimNext({ now });
assert.equal(claimed.id, first.id);
assert.equal(claimed.status, 'publishing');
queue.close();
queue = new ReplyQueue({ filePath });
assert.equal(queue.get(first.id).status, 'publishing');
queue.recoverStalePublishing({ now: new Date('2026-09-21T12:01:00.000Z') });
assert.equal(queue.get(first.id).status, 'uncertain');
assert.equal(queue.listUncertain().length, 1);
console.log('PASS publishing survives restart and becomes uncertain, never requeued');

queue.markPublished(first.id, {
  id: '2100000000000000001',
  url: 'https://x.com/derabona_club/status/2100000000000000001',
  authorHandle: 'derabona_club',
  text: candidate.replyText,
  parentId: candidate.sourceId,
}, { now });
assert.equal(queue.get(first.id).status, 'published');
assert.throws(() => queue.markPublished(first.id, { id: 'other', url: 'x', authorHandle: 'derabona_club', text: candidate.replyText, parentId: candidate.sourceId }, { now }), /already published/);
console.log('PASS published id is immutable');

const expired = queue.enqueue({ ...candidate, sourceId: '2099999999999999998', draftId: 'batch-1-2' }, { mode: 'approved', now, expiresAt: new Date('2026-09-21T12:00:01.000Z') });
queue.cancelExpired({ now: new Date('2026-09-21T12:00:02.000Z') });
assert.equal(queue.get(expired.id).status, 'cancelled');
console.log('PASS expired queued reply is cancelled');

queue.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log('ALL JSON REPLY QUEUE TESTS PASSED');
