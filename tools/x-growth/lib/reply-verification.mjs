// Public rendered conversation only; no private X endpoints or cookie access.
import { assertSourceSnapshot } from './source-snapshot.mjs';
export async function submitPreparedReply(page, job, prepared, verify = verifyReplyPermalink) {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  if (await prepared.composer.innerText() !== job.replyText || !await prepared.submit.isEnabled()) fail('composer_mismatch');
  const selector = 'a[href^="/derabona_club/status/"]';
  const before = await page.locator(selector).evaluateAll(as => as.map(a => a.getAttribute('href')));
  try {
    await prepared.submit.click(); // Exactly one attempt; all later failures are uncertain.
    await page.waitForFunction(({ selector, before }) => [...document.querySelectorAll(selector)].some(a => /^\/derabona_club\/status\/\d+$/.test(a.getAttribute('href')) && !before.includes(a.getAttribute('href'))), { selector, before }, { timeout: 15000 });
    const links = await page.locator(selector).evaluateAll(as => as.map(a => a.getAttribute('href')));
    const fresh = [...new Set(links.filter(href => /^\/derabona_club\/status\/\d+$/.test(href) && !before.includes(href)))];
    if (fresh.length !== 1) fail('uncertain_submission');
    const url = await page.evaluate(({ href, source }) => new URL(href, source).toString(), { href: fresh[0], source: job.sourceUrl });
    return await verify(page, job, url, {destinations:prepared.destinations});
  } catch (error) {
    throw Object.assign(new Error(`submission requires reconciliation: ${error.message}`), { code: 'uncertain_submission' });
  }
}

export async function verifyReplyPermalink(page, job, url, {destinations} = {}) {
  const fail = () => { throw Object.assign(new Error('public reply verification failed'), { code: 'uncertain_submission' }); };
  const parsed = await page.evaluate(({ url, source }) => { const parsed = new URL(url); return { origin: parsed.origin, pathname: parsed.pathname, href: parsed.href, sourceOrigin: new URL(source).origin }; }, { url, source: job.sourceUrl });
  const match = parsed.pathname.match(/^\/derabona_club\/status\/(\d+)$/i);
  if (parsed.origin !== parsed.sourceOrigin || !match) fail();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const reply = page.locator('article').filter({ has: page.locator(`a[href="${parsed.pathname}"]`) });
  await reply.waitFor({ state: 'visible', timeout: 15000 });
  if (await reply.count() !== 1 || await reply.locator('[data-testid="tweetText"]').innerText() !== job.replyText) fail();
  // The immediate preceding post in the rendered conversation must be our source,
  // not merely an ancestor somewhere in the page or a recommended post below it.
  const parent = await reply.evaluate(el => {
    const posts = [...document.querySelectorAll('article')];
    const previous = posts[posts.indexOf(el) - 1];
    if (!previous) return null;
    const time = previous.querySelector('a:has(time)');
    return { href: time?.getAttribute('href'), text: previous.querySelector('[data-testid="tweetText"]')?.innerText };
  });
  if (parent?.href !== `/${job.sourceHandle}/status/${job.sourceId}`) fail();
  const parentArticle = page.locator('article').filter({has:page.locator(`a[href="${parent.href}"]`)});
  if (await parentArticle.count() !== 1) fail();
  await assertSourceSnapshot(job, parentArticle, {destinations, code:'uncertain_submission'});
  return { id: match[1], url: parsed.href, authorHandle: 'derabona_club', text: job.replyText, parentId: job.sourceId };
}
