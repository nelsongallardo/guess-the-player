#!/usr/bin/env node
// Scout: read a slice of the watchlist, filter HARD in code, draft replies,
// queue them to Telegram for approval. The blocklist runs before any LLM call —
// the model never gets the chance to be clever about an obituary.

import { isPaused, readState, writeState, canSpend, today } from './lib/state.mjs';
import { createClient } from './lib/x-client.mjs';
import { sendTelegram } from './lib/telegram.mjs';
import { draftReply, DraftCallError } from './lib/draft.mjs';

const MAX_POSTS_PER_RUN = 10;   // read budget control
const MAX_DRAFTS_PER_RUN = 5;
const MIN_AGE_MIN = 20;         // still forming
// The watchlist is walked round-robin, 5 accounts per daily run. With 20
// accounts an account's turn comes round every 96h; the old 12h window made most
// posts unreachable by construction and 68% of measured rejections were "too
// old". Keep this window aligned with the watchlist cycle. If the cycle shortens
// (more runs/day, fewer accounts, or a bigger per-run slice), tighten it back;
// replying to a four-day-old post is worse than replying to a fresh one.
const MAX_AGE_HOURS = 96;       // dead

const strip = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const BLOCK = [
  'murio', 'muerte', 'fallecio', 'falleci', 'luto', 'q.e.p.d', 'qepd',
  'descansa en paz', 'condolencias', 'accidente', 'hospital', 'internado',
  'lesion grave', 'rotura de ligamentos', 'operado',
  'renuncio', 'despedido', 'politica', 'elecciones', 'gobierno',
  'arbitro', 'var ', 'escandalo', 'denuncia', 'abuso', 'detenido',
  'violencia', 'racismo', 'insultos', 'agresion', 'barras',
];

// ALLOW no longer gates anything — it only *tags* a post so the approval queue
// shows why it surfaced. It used to be a hard requirement, which rejected 17% of
// everything scanned as "off-topic" including ordinary football talk that simply
// didn't contain one of 17 keywords. Relevance judgement now sits with the model,
// which answers SKIP when it has nothing to add. The BLOCK list above is
// unchanged and still runs first: safety is never delegated to the model.
const ALLOW = [
  'carrera', 'trayectoria', 'fichaje', 'transfer', 'se acuerdan', 'recuerdan',
  'paso por', 'jugo en', 'debut', 'idolo', 'historico', 'aniversario',
  'clasico', 'nostalgia', 'el mejor', 'equipazo', 'que equipo',
];
const ALLOW_RE = [/hace \d+ anos/, /en los? (80|90|2000)/];

