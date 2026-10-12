// Immutable source snapshot. Reads the game and research files from one git
// commit (never the working tree), so a job is bound to exact bytes. The
// parsing mirrors tools/x-growth/lib/{roster,daily}.mjs, which are bound to a
// process-wide DERABONA_REPO and cache; test/source.test.mjs checks Daily parity.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { sha256 } from './manifest.mjs';

function scriptBlock(html, id) {
  const m = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!m) throw new Error(`index.html is missing the <script id="${id}"> block`);
  return m[1];
}

function scheduleParts(html) {
  const daily = scriptBlock(html, 'daily-challenge');
  const sched = daily.match(/const DAILY_SCHEDULE_V1\s*=\s*dailyDeepFreeze\(([\s\S]*?)\);\n/);
  const epoch = daily.match(/const EPOCH_DAY=([^;]+);/);
  if (!sched || !epoch) throw new Error('could not find DAILY_SCHEDULE_V1/EPOCH_DAY in the daily-challenge block');
  return { literal: sched[1], epochExpr: epoch[1] };
}

export function fingerprints(html) {
  const { literal, epochExpr } = scheduleParts(html);
  return {
    rosterSha256: sha256(scriptBlock(html, 'roster-data')),
    scheduleSha256: sha256(`${literal}\n${epochExpr}`),
  };
}

export function parseSnapshot({ commit, indexHtml, researchJson }) {
  const ctx = vm.createContext({});
  vm.runInContext(scriptBlock(indexHtml, 'roster-data'), ctx);
  vm.runInContext(scriptBlock(indexHtml, 'crest-data'), ctx);
  const { PLAYERS, CREST_ASSETS } = vm.runInContext('({PLAYERS, CREST_ASSETS})', ctx);
  if (!Array.isArray(PLAYERS) || !PLAYERS.length) throw new Error('PLAYERS did not load');

  const { literal, epochExpr } = scheduleParts(indexHtml);
  const schedule = vm.runInContext(literal, vm.createContext({}));
  const epochDay = vm.runInContext(epochExpr, vm.createContext({}));
  if (!Array.isArray(schedule) || !schedule.length || !Number.isInteger(epochDay)) throw new Error('daily schedule did not parse');

  const research = new Map(JSON.parse(researchJson).map(r => [r.id, r]));
  return Object.freeze({
    commit, players: PLAYERS, crests: CREST_ASSETS, schedule, epochDay, research,
    hashes: Object.freeze({
      indexSha256: sha256(indexHtml),
      ...fingerprints(indexHtml),
      researchSha256: sha256(researchJson),
    }),
  });
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function readSnapshot({ repo, commit }) {
  let resolved;
  try { resolved = git(repo, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]).trim(); }
  catch { throw new Error(`source commit ${commit} not found in ${repo}`); }
  return parseSnapshot({
    commit: resolved,
    indexHtml: git(repo, ['show', `${resolved}:index.html`]),
    researchJson: git(repo, ['show', `${resolved}:research/verified-players.json`]),
  });
}

const dayNumber = dateStr => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// The three Daily answer IDs for a UTC date, computed exactly like the game.
export function dailyIds(snapshot, dateStr) {
  const day = dayNumber(dateStr);
  if (!Number.isFinite(day) || day < snapshot.epochDay) return [];
  const n = snapshot.schedule.length;
  const start = ((day - snapshot.epochDay) * 3) % n;
  return [0, 1, 2].map(o => snapshot.schedule[(start + o) % n].playerId);
}

export function crestSha256(snapshot, player, i) {
  const ref = player.clubCrests?.[i];
  const dataUrl = ref && snapshot.crests[ref]?.dataUrl;
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error(`${player.id}: crest for club ${i} (${player.clubs[i]?.name}) is missing`);
  return sha256(Buffer.from(m[1], 'base64'));
}

// Compare the live public page with the snapshot. Any difference needs review.
export function compareLive(snapshot, liveHtml) {
  let live;
  try { live = fingerprints(liveHtml); } catch { return { rosterMatches: false, scheduleMatches: false, ok: false }; }
  const rosterMatches = live.rosterSha256 === snapshot.hashes.rosterSha256;
  const scheduleMatches = live.scheduleSha256 === snapshot.hashes.scheduleSha256;
  return { rosterMatches, scheduleMatches, ok: rosterMatches && scheduleMatches };
}

// Read-only GET of the public site. Only the canonical origin is allowed.
export async function fetchLiveHtml({ fetchImpl = globalThis.fetch, url = 'https://derabona.club/' } = {}) {
  if (new URL(url).origin !== 'https://derabona.club') throw new Error('live source must be https://derabona.club');
  const res = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (res.status !== 200) throw new Error(`live site returned HTTP ${res.status}`);
  return res.text();
}
