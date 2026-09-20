#!/usr/bin/env node
// Reveal reply on the day's Rabona Diaria thread: the answers to all three
// careers. Never posts an orphan reveal, never linkifies the site (the puzzle
// post already carries the paid link; this one stays at the $0.015 rate).

import { isPaused, postedToday, recordPost, COST } from './lib/state.mjs';
import { playerById } from './lib/roster.mjs';
import { dailyFor } from './lib/daily.mjs';
import { createClient, weightedLength, containsUrl, postCost, POST_LIMIT } from './lib/x-client.mjs';

// Colour derived ONLY from checked-in data — never world knowledge, never
// goals/trophies/fees. The dataset's position/country fields are English and
// must never be pasted into a Spanish post.
//
// Each line states a fact about the career that a player who just guessed
// would not already have from the grid. No metaphors, no closers: if there
// is nothing concrete to say, say nothing (composeReveal handles null).
export function colourLine(player) {
  const names = player.clubs.map(c => c.name);
  const counts = names.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  const returned = Object.keys(counts).filter(n => counts[n] > 1);

  if (returned.length) {
    const club = returned[0];
    return `Volvió a ${club}, por eso aparece dos veces.`;
  }
  if (names.length >= 12) return `${names.length} clubes en total.`;
  if (names.length <= 3) return `Toda la carrera en ${names.length} clubes.`;
  return null;
}

// Terminology: the answers are JUGADORES. "Tres nuevas" would agree with
// carreras and describe the clue as if it were the answer.
export function composeReveal(daily) {
  const names = daily.rounds.map(r => r.player.name);
  const colour = colourLine(daily.rounds[0].player);
  const head = `SPOILER. Rabona Diaria #${daily.challengeNumber}`;
  const list = names.map((n, i) => `${i + 1}. ${n}`).join('\n');

  const parts = [head, list];
  if (colour) parts.push(colour);
  parts.push('Mañana hay tres jugadores nuevos.');

  let text = parts.join('\n\n');
  if (weightedLength(text) > POST_LIMIT) {
    text = [head, list, 'Mañana hay tres jugadores nuevos.'].join('\n\n');
  }
  return text;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (isPaused()) { console.log('[SILENT]'); return; }
  if (postedToday('reveal') && !dryRun) { console.log('[SILENT]'); return; }

  const puzzle = postedToday('puzzle');
  if (!puzzle) { console.log('[SILENT]'); return; }   // nothing to reveal

  // Rebuild from the recorded challenge number, not from "today" — the reveal
  // runs after UTC midnight, when utcToday() has already rolled over.
  const daily = dailyFor(puzzle.date);
  if (!daily || daily.challengeNumber !== puzzle.challengeNumber) {
    throw new Error(`daily mismatch: recorded #${puzzle.challengeNumber}, recomputed #${daily?.challengeNumber}`);
  }

  const text = composeReveal(daily);
  if (containsUrl(text)) throw new Error('reveal must not contain a linkified URL');
  if (postCost(text) !== COST.post) throw new Error(`reveal would cost $${postCost(text)}, expected $${COST.post}`);
  if (weightedLength(text) > POST_LIMIT) throw new Error(`reveal too long: ${weightedLength(text)} > ${POST_LIMIT}`);

  const x = createClient({ dryRun });
  const post = await x.createPost({ text, replyToId: puzzle.tweetId, priority: 2 });

  if (!dryRun) {
    recordPost({ kind: 'reveal', challengeNumber: daily.challengeNumber, tweetId: post.id, text, replyTo: puzzle.tweetId });
    console.log('[SILENT]');
  } else {
    console.log('--- would reply to', puzzle.tweetId, '---');
    console.log(text);
    console.log(`--- cost $${postCost(text).toFixed(3)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona reveal FAILED:', e.message); process.exit(1); });
}
