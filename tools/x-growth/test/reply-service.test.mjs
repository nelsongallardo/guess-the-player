import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'derabona-service-'));process.env.DERABONA_STATE=dir;
const {writeState,readState}=await import('../lib/state.mjs');
const {runService,approveBatch}=await import('../reply-service.mjs');
const {ReplyQueue}=await import('../lib/reply-queue.mjs');
const queue=new ReplyQueue({filePath:path.join(dir,'reply-jobs.json')});
let sends=0;const notices=[];const notify=async t=>notices.push(t);
const batch={id:'2026-09-22-123456',at:new Date().toISOString(),drafts:[{id:'draft-a',n:1,handle:'club',sourceId:'123',sourceUrl:'https://x.com/club/status/123',sourceText:'original text',reply:'una camiseta inolvidable',status:'pending'},{id:'draft-b',n:2,handle:'other',sourceId:'456',sourceUrl:'https://x.com/other/status/456',sourceText:'another post',reply:'el nueve era una máquina',status:'pending'}]};
const publisherFactory=()=>({close:async()=>{},publish:async job=>{sends++;return {id:'789',url:'https://x.com/derabona_club/status/789',authorHandle:'derabona_club',text:job.replyText,parentId:job.sourceId};}});
try {
 writeState('drafts.json',{batches:[batch]});
 await runService({batchId:batch.id,picks:['1'],queue,notify,publisherFactory});
 assert.equal(sends,0);assert.equal(queue.all()[0].status,'queued');
 await runService({queue,notify,publisherFactory});
 assert.equal(sends,1);assert.equal(queue.all()[0].status,'published');
 assert.equal(readState('posts.json').length,1);assert.equal(readState('drafts.json').batches[0].drafts[0].status,'approved');
 assert.equal(readState('drafts.json').batches[0].drafts[1].status,'pending');
 await runService({batchId:batch.id,picks:['1'],queue,notify,publisherFactory});await runService({queue,notify,publisherFactory});assert.equal(sends,1);
 assert.equal(notices.filter(t=>t.includes('https://x.com/derabona_club/status/789')).length,1);
 await assert.rejects(()=>approveBatch('old-batch',['1'],{queue,notify}),/expired/);
 fs.writeFileSync(path.join(dir,'PAUSE'),'');await runService({batchId:batch.id,picks:['2'],queue,notify,publisherFactory});assert.equal(sends,1);fs.unlinkSync(path.join(dir,'PAUSE'));
 await runService({batchId:batch.id,picks:['2'],queue,notify,publisherFactory:()=>({close:async()=>{},publish:async()=>{sends++;throw Object.assign(Error('unknown'),{code:'uncertain_submission'});}})});
 await runService({queue,notify,publisherFactory:()=>({close:async()=>{},publish:async()=>{sends++;throw Object.assign(Error('unknown'),{code:'uncertain_submission'});}})});
 await runService({queue,notify,publisherFactory});assert.equal(sends,2);assert.equal(queue.all()[1].status,'uncertain');
 assert.equal(readState('drafts.json').batches[0].drafts[1].status,'uncertain');
 console.log('PASS batch approval → queue → worker → durable publication/draft → notification; repeat, PAUSE, stale and uncertain safeguards');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
