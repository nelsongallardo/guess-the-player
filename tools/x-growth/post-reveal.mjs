#!/usr/bin/env node
// Reveal reply on the day's Rabona Diaria thread: the answers to all three
// careers. Never posts an orphan reveal, never linkifies the site (the puzzle
// post already carries the paid link; this one stays at the $0.015 rate).

import { isPaused, postedToday, recordPost, COST } from './lib/state.mjs';
import { playerById } from './lib/roster.mjs';
import { dailyFor } from './lib/daily.mjs';
import { createClient, weightedLength, containsUrl, postCost } from './lib/x-client.mjs';

// Colour derived ONLY from checked-in data — never world knowledge, never
// goals/trophies/fees. The dataset's position/country fields are English and
// must never be pasted into a Spanish post.
export function colourLine(player) {
  const names = player.clubs.map(c => c.name);
  const counts = names.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  const returned = Object.keys(counts).filter(n => counts[n] > 1);

  if (returned.length) return `Dos etapas en ${returned[0]}, y no es un error del gráfico.`;
  if (names.length >= 12) return `${names.length} clubes. Una carrera de mapa y valija.`;
  if (names.length <= 3) return `Toda la carrera en ${names.length} clubes. Cada vez menos común.`;
  return null;
}

export function composeReveal(daily) {
  const names = daily.rounds.map(r => r.player.name);
  const colour = colourLine(daily.rounds[0].player);

  const parts = [`⚠️ SPOILER — Rabona Diaria #${daily.challengeNumber}`];
  parts.push(names.map((n, i) => `${i + 1}. ${n}`).join('\n'));
  if (colour) parts.push(colour);
  parts.push('Mañana hay tres nuevas.');

  let text = parts.join('\n\n');
  if (weightedLength(text) > 280) {
    text = [`⚠️ SPOILER — Rabona Diaria #${daily.challengeNumber}`,
      names.map((n, i) => `${i + 1}. ${n}`).join('\n'),
      'Mañana hay tres nuevas.'].join('\n\n');
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
  if (weightedLength(text) > 280) throw new Error(`reveal too long: ${weightedLength(text)}`);

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
