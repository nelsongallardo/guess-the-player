#!/usr/bin/env node
// Reveal reply, posted as a self-reply on the day's puzzle thread.
// Never posts an orphan reveal, never linkifies derabona.club.

import { isPaused, postedToday, recordPost } from './lib/state.mjs';
import { playerById } from './lib/roster.mjs';
import { createClient, weightedLength, containsUrl, postCost } from './lib/x-client.mjs';
import { COST } from './lib/state.mjs';

// Colour line derived ONLY from checked-in data. Never world knowledge,
// never goals/trophies/fees. Returns null when nothing safe is derivable.
export function colourLine(player) {
  const names = player.clubs.map(c => c.name);
  const counts = names.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  const returned = Object.keys(counts).filter(n => counts[n] > 1);

  if (returned.length) return `Dos etapas en ${returned[0]}, y no es un error del gráfico.`;
  if (names.length >= 12) return `${names.length} clubes. Una carrera de mapa y valija.`;
  if (names.length >= 8) return `${names.length} clubes y ninguno de casualidad.`;
  if (names.length <= 3) return `Toda la carrera en ${names.length} clubes. Cada vez menos común.`;
  // The dataset's position/country fields are English; never paste them into a
  // Spanish post. Nothing safe left to say -> say nothing.
  return null;
}

export function composeReveal(player) {
  const colour = colourLine(player);
  const parts = [`⚠️ SPOILER: ${player.name}.`];
  if (colour) parts.push(colour);
  parts.push('Más carreras en derabona.club');
  return parts.join('\n\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (isPaused()) { console.log('[SILENT]'); return; }
  if (postedToday('reveal') && !dryRun) { console.log('[SILENT]'); return; }

  const puzzle = postedToday('puzzle');
  if (!puzzle) {
    // No puzzle today means nothing to reveal. Exit clean, don't invent a thread.
    console.log('[SILENT]');
    return;
  }

  const player = playerById(puzzle.playerId);
  const text = composeReveal(player);

  if (containsUrl(text)) throw new Error('reveal must not contain a linkified URL (drop the https:// prefix)');
  if (postCost(text) !== COST.post) throw new Error(`reveal would cost $${postCost(text)}, expected $${COST.post}`);
  if (weightedLength(text) > 280) throw new Error(`reveal too long: ${weightedLength(text)}`);

  const x = createClient({ dryRun });
  const post = await x.createPost({ text, replyToId: puzzle.tweetId, priority: 2 });

  if (!dryRun) {
    recordPost({ kind: 'reveal', edition: puzzle.edition, playerId: puzzle.playerId, tweetId: post.id, text, replyTo: puzzle.tweetId });
    console.log('[SILENT]');
  } else {
    console.log('--- would reply to', puzzle.tweetId, '---');
    console.log(text);
    console.log(`--- cost $${postCost(text)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona reveal FAILED:', e.message); process.exit(1); });
}
