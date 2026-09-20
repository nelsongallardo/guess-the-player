// Seeded, non-repeating, difficulty-mixed player queue.
// Difficulty isn't in the dataset, so it's derived deterministically —
// no LLM call, no network, same answer every run.

import { loadRoster } from './roster.mjs';
import { readState, writeState } from './state.mjs';

// xorshift32 — tiny deterministic PRNG, no dependency.
function prng(seed) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
}

// Fame proxy: a player used often as someone else's wrong answer is famous,
// because the distractor bank picks recognisable names. Fewer clubs also
// correlates with a cleaner, better-known career.
export function computeTiers(players) {
  const distractorHits = new Map();
  for (const p of players) {
    for (const name of (p.incorrectOptions || [])) {
      distractorHits.set(name, (distractorHits.get(name) || 0) + 1);
    }
  }
  const scored = players.map(p => ({
    id: p.id,
    fame: (distractorHits.get(p.name) || 0) * 10
      + (p.sources?.length || 0)
      - (p.clubs?.length || 0),
  })).sort((a, b) => b.fame - a.fame);

  const tiers = {};
  const n = scored.length;
  scored.forEach((s, i) => {
    if (i < n * 0.30) tiers[s.id] = 'easy';
    else if (i < n * 0.65) tiers[s.id] = 'medium';
    else tiers[s.id] = 'hard';
  });
  return tiers;
}

// Shuffle, then greedily reorder so each 7-day window is ~3 easy / 2 medium / 2 hard.
// "No repeats" always wins over "perfect mix" at the tail.
function mixByWeek(ids, tiers, rand) {
  const pool = { easy: [], medium: [], hard: [] };
  for (const id of ids) pool[tiers[id]].push(id);
  for (const k of Object.keys(pool)) {
    const a = pool[k];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  const want = ['easy', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard'];
  const out = [];
  while (out.length < ids.length) {
    for (const tier of want) {
      const take = pool[tier].pop()
        ?? pool.medium.pop() ?? pool.easy.pop() ?? pool.hard.pop();
      if (take) out.push(take);
      if (out.length >= ids.length) break;
    }
  }
  return out;
}

export function buildQueue(seed = 1) {
  const { players } = loadRoster();
  const tiers = computeTiers(players);
  const rand = prng(seed);
  const ids = players.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { seed, tiers, order: mixByWeek(ids, tiers, rand) };
}

export function loadQueue() {
  let q = readState('queue.json', null);
  if (!q?.order?.length) {
    q = { ...buildQueue(1), cursor: 0, edition: 0 };
    writeState('queue.json', q);
  }
  return q;
}

// Peek at the next player without consuming it. Edition never resets, even on wrap.
export function peekNext() {
  const q = loadQueue();
  if (q.cursor >= q.order.length) {
    const rebuilt = buildQueue(q.seed + 1);
    return { queue: { ...q, ...rebuilt, cursor: 0 }, playerId: rebuilt.order[0], edition: q.edition + 1 };
  }
  return { queue: q, playerId: q.order[q.cursor], edition: q.edition + 1 };
}

// Only call after a post is confirmed — never advance on a failed publish.
export function commitNext(queue) {
  writeState('queue.json', { ...queue, cursor: queue.cursor + 1, edition: queue.edition + 1 });
}
