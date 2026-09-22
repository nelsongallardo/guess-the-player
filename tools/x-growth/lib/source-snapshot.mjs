// Source identity is checked by the caller. This is deliberately a permissive
// wording check, not an exact snapshot or attachment-integrity check.
export const MIN_SOURCE_WORD_SIMILARITY = 0.4;
const fail = code => { throw Object.assign(new Error(code), {code}); };

export async function readRenderedSource(container) {
  return container.evaluate(el => {
    // Quoted posts have their own tweetText inside a clickable card: role=link
    // on detail, button in the composer. Never combine it with the parent text
    // or select it as a fallback when the actual source text is absent.
    const primary = element => {
      for (let node = element.parentElement; node && node !== el; node = node.parentElement) {
        if (node.matches('a, button, [role="link"], [role="button"], [data-testid="card.wrapper"]')) return false;
      }
      return true;
    };
    const texts = [...el.querySelectorAll('[data-testid="tweetText"]')].filter(primary);
    if (texts.length !== 1) return null;
    const copy = texts[0].cloneNode(true);
    for (const a of copy.querySelectorAll('a')) {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//.test(href)) a.replaceWith(href);
    }
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
    const links = [...el.querySelectorAll('a[href]')]
      .filter(a => primary(a) && !a.closest('[data-testid="tweetText"]'))
      .map(a => a.getAttribute('href'));
    return {
      text:copy.textContent,
      permalinks:[...new Set(links.filter(href => /^\/[A-Za-z0-9_]+\/status\/\d+$/.test(href)))],
      authors:[...new Set(links.filter(href => /^\/[A-Za-z0-9_]+$/.test(href)).map(href => href.slice(1).toLowerCase()))],
    };
  });
}

function words(text, links = []) {
  let body = String(text || '');
  // Dialogs can render API URL entities as non-anchor, truncated labels.
  for (const link of links) {
    for (const value of [link.url, link.expanded_url, link.display_url]) {
      if (value) body = body.split(value).join(' ');
    }
  }
  body = body.replace(/https?:\/\/\S+|\b(?:pic\.)?(?:x\.com|twitter\.com|t\.co)\/\S+/gi, ' ');
  return body.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

export function compareSourceSnapshot(job, rendered) {
  if (!rendered || typeof rendered.text !== 'string') return {matches:false, reason:'source_unreadable'};
  const expected = words(job.sourceText, job.sourceLinks);
  const actual = words(rendered.text, job.sourceLinks);
  // A failed/empty read is not evidence that the author changed the post.
  if (!expected.length || !actual.length) return {matches:false, reason:'source_unreadable'};
  const remaining = new Map();
  for (const word of expected) remaining.set(word, (remaining.get(word) || 0) + 1);
  let shared = 0;
  for (const word of actual) {
    const count = remaining.get(word) || 0;
    if (count) { shared++; remaining.set(word, count - 1); }
  }
  // Multiset Dice overlap: tolerant of edits/reordering, symmetric so an old
  // sentence inside a substantially replaced post cannot match by containment.
  const similarity = 2 * shared / (expected.length + actual.length);
  const matches = similarity >= MIN_SOURCE_WORD_SIMILARITY;
  return {matches, reason:matches ? 'similar_source' : 'source_changed', similarity};
}

export function matchesSourceSnapshot(job, rendered) {
  return compareSourceSnapshot(job, rendered).matches;
}

export async function assertSourceSnapshot(job, container, {code='source_changed', composer=false} = {}) {
  const rendered = await readRenderedSource(container);
  if (rendered) {
    const expected = `/${job.sourceHandle}/status/${job.sourceId}`.toLowerCase();
    const identityMatches = composer
      ? rendered.authors.includes(job.sourceHandle.toLowerCase())
      : rendered.permalinks.length === 1 && rendered.permalinks[0].toLowerCase() === expected;
    if (!identityMatches) fail(code === 'source_changed' ? 'source_identity_mismatch' : code);
  }
  const result = compareSourceSnapshot(job, rendered);
  if (!result.matches) fail(code === 'source_changed' ? result.reason : code);
  return result;
}
