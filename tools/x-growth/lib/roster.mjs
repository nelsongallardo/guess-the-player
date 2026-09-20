// Loads the verified roster + crest assets out of the live game's index.html.
// These two <script> blocks are the ONLY complete source: research/crests.json
// is keyed by club name and misses 164 of 242 clubs. CREST_ASSETS is keyed by
// the crest URL, and PLAYERS[].clubCrests is an array parallel-by-index to
// PLAYERS[].clubs. Verified 2026-09-20: 733/733 club slots resolve.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const REPO = process.env.DERABONA_REPO
  || path.join(process.env.HOME, 'projects/guess-the-player');

function scriptBlock(html, id) {
  const m = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!m) throw new Error(`index.html is missing the <script id="${id}"> block`);
  return m[1];
}

let cache = null;

export function loadRoster() {
  if (cache) return cache;
  const indexPath = path.join(REPO, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`no index.html at ${indexPath}`);
  const html = fs.readFileSync(indexPath, 'utf8');

  const ctx = vm.createContext({});
  vm.runInContext(scriptBlock(html, 'roster-data'), ctx);
  vm.runInContext(scriptBlock(html, 'crest-data'), ctx);
  const { PLAYERS, CREST_ASSETS } = vm.runInContext('({PLAYERS, CREST_ASSETS})', ctx);

  if (!Array.isArray(PLAYERS) || !PLAYERS.length) throw new Error('PLAYERS did not load');
  if (!CREST_ASSETS || !Object.keys(CREST_ASSETS).length) throw new Error('CREST_ASSETS did not load');

  cache = { players: PLAYERS, crests: CREST_ASSETS };
  return cache;
}

export function playerById(id) {
  const { players } = loadRoster();
  const p = players.find(x => x.id === id);
  if (!p) throw new Error(`no player with id "${id}"`);
  return p;
}

// Data URL for club index i. Throws loudly rather than rendering a hole.
export function clubCrestDataUrl(player, i) {
  const { crests } = loadRoster();
  const ref = player.clubCrests?.[i];
  if (!ref) throw new Error(`${player.id}: no clubCrests entry at index ${i}`);
  const asset = crests[ref];
  if (!asset?.dataUrl) throw new Error(`${player.id}: crest "${ref}" missing from CREST_ASSETS`);
  return asset.dataUrl;
}

// Duplicate returns are real (Milito: Genoa twice). Never dedupe.
export function careerClubs(player) {
  return player.clubs.map(c => c.name);
}

export function careerString(player, sep = ' → ') {
  return careerClubs(player).join(sep);
}

export function altText(player) {
  return `${careerClubs(player).join(', ')}, en orden cronológico. `
    + `Adiviná al futbolista; la respuesta se publica en una respuesta con spoiler.`;
}

export function verifyAllCrests() {
  const { players } = loadRoster();
  let total = 0; const missing = [];
  for (const p of players) {
    p.clubs.forEach((c, i) => {
      total++;
      try { clubCrestDataUrl(p, i); } catch { missing.push(`${p.id}[${i}] ${c.name}`); }
    });
  }
  return { total, missing };
}
