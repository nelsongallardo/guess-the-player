import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const desktop = css.match(/@media\(min-width:801px\)\{([\s\S]*?)\n\}/)?.[1] ?? '';
const mobile = css.match(/@media\(max-width:800px\)\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('shared arrow suppression is row-major, not the old column-major zigzag', () => {
  assert.match(css, /\.club:nth-child\(4n\):after\{content:none\}/, 'every fourth card (a row/page end) never gets a connector, at any width');
  assert.doesNotMatch(css, /content:"↓"/, 'the diagonal down connector from the column-major attempt is gone');
  assert.doesNotMatch(css, /content:"↗"/, 'the diagonal up-right connector from the column-major attempt is gone');
  assert.doesNotMatch(css, /grid-auto-flow:column/, 'no grid still fills column-major');
});

test('desktop groups clubs into real two-row pages laid out side by side', () => {
  assert.match(desktop, /\.timeline\{display:flex;/, 'pages sit in a row');
  assert.match(desktop, /\.timeline-page\{display:grid;grid-template-columns:repeat\(4,150px\);grid-template-rows:repeat\(2,auto\)/, 'each page is its own four-column, two-row grid');
  assert.match(desktop, /overflow-x:auto/, 'a real scrollbar reaches whatever does not fit in the first page');
});

test('mobile makes the page grouping invisible to layout, unchanged from ADR 0016', () => {
  assert.match(mobile, /\.timeline-page\{display:contents\}/, 'pages are a DOM-only convenience on mobile, not a visual boundary');
  assert.match(mobile, /\.timeline\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, 'one continuous four-column grid, same as before pages existed');
  assert.match(mobile, /\.club:not\(:last-child\):after\{top:18px;right:-12px/, 'mobile keeps its own smaller connector sizing');
});

test('renderCareer groups clubs into pages of eight in the DOM', () => {
  const gameUi = html.match(/<script id="game-ui">([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.match(gameUi, /index%8===0/, 'a new .timeline-page starts every eight clubs');
  assert.match(gameUi, /el\('div',undefined,'timeline-page'\)/, 'the page wrapper is a plain div appended to #timeline');
});
