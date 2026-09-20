// Layout guard: the card must never overflow 1200x675, and no club label may clip.
import path from 'node:path';
import { chromium } from 'playwright';
import { playerById, clubCrestDataUrl } from '../lib/roster.mjs';

const TEMPLATE = path.join(process.env.HOME, 'projects/guess-the-player/tools/x-growth/templates/card.html');

async function check(browser, playerId, edition) {
  const p = playerById(playerId);
  const clubs = p.clubs.map((c, i) => ({ name: c.name, crest: clubCrestDataUrl(p, i) }));
  const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
  await page.goto('file://' + TEMPLATE);
  await page.evaluate(d => render(d), { edition, clubs });
  await page.waitForSelector('body[data-ready="1"]');
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));

  const r = await page.evaluate(() => {
    const grid = document.getElementById('grid');
    const names = [...document.querySelectorAll('.name')];
    return {
      overflowX: document.body.scrollWidth > 1200,
      overflowY: document.body.scrollHeight > 675,
      gridBottom: Math.round(grid.getBoundingClientRect().bottom),
      footTop: Math.round(document.querySelector('.foot').getBoundingClientRect().top),
      clippedNames: names.filter(n => n.scrollHeight > n.clientHeight + 1).map(n => n.textContent),
      imagesLoaded: [...document.images].every(i => i.naturalWidth > 0),
      nameCount: names.length,
    };
  });
  await page.close();
  return { playerId, clubs: clubs.length, ...r };
}

const browser = await chromium.launch();
const cases = ['diego-milito', 'paulo-da-silva', 'cristiano-ronaldo'];
let failed = 0;
for (const id of cases) {
  const r = await check(browser, id, 1);
  const ok = !r.overflowX && !r.overflowY && r.imagesLoaded
    && r.clippedNames.length === 0 && r.gridBottom <= r.footTop;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.playerId} (${r.clubs} clubs) `
    + `overflow=${r.overflowX || r.overflowY} images=${r.imagesLoaded} `
    + `clipped=${r.clippedNames.length} gridBottom=${r.gridBottom} footTop=${r.footTop}`);
  if (r.clippedNames.length) console.log('   clipped:', r.clippedNames.join(', '));
}
await browser.close();
process.exit(failed ? 1 : 0);
