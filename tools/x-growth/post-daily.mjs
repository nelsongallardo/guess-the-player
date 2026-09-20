#!/usr/bin/env node
// Daily puzzle post. Idempotent: re-running on the same day is a no-op.
// A double post is worse than a missed one.

import os from 'node:os';
import path from 'node:path';
import { isPaused, postedToday, recordPost, today } from './lib/state.mjs';
import { peekNext, commitNext } from './lib/queue.mjs';
import { playerById, careerString, altText } from './lib/roster.mjs';
import { renderCard } from './render-card.mjs';
import { createClient, weightedLength, containsUrl } from './lib/x-client.mjs';

export function composeText(player, edition) {
  const header = `Carrera del día #${edition}`;
  const ask = '¿Quién es? Sin Google 👀';
  const full = `${header}\n\n${careerString(player)}\n\n${ask}`;
  if (weightedLength(full) <= 280) return full;
  // Long career: the card already shows every club, so drop the text list
  // rather than truncating mid-club and inventing a career that never happened.
  return `${header}\n\nMirá la carrera completa 👇\n\n${ask}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (isPaused()) { console.log('[SILENT]'); return; }

  const already = postedToday('puzzle');
  if (already && !dryRun) {
    console.log('[SILENT]');
    return;
  }

  const { queue, playerId, edition } = peekNext();
  const player = playerById(playerId);
  const text = composeText(player, edition);

  if (containsUrl(text)) throw new Error('daily puzzle must never contain a URL');
  if (weightedLength(text) > 280) throw new Error(`text too long: ${weightedLength(text)}`);

  const out = path.join(os.tmpdir(), `derabona-card-${today()}.png`);
  const { alt } = await renderCard({ playerId, edition, out });

  const x = createClient({ dryRun });
  const mediaId = await x.uploadMedia(out, alt);
  const post = await x.createPost({ text, mediaIds: [mediaId], priority: 1 });

  if (!post?.id) throw new Error('no tweet id returned — not advancing the queue');

  if (!dryRun) {
    commitNext(queue);
    recordPost({ kind: 'puzzle', edition, playerId, tweetId: post.id, text });
  }

  if (dryRun) {
    console.log('--- would post ---');
    console.log(text);
    console.log('--- alt ---');
    console.log(alt);
    console.log(`--- player: ${player.name} (${playerId}), edition ${edition}, card ${out}`);
  } else {
    console.log('[SILENT]');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona daily puzzle FAILED:', e.message); process.exit(1); });
}
