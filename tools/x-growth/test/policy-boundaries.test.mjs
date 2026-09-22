import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'derabona-policy-boundaries-'));process.env.DERABONA_STATE=dir;
const {checkReplyPolicy}=await import('../lib/reply-policy.mjs');
const {runService}=await import('../reply-service.mjs');
const {runWorker}=await import('../publish-replies.mjs');
const {ReplyQueue}=await import('../lib/reply-queue.mjs');
const {writeState}=await import('../lib/state.mjs');
const now=new Date();const text='Una carrera que cruza ligas, clubes y varias épocas.';
try {
 for(const status of ['uncertain','publishing','published']) {
  const previous={id:'prior',status,sourceHandle:'different_author',replyText:text,createdAt:new Date(now-3600e3).toISOString(),attemptStartedAt:new Date(now-3600e3).toISOString(),publishedId:status==='published'?'789':null};
  assert.equal(checkReplyPolicy({handle:'new_author',reply:text,batchAt:now},{queue:[previous],posts:[],now}).reason,'too similar',status+' must protect possibly published text');
  const old={...previous,createdAt:new Date(now-15*864e5).toISOString(),attemptStartedAt:new Date(now-15*864e5).toISOString()};
  assert.equal(checkReplyPolicy({handle:'new_author',reply:text,batchAt:now},{queue:[old],posts:[],now}).ok,true,'old history stays outside documented window');
 }
 console.log('PASS unresolved/published-but-unprojected replies participate in 14-day similarity checks');
 const batch={id:'2026-09-22-123',at:new Date(now-11.99*3600e3).toISOString(),drafts:[{id:'late',n:1,status:'pending',sourceId:'123',handle:'new_author',sourceText:'Original source',sourceUrl:'https://x.com/new_author/status/123',reply:'Nueva respuesta para esta prueba de caducidad'}]};
 writeState('drafts.json',{batches:[batch]});
 const queue=new ReplyQueue({filePath:path.join(dir,'reply-jobs.json')});
 await runService({batchId:batch.id,picks:['1'],queue,notify:async()=>{}});
 const job=queue.all()[0];
 assert.equal(job.batchAt,batch.at,'queue must preserve original batch time');
 const deadline=new Date(Date.parse(batch.at)+12*3600e3);assert.equal(job.expiresAt,deadline.toISOString());
 let sends=0;const result=await runWorker({queue,lockPath:path.join(dir,'worker.lock'),now:deadline,publisher:{publish:async()=>{sends++;throw Error('must not send expired approval');},close:async()=>{}}});
 assert.equal(sends,0);assert.equal(result.kind,'empty');assert.equal(queue.all()[0].status,'cancelled');
 console.log('PASS near-expiry approval retains original deadline; worker cancels at deadline before browser/send');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
