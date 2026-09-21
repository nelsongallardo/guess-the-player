#!/usr/bin/env node
// Weekly metrics. Unavailable numbers are reported as N/A, never as 0.

import { isPaused, loadPosts, readState, writeState, spentThisMonth, today, MONTHLY_CAP } from './lib/state.mjs';
import { createClient } from './lib/x-client.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const GATE = { followers: 500, streak: 30, impressions: 20000 };

function currentStreak(posts) {
  const days = new Set(posts.filter(p => p.kind === 'puzzle').map(p => p.date));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) {
      // today may not have posted yet; don't break the streak on that alone
      if (streak === 0 && key === today()) { d.setDate(d.getDate() - 1); continue; }
      break;
    }
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (isPaused()) { console.log('[SILENT]'); return; }

  const posts = loadPosts();
  const weekAgo = Date.now() - 7 * 864e5;
  const week = posts.filter(p => new Date(p.at).getTime() > weekAgo);

  const drafts = readState('drafts.json', { batches: [] });
  const all = drafts.batches.flatMap(b => b.drafts);
  const decided = all.filter(d => d.status !== 'pending');
  const approvalRate = decided.length ? Math.round(100 * decided.filter(d => d.status === 'approved').length / decided.length) : null;

  let followers = null, handle = 'derabona_club';
  try {
    const me = await createClient({ dryRun }).getMe();
    followers = me.public_metrics?.followers_count ?? null;
    handle = me.username || handle;
  } catch (e) { console.error('follower read failed:', e.message); }

  const prev = readState('metrics.json', { history: [] });
  const last = prev.history[prev.history.length - 1];
  const delta = (followers != null && last?.followers != null) ? followers - last.followers : null;

  const streak = currentStreak(posts);
  const bestImp = week.map(p => p.impressions).filter(n => typeof n === 'number');
  const best = bestImp.length ? Math.max(...bestImp) : null;

  const na = v => (v == null ? 'N/A' : v);
  const msg = [
    `derabona — semana al ${today()}`,
    ``,
    `Seguidores: ${na(followers)}${delta != null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}`,
    `Puzzles esta semana: ${week.filter(p => p.kind === 'puzzle').length}`,
    `Respuestas enviadas: ${week.filter(p => p.kind === 'reply').length}`,
    `Aprobación de borradores: ${approvalRate == null ? 'N/A' : approvalRate + '%'} (${decided.length} decididos)`,
    `Gasto del mes: $${spentThisMonth().toFixed(2)} / $${MONTHLY_CAP.toFixed(2)}`,
    ``,
    `Puerta de salida:`,
    `  seguidores ${na(followers)}/${GATE.followers}`,
    `  racha ${streak}/${GATE.streak}`,
    `  mejor alcance ${best == null ? 'N/A' : best}/${GATE.impressions}`,
  ].join('\n');

  if (!dryRun) {
    prev.history.push({ date: today(), followers, streak, spend: spentThisMonth(), approvalRate });
    prev.history = prev.history.slice(-104);
    writeState('metrics.json', prev);
    await sendTelegram(msg);
  }
  console.log(msg);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('derabona metrics FAILED:', e.message); process.exit(1); });
}
