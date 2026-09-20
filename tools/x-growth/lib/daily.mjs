// Today's real Rabona Diaria, computed exactly like the game does.
//
// The game embeds a frozen 220-slot schedule (DAILY_SCHEDULE_V1) and derives
// each day's three rounds deterministically from a UTC epoch. We recompute the
// same thing rather than inventing a parallel queue, so the post always matches
// what a player actually sees on the site that day.
//
// Game source (index.html, ~line 75433):
//   const EPOCH_DAY = Date.UTC(2026,8,17)/86400000;
//   const challengeNumber = day - EPOCH_DAY + 1;
//   const start = ((challengeNumber-1)*3) % DAILY_SCHEDULE_V1.length;
//   descriptors = [0,1,2].map(o => SCHEDULE[(start+o) % length]);

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO, playerById } from './roster.mjs';

export const EPOCH_DAY = Date.UTC(2026, 8, 17) / 86400000; // 2026-09-17 UTC

let scheduleCache = null;

export function loadSchedule() {
  if (scheduleCache) return scheduleCache;
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const m = html.match(/const DAILY_SCHEDULE_V1\s*=\s*dailyDeepFreeze\(([\s\S]*?)\);\n/);
  if (!m) throw new Error('could not find DAILY_SCHEDULE_V1 in index.html');
  const ctx = vm.createContext({});
  scheduleCache = vm.runInContext(m[1], ctx);
  if (!Array.isArray(scheduleCache) || !scheduleCache.length) throw new Error('daily schedule did not parse');
  return scheduleCache;
}

// UTC day number for a YYYY-MM-DD string, matching the game's parseDate.
export function dayNumber(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d) / 86400000;
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Returns { date, challengeNumber, rounds: [{ playerId, player }] } or null
// if the date precedes the epoch.
export function dailyFor(dateStr = utcToday()) {
  const schedule = loadSchedule();
  const day = dayNumber(dateStr);
  if (!Number.isFinite(day) || day < EPOCH_DAY) return null;

  const challengeNumber = day - EPOCH_DAY + 1;
  const start = ((challengeNumber - 1) * 3) % schedule.length;
  const rounds = [0, 1, 2].map(offset => {
    const slot = schedule[(start + offset) % schedule.length];
    return { playerId: slot.playerId, player: playerById(slot.playerId) };
  });

  return { date: dateStr, challengeNumber, rounds };
}
