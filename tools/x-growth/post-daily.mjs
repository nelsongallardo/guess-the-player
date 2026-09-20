#!/usr/bin/env node
// Daily post for the REAL Rabona Diaria — the same three careers every player
// gets on the site today, recomputed from the game's frozen schedule.
//
// Idempotent: re-running on the same day is a no-op.
//
// LINK POLICY (this is a money decision, see README):
//   X charges $0.015 per post, but $0.200 if the post contains a URL — 13x.
//   A real https:// link every day costs 30 x $0.205 = $6.15/month in posts
//   alone, which blows the entire $6 cap before a single reply is sent.
//   So: a full link on LINK_DAYS only (default Sunday), and a bare-domain
//   mention the rest of the week. X auto-links bare domains in the rendered
//   post, so the route to the game survives either way.
//
//   NOTE: whether X's billing treats a bare "derabona.club" as a URL is NOT
//   documented. We assume it does not, and assert the expected cost before
//   posting; the first real invoice must be checked against spend.json.

import os from 'node:os';
import path from 'node:path';
import { isPaused, postedToday, recordPost, today, COST } from './lib/state.mjs';
import { dailyFor, utcToday } from './lib/daily.mjs';
import { careerString, altText } from './lib/roster.mjs';
import { renderCard } from './render-card.mjs';
import { createClient, weightedLength, containsUrl, postCost, POST_LIMIT } from './lib/x-client.mjs';

export const SITE_URL = 'https://derabona.club/';
export const SITE_BARE = 'derabona.club';

// 0 = Sunday. Days on which we pay for a real link.
export const LINK_DAYS = (process.env.DERABONA_LINK_DAYS || '0')
  .split(',').map(n => Number(n.trim())).filter(Number.isFinite);

export function wantsLink(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return LINK_DAYS.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

// Terminology, taken from the game itself (index.html, commit 98c3a5a):
//   "Los mismos tres jugadores para todos hoy"
//   "Adiviná jugadores de fútbol por su carrera"
// You guess a JUGADOR. The carrera is the clue, and it is singular. Never
// count the puzzle in "carreras" — an earlier version said "3 carreras",
// which describes the clue as though it were the answer.
export function composeText(daily, withLink) {
  const first = daily.rounds[0].player;
  const header = `Rabona Diaria #${daily.challengeNumber}`;
  const tail = withLink
    ? `¿Quién es?\n${SITE_URL}`
    : `¿Quién es? Los tres están en ${SITE_BARE}`;

  const full = `${header}\n\nLos mismos tres jugadores para todos hoy. Este es el primero:\n\n${careerString(first)}\n\n${tail}`;
  if (weightedLength(full) <= POST_LIMIT) return full;
  // Long career: the card shows every club. Drop the text list rather than
  // truncating mid-club and implying a career that never happened.
  return `${header}\n\nLos mismos tres jugadores para todos hoy. El primero está en la imagen.\n\n${tail}`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (isPaused()) { console.log('[SILENT]'); return; }
  if (postedToday('puzzle') && !dryRun) { console.log('[SILENT]'); return; }

  const date = utcToday();
  const daily = dailyFor(date);
  if (!daily) throw new Error(`no daily challenge defined for ${date}`);

  const withLink = wantsLink(date);
  const first = daily.rounds[0];
  const text = composeText(daily, withLink);

  if (weightedLength(text) > POST_LIMIT) throw new Error(`text too long: ${weightedLength(text)} > ${POST_LIMIT}`);
  if (text.includes(first.player.name)) throw new Error('post leaks the answer');

  const expected = withLink ? COST.postWithUrl : COST.post;
  if (postCost(text) !== expected) {
    throw new Error(`cost mismatch: computed $${postCost(text)}, expected $${expected} (withLink=${withLink})`);
  }
  if (withLink !== containsUrl(text)) throw new Error('link policy and post content disagree');

  const out = path.join(os.tmpdir(), `derabona-card-${today()}.png`);
  const { alt } = await renderCard({
    playerId: first.playerId,
    edition: daily.challengeNumber,
    label: 'Rabona Diaria',
    out,
  });

  const x = createClient({ dryRun });
  const mediaId = await x.uploadMedia(out, alt);
  const post = await x.createPost({ text, mediaIds: [mediaId], priority: 1 });
  if (!post?.id) throw new Error('no tweet id returned');

  if (!dryRun) {
    recordPost({
      kind: 'puzzle',
      challengeNumber: daily.challengeNumber,
      playerId: first.playerId,
      allPlayerIds: daily.rounds.map(r => r.playerId),
      tweetId: post.id,
      text,
      withLink,
    });
    console.log('[SILENT]');
  } else {
    console.log(`--- would post (${withLink ? 'LINK day' : 'bare-domain day'}) ---`);
    console.log(text);
    console.log('--- alt ---');
    console.log(alt);
    console.log(`--- #${daily.challengeNumber}: ${daily.rounds.map(r => r.player.name).join(' | ')}`);
    console.log(`--- cost $${postCost(text).toFixed(3)}, card ${out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona daily puzzle FAILED:', e.message); process.exit(1); });
}
