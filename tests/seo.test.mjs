import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const head = html.split('</head>')[0];
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const meta = name => {
  const tag = [...head.matchAll(/<meta\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`name="${name}"`) || t.includes(`property="${name}"`));
  return tag?.match(/content="([^"]*)"/)?.[1];
};

test('Canonical Spanish page has descriptive title and stable language', () => {
  assert.match(html, /<html lang="es">/);
  assert.match(head, /<title>derabona — Adiviná jugadores de fútbol por su carrera<\/title>/);
  assert.match(meta('description'), /Jugá gratis/);
  assert.ok(meta('description').length < 170);
  assert.match(head, /<link rel="canonical" href="https:\/\/derabona.club\/">/);
  assert.doesNotMatch(meta('robots') || '', /noindex|nofollow/);
  assert.match(html, /return 'es';\s*\n}/);
});

test('Useful visible explanation and semantic heading exist without JS', () => {
  assert.match(markup, /<h1 id="title">ADIVINÁ AL JUGADOR\. <span>DE MEMORIA\. DE RABONA\.<\/span><\/h1>/);
  assert.match(markup, /id="about-game"/);
  assert.match(markup, /Un juego gratis para adivinar jugadores de fútbol/);
  assert.match(markup, /Cómo jugar a derabona/);
  assert.match(markup, /sin crear una cuenta/);
  assert.match(markup, /Champions League/);
  assert.doesNotMatch(markup, /<meta[^>]*http-equiv="refresh"/i);
});

test('Honest structured data describes this free browser game, not fake ratings', () => {
  const data = JSON.parse(head.match(/<script type="application\/ld\+json" id="seo-data">([\s\S]*?)<\/script>/)?.[1] || 'null');
  assert.equal(data?.['@context'], 'https://schema.org');
  const graph = data['@graph'];
  const website = graph.find(item => item['@type'] === 'WebSite');
  const game = graph.find(item => item['@type'] === 'WebApplication');
  assert.equal(website.url, 'https://derabona.club/');
  assert.equal(game.applicationCategory, 'GameApplication');
  assert.equal(game.isAccessibleForFree, true);
  assert.equal(game.inLanguage, 'es-AR');
  assert.doesNotMatch(JSON.stringify(data), /aggregateRating|ratingValue|reviewCount|SearchAction/);
});

test('Robots allows crawling and sitemap includes the canonical game and leaderboard URLs', () => {
  assert.match(read('robots.txt'), /User-agent: \*/);
  assert.match(read('robots.txt'), /Allow: \//);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/derabona.club\/sitemap.xml/);
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), ['https://derabona.club/', 'https://derabona.club/leaderboard.html']);
  assert.doesNotMatch(sitemap, /lastmod|priority|changefreq/);
});

test('Search favicon is crawlable and deployed alongside sitemap and robots', () => {
  assert.match(head, /rel="icon"[^>]*href="\/favicon.svg"/);
  assert.match(read('favicon.svg'), /<svg/);
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /cp robots.txt sitemap.xml favicon.svg _site\//);
  assert.match(workflow, /node --test[^\n]*tests\/(?:seo\.test\.mjs|\*\.test\.mjs)(?:\s|$)/);
});

test('All original crest keys remain embedded PNGs, within the transfer budget', () => {
  const ctx = vm.createContext({});
  vm.runInContext(html.match(/<script id="crest-data">([\s\S]*?)<\/script>/)[1]+';this.crests=CREST_ASSETS;', ctx);
  const crests=Object.values(ctx.crests);
  assert.equal(crests.length, 208);
  let total=0;
  for (const [url, value] of Object.entries(ctx.crests)) {
    const png=Buffer.from(value.dataUrl.split(',')[1],'base64');
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(png.readUInt32BE(16)<=128 && png.readUInt32BE(20)<=128);
    assert.match(url,/^https?:\/\//);
    if (value.sourcePage) assert.match(value.sourcePage,/^https?:\/\//);
    total+=png.length;
  }
  assert.ok(total<1_200_000, `Embedded badges: ${total} bytes`);
});
