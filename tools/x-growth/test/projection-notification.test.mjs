import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'derabona-projection-report-'));process.env.DERABONA_STATE=dir;
const {ReplyQueue}=await import('../lib/reply-queue.mjs');const {reportResults}=await import('../reply-service.mjs');
const {writeState,readState}=await import('../lib/state.mjs');
try {
 const queue=new ReplyQueue({filePath:path.join(dir,'reply-jobs.json')});
 const job=queue.enqueue({sourceId:'123',sourceHandle:'fixture',sourceUrl:'https://x.com/fixture/status/123',sourceText:'source',replyText:'Verified fixture reply',batchId:'batch',draftId:'draft'},{mode:'approved'});
 queue.claimNext();queue.markPublished(job.id,{id:'456',url:'https://x.com/derabona_club/status/456',authorHandle:'derabona_club',text:job.replyText,parentId:'123'});
 writeState('drafts.json',{batches:[{id:'batch',drafts:[{id:'draft',n:1,status:'queued'}]}]});
 let projections=0;const notices=[];const notify=async text=>notices.push(text);
 const project=()=>{projections++;throw Error('fixture persistent projection failure');};
 await reportResults(queue,{notify,project});
 assert.equal(projections,1);assert.equal(notices.length,1);
 assert.ok(notices[0].includes('respuesta publicada'));assert.ok(notices[0].includes('/status/456'));assert.ok(notices[0].includes('historial'));
 assert.equal(readState('drafts.json').batches[0].drafts[0].status,'approved');
 await reportResults(queue,{notify,project});assert.equal(projections,2);assert.equal(notices.length,1);
 let healed=false;await reportResults(queue,{notify,project:()=>{healed=true;}});
 assert.equal(healed,true,'history retry must not be gated by notification dedupe');assert.equal(notices.length,1);
 assert.equal(queue.all()[0].status,'published');
 console.log('PASS projection failure cannot suppress verified publication report; report once, retry projection without resending');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
