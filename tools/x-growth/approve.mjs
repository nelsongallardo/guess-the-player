#!/usr/bin/env node
// Posts an approved draft. Enforces the caps here too, not just in the scout —
// approval is a human tap, and humans lose count.

import { isPaused, readState, writeState, today, recordPost, loadPosts } from './lib/state.mjs';
import { createClient } from './lib/x-client.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const MAX_REPLIES_PER_DAY = 5;
const SIMILARITY_DAYS = 14;

function norm(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// Normalised Levenshtein. Near-duplicate replies are what actually gets
// an account flagged for platform manipulation.
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export function findDraft(drafts, ref) {
  for (const b of [...drafts.batches].reverse()) {
    const d = b.drafts.find(x => x.id === ref || String(x.n) === String(ref));
    if (d) return { batch: b, draft: d };
  }
  return {};
}

export async function approve(ref, { dryRun = false } = {}) {
  if (isPaused()) throw new Error('paused');

  const drafts = readState('drafts.json', { batches: [] });
  const { batch, draft } = findDraft(drafts, ref);
  if (!draft) throw new Error(`no draft matching "${ref}"`);
  if (draft.status !== 'pending') throw new Error(`draft ${draft.id} already ${draft.status}`);

  const ageH = (Date.now() - new Date(batch.at).getTime()) / 3.6e6;
  if (ageH > 12) throw new Error(`batch is ${ageH.toFixed(1)}h old — too stale to reply`);

  const posts = loadPosts();
  const todays = posts.filter(p => p.date === today() && p.kind === 'reply');
  if (todays.length >= MAX_REPLIES_PER_DAY) throw new Error(`daily cap of ${MAX_REPLIES_PER_DAY} replies reached`);
  if (todays.some(p => p.handle === draft.handle)) throw new Error(`already replied to @${draft.handle} today`);

  const cutoff = Date.now() - SIMILARITY_DAYS * 864e5;
  const recent = posts.filter(p => p.kind === 'reply' && new Date(p.at).getTime() > cutoff);
  const dup = recent.find(p => similarity(p.text, draft.reply) >= 0.85);
  if (dup) throw new Error(`too similar to a reply sent ${dup.date}`);

  const x = createClient({ dryRun });
  const source = await x.getPost(draft.sourceId);
  if (!source && !dryRun) throw new Error('source post no longer exists — not replying');

  const post = await x.createPost({ text: draft.reply, replyToId: draft.sourceId, priority: 3 });

  if (!dryRun) {
    draft.status = 'approved';
    draft.tweetId = post.id;
    for (const other of batch.drafts) {
      if (other.status === 'pending') other.status = 'skipped';
    }
    writeState('drafts.json', drafts);
    recordPost({ kind: 'reply', handle: draft.handle, text: draft.reply, tweetId: post.id, sourceId: draft.sourceId, tag: draft.tag });
  }

  return { draft, url: `https://x.com/derabona_club/status/${post.id}` };
}

export function skipBatch() {
  const drafts = readState('drafts.json', { batches: [] });
  const batch = drafts.batches[drafts.batches.length - 1];
  if (!batch) return 0;
  let n = 0;
  for (const d of batch.drafts) if (d.status === 'pending') { d.status = 'skipped'; n++; }
  writeState('drafts.json', drafts);
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const refs = process.argv.slice(2).filter(a => !a.startsWith('--'));
  (async () => {
    if (refs[0] === 'skip') { console.log(`skipped ${skipBatch()} draft(s)`); return; }
    for (const ref of refs) {
      try {
        const r = await approve(ref, { dryRun });
        const msg = `✓ respondido a @${r.draft.handle}\n${r.url}`;
        console.log(msg);
        if (!dryRun) await sendTelegram(msg);
      } catch (e) {
        console.error(`✗ ${ref}: ${e.message}`);
        if (!dryRun) await sendTelegram(`✗ no se pudo responder (${ref}): ${e.message}`).catch(() => {});
      }
    }
  })();
}
