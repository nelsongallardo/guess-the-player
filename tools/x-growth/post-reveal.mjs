#!/usr/bin/env node
// Reveal reply on the day's Rabona Diaria thread.
//
// Reveals ONLY the player whose career the card showed. The daily has three
// rounds, but the post shows one grid, so naming all three would spoil two
// players nobody was given a clue for, and would read as though the single
// grid somehow had three answers. The other two stay on the site.
//
// Never posts an orphan reveal, never linkifies the site (the puzzle post
// already carries the paid link; this one stays at the $0.015 rate).

import { isPaused, loadPosts, mostRecentUnrevealed, recordPost, COST } from './lib/state.mjs';
import { playerById } from './lib/roster.mjs';
import { dailyFor, dailyIsLive } from './lib/daily.mjs';
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

// Terminology: the answer is a JUGADOR. "Tres nuevas" would agree with
// carreras and describe the clue as if it were the answer.
//
// `shownIndex` is which of the day's three rounds the card actually rendered.
// post-daily always uses round 0, but it is recorded per-post rather than
// assumed, so a future change to which round gets posted cannot silently
// reveal the wrong player.
// `isLive` is whether that day's daily is STILL the one the site is serving.
// The daily rolls at 00:00 UTC, so "los otros dos jugadores de hoy están en
// derabona.club" becomes a lie the instant the boundary passes: the site has
// already swapped in three new players. When the daily has rolled, point at
// the new one instead of a puzzle nobody can reach.
export function composeReveal(daily, shownIndex = 0, isLive = true) {
  const shown = daily.rounds[shownIndex];
  if (!shown) throw new Error(`daily #${daily.challengeNumber} has no round ${shownIndex}`);

  const head = `SPOILER. Rabona Diaria #${daily.challengeNumber}`;
  const answer = `Era ${shown.player.name}.`;
  const colour = colourLine(shown.player);
  const tail = isLive
    ? 'Los otros dos jugadores de hoy están en derabona.club'
    : 'Hoy hay tres jugadores nuevos en derabona.club';

  const parts = [head, answer];
  if (colour) parts.push(colour);
  parts.push(tail);

  let text = parts.join('\n\n');
  if (weightedLength(text) > POST_LIMIT) text = [head, answer, tail].join('\n\n');
  return text;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (isPaused()) { console.log('[SILENT]'); return; }

  // Idempotency is keyed on challengeNumber, not a UTC calendar date: the
  // reveal runs at 01:00 London, which is already the NEXT UTC date, so a
  // date-equality check (postedToday()) misses the puzzle it should reveal.
  // This is exactly the bug found live on 2026-09-21 — the job ran, matched
  // no puzzle for "today" in UTC terms, and silently no-opped.
  const puzzle = mostRecentUnrevealed();
  if (!puzzle) { console.log('[SILENT]'); return; }   // nothing to reveal, or already revealed

  const daily = dailyFor(puzzle.date);
  if (!daily || daily.challengeNumber !== puzzle.challengeNumber) {
    throw new Error(`daily mismatch: recorded #${puzzle.challengeNumber}, recomputed #${daily?.challengeNumber}`);
  }

  const text = composeReveal(daily, puzzle.shownIndex ?? 0, dailyIsLive(puzzle.date));
  if (containsUrl(text)) throw new Error('reveal must not contain a linkified URL');
  if (postCost(text) !== COST.post) throw new Error(`reveal would cost $${postCost(text)}, expected $${COST.post}`);
  if (weightedLength(text) > POST_LIMIT) throw new Error(`reveal too long: ${weightedLength(text)} > ${POST_LIMIT}`);

  const x = createClient({ dryRun });
  const post = await x.createPost({ text, replyToId: puzzle.tweetId, priority: 2 });

  if (!dryRun) {
    // Written with today's real (posting-time) date for audit purposes, but
    // matching against a reveal is always done by challengeNumber, per above.
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
