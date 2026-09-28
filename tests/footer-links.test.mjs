import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

for (const name of ['index.html', 'leaderboard.html']) {
  test(`${name} footer exposes real about, privacy, contact and X destinations`, () => {
    const html = read(name);
    const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer, 'footer exists');
    assert.match(footer, /href="(?:index\.html)?#about-game"/);
    assert.match(footer, /href="privacy.html"/);
    assert.match(footer, /href="mailto:contact@derabona\.club"/);
    assert.match(footer, /href="https:\/\/x\.com\/derabona_club"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });
}

test('home explains the game in the existing crawlable about section instead of a redundant page', () => {
  assert.match(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''), /<section id="about-game"[\s\S]*?<h2 id="about-title">Un juego gratis para adivinar jugadores de fútbol/);
});

test('footer navigation has bilingual labels even without JavaScript', () => {
  const home = read('index.html');
  const board = read('leaderboard.html');
  const homeFooter = home.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
  const boardFooter = board.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert.match(homeFooter, /id="footer-about"[^>]*>Sobre el juego<\/a>/);
  assert.match(home, /footerAbout:'About the game'/);
  assert.match(boardFooter, /id="footer-about"[^>]*>Sobre el juego<\/a>/);
  assert.match(board, /footerAbout:'About the game'/);
  assert.match(board, /footerPhrase:'Football with friends'/);
  assert.match(board, /id="footer-phrase">fútbol entre amigos/);
});

for (const name of ['index.html', 'leaderboard.html']) {
  test(`${name} has a distinct brand/navigation row and an identifiable X profile`, () => {
    const footer = read(name).match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
    assert.match(footer, /class="footer-main"[\s\S]*?class="footer-identity"[\s\S]*?class="footer-links"/);
    assert.match(footer, /href="https:\/\/x\.com\/derabona_club"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>[\s\S]*?<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<path\b[^>]*d="[^"]+"[^>]*\/>[\s\S]*?<\/svg>[\s\S]*?@derabona_club[\s\S]*?<\/a>/);
    assert.doesNotMatch(footer, /X ↗/);
  });
}

test('game footer separates guest controls from site navigation without breaking live IDs', () => {
  const html = read('index.html');
  const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert.match(footer, /class="footer-utilities"[\s\S]*?id="save-status"[\s\S]*?id="help"[\s\S]*?id="reset-progress"[\s\S]*?id="analytics-settings"/);
  assert.doesNotMatch(footer.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0], /<button|save-status/);
  assert.match(html, /\$\('footer-roster'\)\.innerHTML=t\.footer/);
});
