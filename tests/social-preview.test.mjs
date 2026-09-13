import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.split('</head>')[0];
const tags = [...head.matchAll(/<meta\s+[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
const meta = key => {
  const found = tags.filter(tag => tag.property === key || tag.name === key);
  assert.equal(found.length, 1, `Exactly one static ${key}`);
  return found[0].content;
};
const image = 'https://derabona.club/assets/derabona-social-es-v1.png';

test('Spanish link metadata is available without executing JavaScript', () => {
  assert.equal(meta('og:title'), 'derabona — Adiviná al jugador');
  assert.match(meta('og:description'), /Adiviná al jugador por su carrera/);
  assert.equal(meta('og:locale'), 'es_AR');
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('og:site_name'), 'derabona');
  assert.equal(meta('og:url'), 'https://derabona.club/');
  assert.match(head, /<link rel="canonical" href="https:\/\/derabona\.club\/">/);
});

test('Open Graph and Twitter share the hosted PNG and Spanish copy', () => {
  assert.equal(meta('og:image'), image);
  assert.equal(meta('og:image:secure_url'), image);
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.match(meta('og:image:alt'), /Logo de derabona/);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:image'), image);
  assert.equal(meta('twitter:title'), meta('og:title'));
  assert.equal(meta('twitter:description'), meta('og:description'));
  assert.equal(meta('twitter:image:alt'), meta('og:image:alt'));
});

test('Share image is a real 1200 × 630 PNG under 1 MB', () => {
  const png = readFileSync(new URL('../assets/derabona-social-es-v1.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 1_000_000);
});

test('Pages deploys the preview asset and checks this contract', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /mkdir -p _site\/assets/);
  assert.match(workflow, /cp assets\/derabona-social-es-v1\.png _site\/assets\//);
  assert.match(workflow, /node --test[^\n]*tests\/social-preview\.test\.mjs/);
});
