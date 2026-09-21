// Persistent state, kill switch, and the spend ledger.
// Every entry point calls isPaused() first and canSpend() before touching the API.

import fs from 'node:fs';
import path from 'node:path';

export const STATE_DIR = process.env.DERABONA_STATE
  || path.join(process.env.HOME, '.hermes/state/derabona');

export const MONTHLY_CAP = Number(process.env.DERABONA_CAP || 6.0);

export const COST = {
  post: 0.015,
  postWithUrl: 0.20,
  read: 0.005,
  userRead: 0.010,
  media: 0.005,
};

// Priority 1 = daily puzzle, 2 = reveal, 3 = reply, 4 = scout reads.
// Reserve floors keep the daily post alive in a busy month.
const RESERVE = { 1: MONTHLY_CAP, 2: 5.80, 3: 5.40, 4: 5.00 };

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

export function statePath(name) { return path.join(STATE_DIR, name); }

export function readState(name, fallback = null) {
  ensureDir();
  const p = statePath(name);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { throw new Error(`corrupt state file ${p}: ${e.message}`); }
}

// Atomic: temp file + rename, so a crash mid-write can't leave half a JSON doc.
export function writeState(name, obj) {
  ensureDir();
  const p = statePath(name);
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
}

export function isPaused() { return fs.existsSync(statePath('PAUSE')); }

export function currentMonth() { return new Date().toISOString().slice(0, 7); }
export function today() { return new Date().toISOString().slice(0, 10); }

function ledger() {
  const l = readState('spend.json', null);
  if (!l || l.month !== currentMonth()) return { month: currentMonth(), spent: 0, entries: [] };
  return l;
}

export function spentThisMonth() { return ledger().spent; }

export function canSpend(amount, priority = 1) {
  const l = ledger();
  const after = l.spent + amount;
  if (after > MONTHLY_CAP) return { ok: false, reason: `cap $${MONTHLY_CAP} would be exceeded ($${after.toFixed(3)})` };
  const floor = RESERVE[priority] ?? MONTHLY_CAP;
  if (l.spent >= floor) return { ok: false, reason: `priority ${priority} reserved below $${floor} (spent $${l.spent.toFixed(3)})` };
  return { ok: true };
}

export function recordSpend(amount, label) {
  const l = ledger();
  l.spent = Number((l.spent + amount).toFixed(4));
  l.entries.push({ at: new Date().toISOString(), amount, label });
  if (l.entries.length > 500) l.entries = l.entries.slice(-500);
  writeState('spend.json', l);
  return l.spent;
}

// posts.json helpers — idempotency lives here. A double post is worse than a missed one.
export function loadPosts() { return readState('posts.json', []); }

export function postedToday(kind) {
  return loadPosts().find(p => p.date === today() && p.kind === kind) || null;
}

// Same-day-in-LONDON lookup, for jobs that run after UTC midnight but still
// belong to London's "today" — e.g. the 01:00 London reveal runs at UTC 00:00,
// after today() has already rolled to the next UTC date. Looks back up to two
// UTC dates to find the most recent unrevealed puzzle, so it survives the
// rollover regardless of which side of midnight the cron actually fires on.
export function mostRecentUnrevealed(posts = loadPosts()) {
  const puzzles = posts.filter(p => p.kind === 'puzzle').sort((a, b) => b.date.localeCompare(a.date));
  for (const puzzle of puzzles) {
    const alreadyRevealed = posts.some(p => p.kind === 'reveal' && p.challengeNumber === puzzle.challengeNumber);
    if (!alreadyRevealed) return puzzle;
    return null; // most recent puzzle already has its reveal; do not walk further back
  }
  return null;
}

export function recordPost(entry) {
  const posts = loadPosts();
  posts.push({ date: today(), at: new Date().toISOString(), ...entry });
  writeState('posts.json', posts);
  return entry;
}
