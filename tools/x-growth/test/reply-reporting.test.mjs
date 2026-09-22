import assert from 'node:assert/strict';
import { projectPublishedReply } from '../lib/reply-reporting.mjs';

const job = { id: 'job-1', sourceId: '201', sourceHandle: 'club', replyText: 'respuesta', publishedId: '301', publishedUrl: 'https://x.com/derabona_club/status/301' };
const entries = [];
const persist = entry => entries.push(entry);
assert.equal(projectPublishedReply(job, { posts: [], persist }), true);
assert.equal(entries.length, 1);
assert.equal(entries[0].browserReplyId, '301');
assert.equal(projectPublishedReply(job, { posts: entries, persist }), false);
assert.equal(entries.length, 1);
console.log('PASS projection is idempotent by verified browser publication ID');
