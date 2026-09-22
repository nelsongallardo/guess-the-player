import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sourceId = '2099999999999999999';
const sourceText = 'un post retrospectivo de fútbol suficientemente largo';
const replyText = 'che, esa camiseta era hermosa';
const server = http.createServer((req, res) => {
  const wrong = new URL(req.url, 'http://localhost').searchParams.get('wrong') === '1';
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><body>
    <a data-testid="AppTabBar_Profile_Link" href="/${wrong ? 'other_account' : 'derabona_club'}">profile</a>
    <article data-testid="tweet"><a href="/club/status/${sourceId}">source</a><div data-testid="tweetText">${sourceText}</div><button data-testid="reply">Reply</button></article>
    <div id="inline" contenteditable="true" data-testid="tweetTextarea_0"></div>
    <script>
      document.querySelector('[data-testid=reply]').onclick=()=>setTimeout(()=>{
        const dialog=document.createElement('div'); dialog.setAttribute('role','dialog');
        dialog.innerHTML='<a href="/club">club</a><div data-testid="tweetText">${sourceText}</div><div contenteditable="true" data-testid="tweetTextarea_0"></div><button data-testid="tweetButton">Send</button>';
        document.body.append(dialog);
        dialog.querySelector('[data-testid=tweetButton]').onclick=()=>{
          const text=dialog.querySelector('[data-testid=tweetTextarea_0]').innerText;
          const result=document.createElement('article'); result.dataset.testid='reply-result'; result.dataset.parent='${sourceId}';
          result.innerHTML='<a href="/derabona_club/status/2100000000000000001">permalink</a><div>'+text+'</div>';
          document.body.append(result);
        };
      }, 500);
    </script>
  </body>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const { XBrowserPublisher } = await import('../lib/x-browser-publisher.mjs');
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-browser-profile-'));
const job = { sourceId, sourceUrl: `${baseUrl}/status/${sourceId}`, sourceHandle: 'club', sourceText, replyText };

const publisher = new XBrowserPublisher({ baseUrl, profilePath, fixtureMode: true });
const publication = await publisher.publish(job);
assert.deepEqual(publication, { id: '2100000000000000001', url: `${baseUrl}/derabona_club/status/2100000000000000001`, authorHandle: 'derabona_club', text: replyText, parentId: sourceId });
await publisher.close();
console.log('PASS mock-X browser publication requires exact readback');

const wrongAccount = new XBrowserPublisher({ baseUrl, homeUrl: `${baseUrl}/home?wrong=1`, fixtureMode: true, profilePath: fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-browser-profile-')) });
await assert.rejects(() => wrongAccount.publish({ ...job, sourceUrl: `${baseUrl}/status/${sourceId}?wrong=1` }), error => error.code === 'auth_required');
await wrongAccount.close();
console.log('PASS mock-X browser refuses wrong account');

await new Promise(resolve => server.close(resolve));
fs.rmSync(profilePath, { recursive: true, force: true });
console.log('ALL MOCK-X BROWSER TESTS PASSED');
