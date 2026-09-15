import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const desktop = css.match(/@media\(min-width:801px\)\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('desktop two-row timeline connects each bottom card diagonally to the next top card', () => {
  assert.match(desktop, /\.club:nth-child\(odd\):not\(:last-child\):after\{content:"↓"/);
  assert.match(
    desktop,
    /\.club:nth-child\(even\):not\(:last-child\):after\{content:"↗";top:-\d+px;right:-\d+px;bottom:auto;left:auto/,
    'the connector after a bottom-row card must point up-right to the next chronological top-row card'
  );
});

test('mobile keeps left-to-right row connectors rather than desktop pair routing', () => {
  const mobile = css.match(/@media\(max-width:800px\)\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(mobile, /\.club:not\(:last-child\):after\{top:18px;right:-12px/);
  assert.match(mobile, /\.club:nth-child\(4n\):after\{content:none\}/);
  assert.doesNotMatch(mobile, /content:"↗"/);
});
