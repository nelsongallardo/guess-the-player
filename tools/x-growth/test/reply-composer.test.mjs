import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { XBrowserPublisher } from '../lib/x-browser-publisher.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
const job = { sourceId: '12345', sourceHandle: 'club', sourceText: 'football source', replyText: 'one exact reply' };
const publisher = new XBrowserPublisher();
publisher.page = page;
async function fixture({ existing = '', extra = false, wrong = false } = {}) {
  await page.setContent(`<article><a href="/club/status/12345">source</a><div data-testid="tweetText">football source</div><button data-testid="reply">Reply</button></article><div id="inline" contenteditable="true" data-testid="tweetTextarea_0"></div>`);
  await page.evaluate(({ existing, extra, wrong }) => {
    window.inputs = 0;
    document.querySelector('button').onclick = () => setTimeout(() => {
      const outer = document.createElement('div'); outer.setAttribute('role', 'dialog');
      outer.innerHTML = `<div role="dialog"><a href="/${wrong ? 'wrong' : 'club'}">author</a><div data-testid="tweetText">football source</div><div role="textbox" contenteditable="true" data-testid="tweetTextarea_0">${existing}</div>${extra ? '<div contenteditable="true" data-testid="tweetTextarea_0"></div>' : ''}<button data-testid="tweetButton">Send</button></div>`;
      document.body.prepend(outer);
      outer.addEventListener('input', () => window.inputs++);
    }, 150);
  }, { existing, extra, wrong });
}
try {
  await fixture();
  await publisher.prepareReply(job);
  assert.equal(await page.locator('#inline').innerText(), '');
  assert.equal(await page.locator('[role=dialog] [contenteditable=true]').innerText(), job.replyText);
  const inputs = await page.evaluate(() => window.inputs);
  await publisher.prepareReply(job);
  assert.equal(await page.evaluate(() => window.inputs), inputs, 'repeat preparation must not type again');
  assert.equal(await page.locator('[role=dialog]:not(:has([role=dialog]))').count(), 1);
  console.log('PASS delayed nested dialog; inline untouched; repeated prepare never types twice');
  for (const [options, code] of [[{existing:'someone else draft'}, 'composer_not_empty'], [{extra:true}, 'composer_ambiguous'], [{wrong:true}, 'composer_parent_mismatch']]) {
    await fixture(options);
    await assert.rejects(() => publisher.prepareReply(job), e => e.code === code);
    assert.equal(await page.evaluate(() => window.inputs), 0);
    assert.equal(await page.locator('#inline').innerText(), '');
  }
  console.log('PASS existing text, ambiguous editors and wrong parent blocked before typing');
} finally { await browser.close(); }
