import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {readRenderedSource,matchesSourceSnapshot,compareSourceSnapshot,assertSourceSnapshot} from '../lib/source-snapshot.mjs';
import {XBrowserPublisher} from '../lib/x-browser-publisher.mjs';
import {verifyReplyPermalink} from '../lib/reply-verification.mjs';

// Minimal public DOM fixture from the reported source: quote is a role=link
// on detail, but a button in the reply dialog. No live requests or publishing.
const body='“OJALÁ QUE SIGA SCALONI”.\n\nNico Paz, en su llegada. 🇦🇷';
const quoted='“PARA TODO EL PAÍS ES UN ÍDOLO”. Franco Mastantuono, en su llegada al país. 🇦🇷';
const job={sourceId:'2102377866789056691',sourceHandle:'sudanalytics_',sourceUrl:'https://x.com/sudanalytics_/status/2102377866789056691',sourceText:`${body} https://t.co/IDxX3uUW0U https://t.co/BRC65z7QxD`,sourceLinks:[{url:'https://t.co/IDxX3uUW0U',expanded_url:'https://x.com/TyCSports/status/2102235548845048318/video/1'},{url:'https://t.co/BRC65z7QxD',expanded_url:'https://twitter.com/sudanalytics_/status/2102377454048620839'}],replyText:'Respuesta de prueba local'};

test('Sudanalytics video + quote matches through detail, composer and verified parent',async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage();
 const publisher=new XBrowserPublisher();
 publisher.page=page;publisher._context=async()=>{};
 try {
  await page.route('https://x.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`
   <article><a href="/${job.sourceHandle}/status/${job.sourceId}"><time>source</time></a><a href="/${job.sourceHandle}">source author</a>
    <div data-testid="tweetText">${body}</div><video></video>
    <div role="link"><div data-testid="tweetText">${quoted}</div><video></video></div>
    <button data-testid="reply">Reply</button></article>
   ${route.request().url().endsWith('/derabona_club/status/789')?`<article><a href="/derabona_club/status/789"><time>reply</time></a><div data-testid="tweetText">${job.replyText}</div></article>`:''}
   <div id="inline" data-testid="tweetTextarea_0" contenteditable="true"></div>
   <script>window.submits=0;document.querySelector('[data-testid=reply]').onclick=()=>{
    const dialog=document.createElement('div');dialog.setAttribute('role','dialog');
    dialog.innerHTML=${JSON.stringify(`<article><a href="/${job.sourceHandle}">author</a><div data-testid="tweetText">${body} <span dir="ltr"><span aria-hidden="true">https://</span>pic.x.com/IDxX3uUW0U</span> x.com/sudanalytics_/…</div><button role="button"><div data-testid="tweetText">${quoted} https://pic.x.com/cf2MLaQJhq</div></button></article><div data-testid="tweetTextarea_0" contenteditable="true"></div><button data-testid="tweetButton">Send</button>`)};
    document.body.append(dialog);dialog.querySelector('[data-testid=tweetButton]').onclick=()=>window.submits++;};</script>`}));
  await publisher.inspectSource(job);
  assert.equal((await readRenderedSource(page.locator('article'))).text,body);
  await publisher.prepareReply(job);
  assert.equal(await page.locator('#inline').innerText(),'');
  assert.equal(await page.locator('[role=dialog] [contenteditable]').innerText(),job.replyText);
  await publisher.prepareReply(job);
  assert.equal(await page.evaluate(()=>window.submits),0);
  assert.equal((await verifyReplyPermalink(page,job,'https://x.com/derabona_club/status/789')).parentId,job.sourceId);
 } finally {await browser.close();}
});

test('small edits, presentation and attachments are not source changes',()=>{
 for(const text of ['ojala que siga scaloni! Nico Paz en su llegada', `${body} EDITADO`, 'Ojalá siga Scaloni. Nico Paz habló cuando llegó al país.', `${body} https://example.org/another-link`,`${body} https://pic.x.com/IDxX3uUW0U x.com/sudanalytics_/…`]){
  assert.equal(matchesSourceSnapshot(job,{text,attachmentUrls:[]}),true,text);
 }
 assert.equal(matchesSourceSnapshot({sourceText:'football source'},{text:'football sources'}),true);
});

