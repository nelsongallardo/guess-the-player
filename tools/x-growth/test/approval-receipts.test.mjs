import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'derabona-reapproval-'));process.env.DERABONA_STATE=dir;
const {writeState}=await import('../lib/state.mjs');const {runService}=await import('../reply-service.mjs');const {ReplyQueue}=await import('../lib/reply-queue.mjs');
const queue=new ReplyQueue({filePath:path.join(dir,'reply-jobs.json')});
const batch={id:'2026-09-22-123',at:new Date().toISOString(),drafts:[{id:'d1',n:1,status:'pending',handle:'club',sourceId:'123',sourceUrl:'https://x.com/club/status/123',sourceText:'body https://t.co/fixture',reply:'reply'}]};
const notices=[];const options={queue,notify:async t=>notices.push(t)};
try {
 writeState('drafts.json',{batches:[batch]});
 await runService({...options,batchId:batch.id,picks:['1'],requestId:'a'.repeat(64)});
 await runService({...options,publisherFactory:()=>({close:async()=>{},publish:async()=>{throw Object.assign(Error('mismatch'),{code:'source_changed'});}})});
 assert.equal(queue.all()[0].status,'blocked');
 await runService({...options,batchId:batch.id,picks:['1'],requestId:'a'.repeat(64)});
 assert.equal(queue.all()[0].status,'blocked','redelivery is not fresh approval');
 await runService({...options,batchId:batch.id,picks:['1'],requestId:'b'.repeat(64)});
 assert.equal(queue.all()[0].status,'queued','a new explicit message may retry known pre-submit source rejection');
 assert.equal(queue.all().length,1);
 await runService({...options,publisherFactory:()=>({close:async()=>{},publish:async()=>{throw Object.assign(Error('mismatch'),{code:'source_changed'});}})});
 assert.equal(notices.filter(t=>t.includes('respuesta blocked')).length,2,'each newly approved attempt must get its own terminal result');
 const {readState}=await import('../lib/state.mjs');
 assert.equal(readState('drafts.json').batches[0].drafts[0].status,'blocked');
 await runService({...options,batchId:batch.id,picks:['1'],requestId:'d'.repeat(64)});
 queue.claimNext();queue.markUncertain(queue.all()[0].id,'uncertain_submission');
 await runService({...options,batchId:batch.id,picks:['1'],requestId:'c'.repeat(64)});
 assert.equal(queue.all()[0].status,'uncertain','uncertain must never retry');
 console.log('PASS source-only pre-submit retry requires new approval receipt; redelivery blocked, no duplicate job, uncertain immutable');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
