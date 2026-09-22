// Compare API snapshots with public rendered X posts, without dropping links.
const urls = text => [...text.matchAll(/https?:\/\/\S+/g)].map(m => m[0]);
const space = text => String(text).replace(/\s+/g, ' ').trim();
const fail = code => { throw Object.assign(new Error(code), {code}); };
function canonical(value) {
  const url = new URL(value, 'https://x.com');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('source_unreadable');
  if (url.hostname === 'twitter.com' || url.hostname === 'www.twitter.com' || url.hostname === 'www.x.com') url.hostname = 'x.com';
  return url.href;
}

export async function resolveShortUrl(value) {
  // Never fetch arbitrary destinations supplied by a post. Read one t.co redirect
  // without following it (including redirects into private/local networks).
  if (!/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(value)) return canonical(value);
  const response = await fetch(value, {method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)});
  const location = response.headers.get('location');
  if (![301,302,303,307,308].includes(response.status) || !location) fail('source_unreadable');
  const result = canonical(location);
  if (new URL(result).hostname === 't.co') fail('source_unreadable');
  return result;
}

export async function sourceDestinations(job, resolveUrl = resolveShortUrl) {
  const map = {};
  for (const url of urls(job.sourceText)) {
    const entity = job.sourceLinks?.find(link => link.url === url);
    // New scouts pin the destination before approval. Legacy snapshots require
    // a successful read of the short-link redirect and matching rendered card.
    map[url] = canonical(entity?.expanded_url || await resolveUrl(url));
  }
  return map;
}

export async function readRenderedSource(container) {
  return container.evaluate(el => {
    const texts = [...el.querySelectorAll('[data-testid="tweetText"]')];
    if (texts.length !== 1) return null;
    const copy = texts[0].cloneNode(true);
    // The reply dialog uses a non-anchor URL label: hidden spans retain the
    // full URL and a separate aria-hidden final span adds a decorative ellipsis.
    // Remove only that marker, retaining every character of the destination.
    for (const marker of copy.querySelectorAll('[dir="ltr"] > span[aria-hidden="true"]:last-child')) {
      if (marker.textContent === '…' && /^https?:\/\/\S+…$/.test(marker.parentElement.textContent)) marker.remove();
    }
    // X truncates display labels for inline links; compare their destinations.
    for (const a of copy.querySelectorAll('a')) {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//.test(href)) a.replaceWith(href);
    }
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
    return {text:copy.textContent, attachmentUrls:[...el.querySelectorAll('[data-testid="card.wrapper"] a[href], a[href*="/photo/"], a[href*="/video/"]')].map(a => new URL(a.getAttribute('href'), 'https://x.com').href)};
  });
}

export function matchesSourceSnapshot(job, rendered, destinations = {}) {
  if (!rendered) return false;
  const replace = text => space(text).replace(/https?:\/\/\S+/g, url => destinations[url] || canonical(url));
  const expected = replace(job.sourceText), actual = replace(rendered.text);
  if (expected === actual) return true;
  // Only trailing URLs may become cards. An inline URL may never disappear,
  // and every omitted URL needs its own exact rendered destination evidence.
  const trailing = expected.match(/(?:\s+https?:\/\/\S+)+$/);
  if (!trailing || actual !== expected.slice(0, trailing.index)) return false;
  const attachments = new Set((rendered.attachmentUrls || []).map(url => destinations[url] || canonical(url)));
  return urls(trailing[0]).every(url => attachments.has(url));
}

export async function assertSourceSnapshot(job, container, {destinations, resolveUrl, code='source_changed'} = {}) {
  const links = destinations || await sourceDestinations(job, resolveUrl);
  if (!matchesSourceSnapshot(job, await readRenderedSource(container), links)) fail(code);
  return links;
}
