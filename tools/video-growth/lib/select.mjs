// Chooses a career that cannot spoil a Daily and that research fully supports.
// Exclusion windows are pilot policy (plan §3), not game behaviour.

import { sha256 } from './manifest.mjs';
import { dailyIds, crestSha256 } from './source.mjs';

export const DAILY_LOOKAHEAD_DAYS = 14;
export const REUSE_DAYS = 30;
export const MIN_CLUBS = 3;
export const MAX_CLUBS = 8;

const DAY_MS = 86400000;
const dateOf = iso => iso.slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function excludedDailyIds(snapshot, { fromDate, toDate }) {
  const ids = new Set();
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) for (const id of dailyIds(snapshot, d)) ids.add(id);
  return ids;
}

// Today through 14 days after the latest planned publication.
export function exclusionWindow({ nowUtc, publishAtUtc }) {
  const last = [publishAtUtc].flat().map(dateOf).sort().at(-1);
  return { fromDate: dateOf(nowUtc), toDate: addDays(last > dateOf(nowUtc) ? last : dateOf(nowUtc), DAILY_LOOKAHEAD_DAYS) };
}

const sameClubs = (a, b) => a.length === b.length && a.every((c, i) => c.name === b[i]?.name);

// Ordered career with research evidence and crest hashes. Repeat spells stay.
export function careerFor(snapshot, playerId) {
  const player = snapshot.players.find(p => p.id === playerId);
  if (!player) throw new Error(`no player ${playerId} in snapshot`);
  const record = snapshot.research.get(playerId);
  if (!record) throw new Error(`${playerId}: no research record`);
  if (record.name !== player.name) throw new Error(`${playerId}: research name differs from roster`);
  if (!sameClubs(player.clubs, record.clubs ?? [])) throw new Error(`${playerId}: research club order differs from roster`);
  const sources = (record.sources ?? []).map(s => s?.url).filter(u => typeof u === 'string' && /^https:\/\//.test(u));
  if (!sources.length) throw new Error(`${playerId}: research record has no https source`);
  return {
    playerId,
    name: player.name,
    clubs: player.clubs.map((c, i) => ({ name: c.name, crestSha256: crestSha256(snapshot, player, i) })),
    evidenceSources: sources,
  };
}

function recentlyUsed(playerId, publishAtUtc, recentUses) {
  const at = Date.parse(publishAtUtc);
  return recentUses.some(u => u.playerId === playerId && Math.abs(Date.parse(u.publishAtUtc) - at) < REUSE_DAYS * DAY_MS);
}

export function selectCareer(snapshot, { nowUtc, publishAtUtc, recentUses = [], seed, minClubs = MIN_CLUBS, maxClubs = MAX_CLUBS }) {
  if (typeof seed !== 'string' || !seed) throw new Error('selectCareer needs an explicit seed');
  const excluded = excludedDailyIds(snapshot, exclusionWindow({ nowUtc, publishAtUtc }));
  const ranked = snapshot.players
    .filter(p => !excluded.has(p.id) && p.clubs.length >= minClubs && p.clubs.length <= maxClubs && !recentlyUsed(p.id, publishAtUtc, recentUses))
    .map(p => ({ p, rank: sha256(`${seed}:${p.id}`) }))
    .sort((a, b) => a.rank.localeCompare(b.rank));
  for (const { p } of ranked) {
    try { return careerFor(snapshot, p.id); } catch { /* unsupported by evidence or crest: skip */ }
  }
  throw new Error('no eligible career for this window');
}

// Re-check a prepared job against a fresh snapshot right before any write.
export function stillValid(job, snapshot, { nowUtc }) {
  const errors = [];
  if (job.source.rosterSha256 !== snapshot.hashes.rosterSha256) errors.push('roster changed since the job was prepared');
  if (job.source.scheduleSha256 !== snapshot.hashes.scheduleSha256) errors.push('Daily schedule changed since the job was prepared');
  const window = exclusionWindow({ nowUtc, publishAtUtc: job.targets.map(t => t.publishAtUtc) });
  if (excludedDailyIds(snapshot, window).has(job.career.playerId)) errors.push(`career is a Daily answer between ${window.fromDate} and ${window.toDate}`);
  return errors;
}