test('clearly different primary text is still rejected',()=>{
 for(const text of ['Venta de entradas para el concierto del sábado.','El estadio permanecerá cerrado por mantenimiento hasta noviembre.']){
  assert.equal(matchesSourceSnapshot(job,{text}),false);
 }
});

test('word overlap cutoff includes 40%, counts repeats and ignores ordering',()=>{
 const source={sourceText:'alpha bravo charlie delta echo'};
 assert.deepEqual(compareSourceSnapshot(source,{text:'alpha bravo foxtrot golf hotel'}),{matches:true,reason:'similar_source',similarity:0.4});
 assert.equal(compareSourceSnapshot(source,{text:'alpha bravo foxtrot golf hotel india'}).matches,false);
 assert.equal(compareSourceSnapshot(source,{text:'alpha alpha alpha alpha alpha'}).matches,false);
 assert.equal(compareSourceSnapshot(source,{text:'echo delta charlie bravo alpha'}).similarity,1);
});

test('a quoted author or permalink cannot stand in for the primary source identity',async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();
 const publisher=new XBrowserPublisher();publisher.page=page;publisher._context=async()=>{};
 try {
  // A wrong main post quoting the approved source, with otherwise identical text.
  await page.setContent(`<article><a href="/wrong/status/777"><time>wrong</time></a><div data-testid="tweetText">${body}</div><div role="link"><a href="/${job.sourceHandle}/status/${job.sourceId}"><time>quote</time></a><div data-testid="tweetText">${body}</div></div><button data-testid="reply">Reply</button></article>`);
  await assert.rejects(()=>publisher.prepareReply(job),e=>e.code==='source_identity_mismatch');
  // Existing composer is bound to this job, but only the quote has its author.
  publisher.preparedSourceId=job.sourceId;
  await page.setContent(`<div role="dialog"><a href="/wrong">wrong</a><div data-testid="tweetText">${body}</div><button><a href="/${job.sourceHandle}">quoted author</a><div data-testid="tweetText">${body}</div></button><div data-testid="tweetTextarea_0" contenteditable="true"></div><button data-testid="tweetButton">Send</button></div>`);
  await assert.rejects(()=>publisher.prepareReply(job),e=>e.code==='composer_parent_mismatch');
  assert.equal(await page.locator('[contenteditable]').innerText(),'');
  // A mention in the body is not the parent author either.
  await page.setContent(`<div role="dialog"><a href="/wrong">wrong</a><div data-testid="tweetText">${body} <a href="/${job.sourceHandle}">@${job.sourceHandle}</a></div><div data-testid="tweetTextarea_0" contenteditable="true"></div><button data-testid="tweetButton">Send</button></div>`);
  await assert.rejects(()=>publisher.prepareReply(job),e=>e.code==='composer_parent_mismatch');
  assert.equal(await page.locator('[contenteditable]').innerText(),'');
 } finally {await browser.close();}
});

test('absent, quote-only or ambiguous source text is unreadable, not changed',async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();
 try {
  for(const html of ['',`<button><div data-testid="tweetText">${body}</div></button>`,`<div data-testid="tweetText">${body}</div><div data-testid="tweetText">another primary block</div>`,`<div data-testid="tweetText">https://t.co/IDxX3uUW0U</div>`]){
   await page.setContent(`<article><a href="/${job.sourceHandle}/status/${job.sourceId}"><time>source</time></a>${html}</article>`);
   await assert.rejects(()=>assertSourceSnapshot(job,page.locator('article')),e=>e.code==='source_unreadable');
  }
 } finally {await browser.close();}
});
