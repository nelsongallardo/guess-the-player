import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-worker-'));
process.env.DERABONA_STATE = dir;
const { ReplyQueue } = await import('../lib/reply-queue.mjs');
const { runWorker } = await import('../publish-replies.mjs');
const queue = new ReplyQueue({ filePath: path.join(dir, 'reply-jobs.json') });
queue.enqueue({ sourceId: '201', sourceUrl: 'http://fixture/status/201', sourceHandle: 'club', sourceText: 'post', replyText: 'respuesta distinta', draftId: 'd1', batchId: 'b1' }, { mode: 'approved' });
let publishes = 0;
const publisher = {
  async publish() { publishes++; throw Object.assign(new Error('ambiguous'), { code: 'uncertain_submission' }); },
  async close() {},
};
await runWorker({ queue, publisher, lockPath: path.join(dir, 'worker.lock'), now: new Date() });
assert.equal(publishes, 1);
assert.equal(queue.all()[0].status, 'uncertain');
await runWorker({ queue, publisher, lockPath: path.join(dir, 'worker.lock'), now: new Date() });
assert.equal(publishes, 1);
console.log('PASS uncertain worker outcome is held and never resent');

const verified = new ReplyQueue({ filePath: path.join(dir, 'verified-jobs.json') });
verified.enqueue({ sourceId: '202', sourceUrl: 'http://fixture/status/202', sourceHandle: 'otherclub', sourceText: 'otro post', replyText: 'otra respuesta', draftId: 'd2', batchId: 'b1' }, { mode: 'approved' });
await runWorker({
  queue: verified,
  publisher: { async publish(job) { return { id: '302', url: 'https://x.com/derabona_club/status/302', authorHandle: 'derabona_club', text: job.replyText, parentId: job.sourceId }; }, async close() {} },
  lockPath: path.join(dir, 'verified-worker.lock'), now: new Date(),
});
const { loadPosts } = await import('../lib/state.mjs');
assert.equal(loadPosts().filter(post => post.browserReplyId === '302').length, 1);
console.log('PASS verified worker publication projects exactly once');
const interrupted = new ReplyQueue({filePath:path.join(dir,'interrupted-jobs.json')});
interrupted.enqueue({sourceId:'203',sourceUrl:'http://fixture/status/203',sourceHandle:'thirdclub',sourceText:'source',replyText:'Recorrer el ascenso tiene historias que vale la pena recordar',draftId:'d3',batchId:'b1'},{mode:'approved'});
interrupted.markPublished=()=>{throw new Error('fixture publication persistence failure');};
let sent=0;
const persistedPublisher={publish:async job=>{sent++;return {id:'303',url:'https://x.com/derabona_club/status/303',authorHandle:'derabona_club',text:job.replyText,parentId:job.sourceId};},close:async()=>{}};
const interruptedResult=await runWorker({queue:interrupted,publisher:persistedPublisher,lockPath:path.join(dir,'interrupted.lock')});
assert.equal(interruptedResult.kind,'uncertain','post-submit persistence failure must not claim nothing was published');
await runWorker({queue:interrupted,publisher:persistedPublisher,lockPath:path.join(dir,'interrupted.lock')});
assert.equal(sent,1);
console.log('PASS post-submit persistence failure remains uncertain and is never resent');
verified.close();
queue.close();
fs.rmSync(dir, { recursive: true, force: true });
