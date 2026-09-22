import assert from 'node:assert/strict';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { verifyReplyPermalink, submitPreparedReply } from '../lib/reply-verification.mjs';
import { assertSourceSnapshot } from '../lib/source-snapshot.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
const job = {sourceUrl:'https://x.com/club/status/123',sourceHandle:'club',sourceId:'123',sourceText:'parent',replyText:'reply'};
let wrongParent = false;
await page.route('https://x.com/**', route => route.fulfill({contentType:'text/html',body:`<article><a href="/club/status/123"><time>source</time></a><div data-testid="tweetText">parent</div></article>${wrongParent ? '<article><a href="/other/status/456"><time>other</time></a></article>' : ''}<article><a href="/derabona_club/status/789"><time>reply</time></a><div data-testid="tweetText">reply</div></article>`}));
try {
  assert.equal((await verifyReplyPermalink(page,job,'https://x.com/derabona_club/status/789')).parentId,'123');
  wrongParent = true;
  await assert.rejects(()=>verifyReplyPermalink(page,job,'https://x.com/derabona_club/status/789'),e=>e.code==='uncertain_submission');
  await assert.rejects(()=>verifyReplyPermalink(page,job,'https://evil.example/derabona_club/status/789'),e=>e.code==='uncertain_submission');
  console.log('PASS public conversation verifies exact reply and immediate parent, rejects ancestor and foreign origin');
  async function composer() {
    await page.setContent('<div id="editor">reply</div><button>Send</button>');
    await page.evaluate(() => { window.clicks = 0; document.querySelector('button').onclick = () => { window.clicks++; const a=document.createElement('a'); a.href='/derabona_club/status/789'; document.body.append(a); }; });
    return {composer:page.locator('#editor'),submit:page.locator('button')};
  }
  wrongParent=false;
  const sandboxVerify = vm.runInNewContext(`(${verifyReplyPermalink.toString()})`, {assertSourceSnapshot});
  const sandboxSubmit = vm.runInNewContext(`(${submitPreparedReply.toString()})`);
  assert.equal((await sandboxSubmit(page,job,await composer(),sandboxVerify)).id,'789');
  console.log('PASS verifier and submit work in CLI-like sandbox without Node URL global');
  const prepared=await composer();
  await assert.rejects(()=>submitPreparedReply(page,job,prepared,async()=>{throw Error('readback unavailable');}),e=>e.code==='uncertain_submission');
  assert.equal(await page.evaluate(()=>window.clicks),1);
  console.log('PASS submit uses public permalink readback; post-click failure is uncertain and never clicks twice');
} finally {await browser.close();}
