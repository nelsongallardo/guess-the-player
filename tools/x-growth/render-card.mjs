// Renders the career card PNG. Fully offline: crests are base64 data URLs
// already embedded in index.html. The player's name never appears on the card.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { playerById, clubCrestDataUrl, altText } from './lib/roster.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'templates/card.html');

export async function renderCard({ playerId, edition, out, label = 'Carrera del día' }) {
  const player = playerById(playerId);
  const clubs = player.clubs.map((c, i) => ({ name: c.name, crest: clubCrestDataUrl(player, i) }));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 675 },
      deviceScaleFactor: 2,
    });
    await page.goto('file://' + TEMPLATE);
    await page.evaluate(d => render(d), { edition, clubs, label });
    await page.waitForSelector('body[data-ready="1"]');
    await page.waitForFunction(() =>
      [...document.images].every(i => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: out });
    return { out, alt: altText(player), player };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
  const playerId = arg('--player');
  const edition = Number(arg('--edition') || 1);
  const out = arg('--out') || `/tmp/derabona-${playerId}.png`;
  if (!playerId) { console.error('usage: render-card.mjs --player <id> [--edition N] [--out path]'); process.exit(1); }
  const r = await renderCard({ playerId, edition, out });
  console.log('wrote', r.out);
  console.log('alt:', r.alt);
}
