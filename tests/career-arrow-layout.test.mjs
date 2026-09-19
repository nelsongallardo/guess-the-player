import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

// Brace-matched extraction. A lazy /\{([\s\S]*?)\n\}/ regex silently spans
// several media queries at once (it captured 5.9kB across three blocks here),
// which made assertions pass against rules from a block they weren't testing.
const mediaBlocks = header => {
  const out = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(header, from);
    if (start === -1) return out;
    let i = start + header.length, depth = 1;
    for (; depth && i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(start + header.length, i - 1));
    from = i;
  }
};
// index.html has several max-width:800px blocks; the career grid lives in the
// one that redefines .timeline as a grid.
const mobile = mediaBlocks('@media(max-width:800px){').find(block => block.includes('.timeline{display:grid')) ?? '';
const desktop = mediaBlocks('@media(min-width:801px){')[0] ?? '';
const baseCss = mediaBlocks('@media(max-width:800px){').concat(mediaBlocks('@media(min-width:801px){'))
  .reduce((acc, block) => acc.replace(block, ''), css);

test('the extractor really isolates one block', () => {
  assert.ok(mobile && mobile.length < 2000, 'mobile block is a single media query, not several concatenated');
  assert.ok(desktop && desktop.length < 2000, 'desktop block is a single media query');
  assert.match(mobile, /\.timeline\{display:grid/, 'mobile block is the career-grid one');
});

test('connectors are row-major, never the old column-major zigzag', () => {
  assert.doesNotMatch(css, /content:"↓"/, 'the diagonal down connector from the column-major attempt is gone');
  assert.doesNotMatch(css, /content:"↗"/, 'the diagonal up-right connector from the column-major attempt is gone');
  assert.doesNotMatch(css, /grid-auto-flow:column/, 'no grid still fills column-major');
});

test('arrow suppression matches each grid\'s own column count', () => {
  // A connector at a wrapped row end would point off the right edge at a card
  // that actually sits below-left. Each grid therefore suppresses on its own
  // column count - and never globally, which would also hit mid-row cards.
  assert.doesNotMatch(baseCss, /\.club:nth-child\(\d+n\):after\{content:none\}/, 'no column-count rule applies at every width');
  assert.match(mobile, /\.club:nth-child\(4n\):after\{content:none\}/, 'mobile wraps every 4 cards');
  assert.match(desktop, /\.club:nth-child\(6n\):after\{content:none\}/, 'desktop wraps every 6 cards');
});

test('desktop wraps in plain reading order instead of scrolling sideways', () => {
  // ADR 0021: a fixed six-column grid means visual order is always
  // chronological order, and the whole career is visible without scrolling.
  assert.match(desktop, /\.timeline\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/, 'six equal columns that flex with the panel');
  assert.doesNotMatch(desktop, /grid-template-rows:repeat\(2,auto\)/, 'no two-row page grid: that is what let card 9 sit visually beside card 4');
  assert.doesNotMatch(desktop, /\.timeline-page\{display:grid/, 'pages are no longer a desktop layout unit');
  assert.doesNotMatch(desktop, /overflow-x:auto/, 'no horizontal scrollbar: every club is reachable without one');
});

test('the long-career compaction is desktop-only', () => {
  // renderCareer() sets .timeline-long from the club count at every width, so
  // the styling must be scoped, or it would shrink mobile cards too - mobile
  // has vertical room and is meant to stay pixel-identical to ADR 0016.
  const totalRules = (css.match(/\.timeline-long/g) ?? []).length;
  const desktopRules = (desktop.match(/\.timeline-long/g) ?? []).length;
  assert.ok(totalRules > 0, 'compaction rules exist');
  assert.equal(desktopRules, totalRules, 'every .timeline-long rule lives inside the desktop media query');
  assert.doesNotMatch(mobile, /\.timeline-long/, 'mobile never compacts');
});

test('mobile keeps its continuous four-column wrapping grid', () => {
  assert.match(mobile, /\.timeline\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, 'one continuous four-column grid, unchanged from ADR 0016');
  assert.match(mobile, /\.club:not\(:last-child\):after\{top:18px;right:-12px/, 'mobile keeps its own smaller connector sizing');
});

test('renderCareer emits one flat chronological list, with no page wrappers', () => {
  const gameUi = html.match(/<script id="game-ui">([\s\S]*?)<\/script>/)?.[1] ?? '';
  const renderCareer = gameUi.match(/function renderCareer\(player\)\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.ok(renderCareer, 'renderCareer exists');
  assert.doesNotMatch(renderCareer, /index%8===0/, 'no eight-club paging');
  assert.doesNotMatch(renderCareer, /timeline-page/, 'no page wrapper element');
  // A flat list is what makes :last-child and nth-child mean "the career"
  // rather than "this page" - the mismatch that produced the bug.
  assert.match(renderCareer, /\$\('timeline'\)\.append\(card\)/, 'cards append straight to #timeline');
});
