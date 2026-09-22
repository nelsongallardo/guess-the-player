import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ReplyQueue } from '../lib/reply-queue.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-retry-'));
try {
  const q = new ReplyQueue({ filePath: path.join(dir, 'queue.json') });
  const j = q.enqueue({ sourceId: '123', draftId: 'test', replyText: 'text' }, { mode: 'approved' });
  q.claimNext(); q.block(j.id, 'composer_mismatch');
  assert.throws(() => q.retryComposerBlocked(j.id), /fresh approval/);
  assert.throws(() => q.retryComposerBlocked(j.id, { approved: true, now: new Date('2100-01-01') }), /expired/);
  q.retryComposerBlocked(j.id, { approved: true });
  assert.equal(q.claimNext().id, j.id);
  q.markUncertain(j.id, 'test');
  assert.throws(() => q.retryComposerBlocked(j.id, { approved: true }), /known pre-submit/);
  assert.equal(q.claimNext(), null);
  console.log('PASS explicit pre-submit retry requires fresh valid approval; uncertain is never requeued');
} finally { fs.rmSync(dir, { recursive: true }); }
