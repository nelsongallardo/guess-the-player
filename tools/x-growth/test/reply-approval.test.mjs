import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-approval-'));
process.env.DERABONA_STATE = stateDir;
const { approve } = await import('../approve.mjs');
const { readState, writeState } = await import('../lib/state.mjs');

const batch = {
  id: 'batch-1', at: new Date().toISOString(), drafts: [
    { id: 'd1', n: 1, status: 'pending', handle: 'clubone', sourceId: '201', sourceUrl: 'https://x.com/clubone/status/201', sourceText: 'post one', reply: 'respuesta uno', tag: 'nostalgia' },
    { id: 'd2', n: 2, status: 'pending', handle: 'clubtwo', sourceId: '202', sourceUrl: 'https://x.com/clubtwo/status/202', sourceText: 'post two', reply: 'respuesta dos', tag: 'nostalgia' },
    { id: 'd3', n: 3, status: 'pending', handle: 'clubthree', sourceId: '203', sourceUrl: 'https://x.com/clubthree/status/203', sourceText: 'post three', reply: 'respuesta tres', tag: 'nostalgia' },
  ],
};
writeState('drafts.json', { batches: [batch] });
const jobs = [];
const queue = { enqueue(candidate) { jobs.push(candidate); return { id: `job-${jobs.length}`, status: 'queued' }; }, close() {} };
const xClient = { async getPost(id) { return { id }; }, async createPost() { throw new Error('API publish must not run in browser mode'); } };

const first = await approve('1', { transport: 'browser', xClient, queue });
assert.equal(first.queued, true);
assert.equal(readState('drafts.json').batches[0].drafts[0].status, 'queued');
assert.equal(readState('drafts.json').batches[0].drafts[1].status, 'pending');
assert.equal(readState('drafts.json').batches[0].drafts[2].status, 'pending');

const third = await approve('3', { transport: 'browser', xClient, queue });
assert.equal(third.queued, true);
assert.equal(jobs.length, 2);
assert.deepEqual(jobs.map(job => job.sourceId), ['201', '203']);
assert.equal(readState('drafts.json').batches[0].drafts[1].status, 'pending');
console.log('PASS browser approval queues selected drafts without skipping unrelated drafts');

await assert.rejects(() => approve('1', { transport: 'browser', xClient, queue }), /already queued/);
console.log('PASS repeat approval is not republished');
fs.rmSync(stateDir, { recursive: true, force: true });
