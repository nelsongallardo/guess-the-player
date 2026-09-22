import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state = fs.mkdtempSync(path.join(os.tmpdir(),'derabona-rendering-'));
process.env.DERABONA_STATE = state;
const {XBrowserPublisher} = await import('../lib/x-browser-publisher.mjs');
const {runService} = await import('../reply-service.mjs');
const {writeState,readState} = await import('../lib/state.mjs');
const {ReplyQueue} = await import('../lib/reply-queue.mjs');
const { verifyReplyPermalink } = await import('../lib/reply-verification.mjs');
const browser = await chromium.launch();
const page = await browser.newPage();
let clicks=0;await page.exposeFunction('recordClick',()=>{clicks++;});
const short = 'https://t.co/g6alFGYOJs';
const destination = 'https://x.com/i/broadcasts/1aKbdEpXMOVJX';
const body = '¿ERAN ROJAS? ¿TIENE SOLUCIÓN EL REAL MADRID? EL BARÇA VUELA | CHARLA CON JULEN GUERRERO | DESPEJADOS';
const job = {sourceId:'2102094806981972117',sourceHandle:'2010MisterChip',sourceUrl:'https://x.com/2010MisterChip/status/2102094806981972117',sourceText:`${body} ${short}`,sourceLinks:[{url:short,expanded_url:destination}],replyText:'Una respuesta de prueba, no pública'};
let edited = false, wrongCard = false, extraUrl = false;
await page.route('https://x.com/**', route => route.fulfill({contentType:'text/html; charset=utf-8',body:`
<a data-testid="AppTabBar_Profile_Link" href="/derabona_club">profile</a>
<article><a href="/${job.sourceHandle}/status/${job.sourceId}"><time>source</time></a>
<div data-testid="tweetText">${body}${edited ? ' EDITADO' : ''}${extraUrl ? ' https://example.org/extra' : ''}</div>
<div data-testid="card.wrapper"><a href="${wrongCard ? '/i/broadcasts/WRONG' : destination}">broadcast</a></div>
<button data-testid="reply">Reply</button></article>
${route.request().url().includes('/derabona_club/status/') ? '<article><a href="/derabona_club/status/789"><time>reply</time></a><div data-testid="tweetText">'+job.replyText+'</div></article>' : ''}
<div id="inline" contenteditable="true" data-testid="tweetTextarea_0"></div>
<script>document.querySelector('button').onclick=()=>{
 const d=document.createElement('div');d.setAttribute('role','dialog');
 d.innerHTML='<a href="/${job.sourceHandle}">author</a><div data-testid="tweetText">${body} <span dir="ltr"><span aria-hidden="true">https://</span>x.com/i/broadcasts/1<span aria-hidden="true">aKbdEpXMOVJX</span><span aria-hidden="true">…</span></span></div><div data-testid="tweetTextarea_0" contenteditable="true"></div><button data-testid="tweetButton">Send</button>';
 document.body.append(d);d.querySelector('button').onclick=()=>{window.recordClick();const a=document.createElement('a');a.href='/derabona_club/status/789';document.body.append(a);};};</script>`}));
const publisher = new XBrowserPublisher({resolveUrl:async url=>{assert.equal(url,short);return destination;}});
publisher.page = page; publisher._context = async()=>{};
try {
 // Exercise actual browser preparation, not just string normalization.
 await publisher.inspectSource(job);
 await publisher.prepareReply(job);
 assert.equal(await page.locator('#inline').innerText(),'');
 assert.equal(await page.locator('[role="dialog"] [contenteditable]').innerText(),job.replyText);
 assert.equal((await verifyReplyPermalink(page,job,'https://x.com/derabona_club/status/789')).parentId,job.sourceId);
 console.log('PASS API short URL → detail card → expanded dialog → verified public parent');
 for(const variant of ['edited','wrongCard','extraUrl']) {
  edited=variant==='edited';wrongCard=variant==='wrongCard';extraUrl=variant==='extraUrl';
  publisher.preparedSourceId=null;
  await assert.rejects(async()=>{await publisher.inspectSource(job);await publisher.prepareReply(job);}, e=>e.code==='source_changed');
  assert.equal(await page.locator('[role="dialog"]').count(),0);
 }
 console.log('PASS edited body, changed destination and extra URL blocked before composing');
 edited=false;wrongCard=false;extraUrl=false;
 const batch={id:'2026-09-22-123',at:new Date().toISOString(),drafts:[{id:'selected',n:1,handle:job.sourceHandle,sourceId:job.sourceId,sourceUrl:job.sourceUrl,sourceText:job.sourceText,sourceLinks:job.sourceLinks,reply:job.replyText,status:'pending'},{id:'untouched',n:2,status:'pending'}]};
 writeState('drafts.json',{batches:[batch]});
 const queue=new ReplyQueue({filePath:path.join(state,'reply-jobs.json')});
 const notices=[];const options={queue,notify:async text=>notices.push(text),publisherFactory:()=>publisher};
 await runService({...options,batchId:batch.id,picks:['1']});assert.equal(clicks,0);
 await runService(options);
 assert.equal(clicks,1);assert.equal(queue.all()[0].status,'published');
 assert.equal(readState('posts.json').length,1);assert.equal(readState('drafts.json').batches[0].drafts[1].status,'pending');
 await runService({...options,batchId:batch.id,picks:['1']});await runService(options);
 assert.equal(clicks,1);assert.equal(notices.filter(t=>t.includes('respuesta publicada')).length,1);
 assert.ok(notices.every(t=>t.includes(batch.id)));
 console.log('PASS approval → durable queue → real Chromium compose/one click → public parent verification → history/report once (mock X, no external publication)');
 let resolutions=0;
 publisher.resolveUrl=async()=>{resolutions++;assert.equal(resolutions,1,'legacy URL destination resolved more than once');return destination;};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('post-submit URL resolution forbidden');};
 try {
  const legacy={...job,sourceLinks:[]};
  const publication=await publisher.publish(legacy);
  assert.equal(publication.parentId,job.sourceId);assert.equal(resolutions,1);
 } finally {globalThis.fetch=originalFetch;}
 console.log('PASS legacy redirect is resolved once and pinned through submission/public-parent verification');
 const beforeExpiryTest=clicks;const prepare=publisher.prepareReply.bind(publisher);
 publisher.prepareReply=async j=>{const result=await prepare(j);j.expiresAt=new Date(Date.now()-1).toISOString();return result;};
 await assert.rejects(()=>publisher.publish({...job,expiresAt:new Date(Date.now()+60000).toISOString()}),e=>e.code==='approval_expired');
 assert.equal(clicks,beforeExpiryTest,'expiry during navigation/composition must prevent submit');
 console.log('PASS original approval deadline rechecked at the submit boundary');
} finally {await browser.close();fs.rmSync(state,{recursive:true,force:true});}