export function classify(post) {
  const t = strip(post.text || '');
  const hit = BLOCK.find(b => t.includes(b));
  if (hit) return { ok: false, reason: `blocklist:${hit}` };
  if ((post.text || '').length < 40) return { ok: false, reason: 'too short' };

  const ageMin = (Date.now() - new Date(post.created_at).getTime()) / 60000;
  if (ageMin < MIN_AGE_MIN) return { ok: false, reason: 'too fresh' };
  if (ageMin > MAX_AGE_HOURS * 60) return { ok: false, reason: 'too old' };

  // Topic is descriptive, not a gate. 'general' means "no keyword matched, let
  // the model decide" — it still has to pass every rule in the draft prompt.
  const topic = ALLOW.find(a => t.includes(a)) || (ALLOW_RE.find(r => r.test(t)) ? 'era' : 'general');

  const tag = /fichaje|transfer|debut/.test(t)
    ? 'news-adjacent'
    : (topic === 'general' ? 'general' : 'nostalgia');
  return { ok: true, topic, tag };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (isPaused()) { console.log('[SILENT]'); return; }

  const wl = readState('watchlist.json', { accounts: [], cursor: 0 });
  if (!wl.accounts?.length) {
    console.log('watchlist.json has no accounts yet — nothing to scout. [SILENT]');
    return;
  }

  const gate = canSpend(0.05, 4);
  if (!gate.ok) { console.log(`scout skipped: ${gate.reason} [SILENT]`); return; }

  const x = createClient({ dryRun });

  // Round-robin so the whole watchlist gets covered across days on a small budget.
  const per = 2;
  const take = Math.ceil(MAX_POSTS_PER_RUN / per);
  const slice = [];
  for (let i = 0; i < take; i++) slice.push(wl.accounts[(wl.cursor + i) % wl.accounts.length]);

  const candidates = [];
  for (const acct of slice) {
    try {
      if (!acct.userId) acct.userId = await x.getUserId(acct.handle);
      if (!acct.userId) continue;
      const posts = await x.getUserPosts(acct.userId, per);
      for (const p of posts) {
        const verdict = classify(p);
        if (!verdict.ok) { console.log(`  skip @${acct.handle} ${p.id}: ${verdict.reason}`); continue; }
        candidates.push({ acct, post: p, ...verdict });
      }
    } catch (e) {
      console.error(`  @${acct.handle} failed: ${e.message}`);
    }
  }

  wl.cursor = (wl.cursor + take) % wl.accounts.length;
  if (!dryRun) writeState('watchlist.json', wl);

  const drafts = readState('drafts.json', { batches: [] });
  const recent = drafts.batches.flatMap(b => b.drafts).slice(-20);
  const mentionRate = recent.filter(d => /derabona/i.test(d.reply)).length / Math.max(1, recent.length);

  const batch = { id: `${today()}-${Date.now()}`, at: new Date().toISOString(), drafts: [] };
  let callFailures = 0;
  for (const c of candidates.slice(0, MAX_DRAFTS_PER_RUN)) {
    let reply;
    try {
      reply = await draftReply({ sourceText: c.post.text, handle: c.acct.handle, allowMention: mentionRate < 0.2 });
    } catch (e) {
      if (e instanceof DraftCallError) {
        callFailures++;
        console.error(`  ${e.message}`);
        continue;
      }
      throw e;
    }
    if (!reply) continue;
    batch.drafts.push({
      id: `${batch.id}-${batch.drafts.length + 1}`,
      n: batch.drafts.length + 1,
      handle: c.acct.handle,
      sourceId: c.post.id,
      sourceUrl: `https://x.com/${c.acct.handle}/status/${c.post.id}`,
      sourceText: c.post.text,
      reply,
      tag: c.tag,
      topic: c.topic,
      status: 'pending',
    });
  }

  // A candidate reaching the LLM step and every such call failing means the
  // drafting path itself is broken (auth, quota, outage) — not that nothing
  // was worth replying to. Fail the job so failure_deliver actually fires,
  // instead of looking identical to an ordinary quiet [SILENT] run.
  const attempted = Math.min(candidates.length, MAX_DRAFTS_PER_RUN);
  if (attempted > 0 && callFailures === attempted) {
    throw new Error(`derabona scout: all ${callFailures} draft call(s) failed — LLM path is likely broken, see stderr above`);
  }

  if (!batch.drafts.length) { console.log('[SILENT]'); return; }

  drafts.batches.push(batch);
  drafts.batches = drafts.batches.slice(-30);
  if (!dryRun) writeState('drafts.json', drafts);

  const lines = [`derabona — ${batch.drafts.length} respuesta(s) para aprobar\n`];
  for (const d of batch.drafts) {
    lines.push(`${d.n}. @${d.handle}: "${d.sourceText.slice(0, 100)}${d.sourceText.length > 100 ? '…' : ''}"`);
    lines.push(`   → "${d.reply}"`);
    lines.push(`   ${d.sourceUrl}\n`);
  }
  lines.push('Respondé con el número (o "1,3"), o "skip".');
  const msg = lines.join('\n');

  if (dryRun) { console.log('--- would send to Telegram ---\n' + msg); }
  else { await sendTelegram(msg); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona scout FAILED:', e.message); process.exit(1); });
}
