// Pilot tracker export. Missing data is "N/A", never 0. Checkpoints come from
// the actual sentAt. One row per target key, however many records repeat it.

import { reduceState } from './ledger.mjs';

export const TRACKER_COLUMNS = Object.freeze(['campaign_id', 'asset_id', 'action_type', 'due_at_utc', 'platform', 'channel_id', 'native_account', 'format', 'hook', 'primary_cta',
  'permission_gate', 'owner', 'response_window_utc', 'approval_digest', 'derivative_sha256', 'status', 'buffer_post_id', 'public_url', 'public_verified_at',
  'metric_due_24h', 'views_24h', 'likes_24h', 'comments_24h', 'metric_due_7d', 'views_7d', 'likes_7d', 'comments_7d', 'metrics_source', 'metrics_observed_at',
  'metrics_freshness', 'consented_arrivals_24h', 'consented_arrivals_7d', 'supported_completion_24h', 'supported_completion_7d', 'supported_return_7d',
  'production_minutes', 'variable_cost_usd', 'issue', 'next_action']);

const NA = 'N/A';
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : NA);

const NEXT = {
  none: 'not submitted', intent: 'reconcile (never resend)', uncertain: 'reconcile (never resend)', rejected: 'fix payload and get a new approval',
  created: 'reconcile after the slot', scheduled: 'reconcile after the slot', sending: 'reconcile', not_scheduled: 'investigate: Buffer holds it as draft/approval',
  awaiting_owner_finish: 'owner: set TikTok privacy, interactions and promotional label in Buffer, then schedule at the slot',
  error: 'investigate Buffer error', public_verification_pending: 'verify public page + owner evidence', public_unverified: 'collect owner evidence',
  public_verified: 'collect metrics at checkpoints',
};

export function trackerRows({ jobs, entries, metrics = [], nowUtc }) {
  const now = Date.parse(nowUtc);
  const rows = new Map();
  for (const job of jobs) for (const target of job.targets) {
    const key = `${job.campaignId}|${job.assetId}|${target.channelId}|${target.publishAtUtc}`;
    if (rows.has(key)) continue;
    const st = reduceState(entries, key);
    const sent = st.sentAt ? Date.parse(st.sentAt) : null;
    const checkpoint = (label, hours) => {
      if (sent === null) return { due: 'N/A (not sent)', views: 'N/A (not sent)', likes: 'N/A (not sent)', comments: 'N/A (not sent)', rec: null };
      const due = sent + hours * 3600000;
      if (now < due) return { due: iso(due), views: 'N/A (not due)', likes: 'N/A (not due)', comments: 'N/A (not due)', rec: null };
      const rec = metrics.filter(m => m.key === key && m.checkpoint === label && Date.parse(m.observedAtUtc) >= due)
        .sort((a, b) => a.observedAtUtc.localeCompare(b.observedAtUtc)).at(-1) ?? null;
      return { due: iso(due), views: num(rec?.views), likes: num(rec?.likes), comments: num(rec?.comments), rec };
    };
    const c24 = checkpoint('24h', 24), c7 = checkpoint('7d', 168);
    const latest = [c24.rec, c7.rec].filter(Boolean).sort((a, b) => a.observedAtUtc.localeCompare(b.observedAtUtc)).at(-1);
    const slot = Date.parse(target.publishAtUtc);
    rows.set(key, {
      campaign_id: job.campaignId, asset_id: job.assetId, action_type: 'publish', due_at_utc: target.publishAtUtc,
      platform: target.platform, channel_id: target.channelId, native_account: target.nativeAccount,
      format: 'narrated career puzzle, 9:16', hook: 'question → 5 s pause → answer',
      primary_cta: target.platform === 'youtube' ? 'derabona.club (description + end card)' : 'none in frame',
      permission_gate: 'G5 receipt + G6/G7', owner: 'Nelson', response_window_utc: `${iso(slot + 1800000)}/${iso(slot + 3600000)}`,
      approval_digest: st.digest ?? NA, derivative_sha256: st.derivativeSha256 ?? NA, status: st.state,
      buffer_post_id: st.postId ?? NA, public_url: st.externalLink ?? NA, public_verified_at: st.publicVerifiedAt ?? NA,
      metric_due_24h: c24.due, views_24h: c24.views, likes_24h: c24.likes, comments_24h: c24.comments,
      metric_due_7d: c7.due, views_7d: c7.views, likes_7d: c7.likes, comments_7d: c7.comments,
      metrics_source: latest?.source ?? NA, metrics_observed_at: latest?.observedAtUtc ?? NA,
      metrics_freshness: latest ? `${((now - Date.parse(latest.observedAtUtc)) / 3600000).toFixed(1)}h old` : NA,
      consented_arrivals_24h: num(c24.rec?.consentedArrivals), consented_arrivals_7d: num(c7.rec?.consentedArrivals),
      supported_completion_24h: num(c24.rec?.supportedCompletion), supported_completion_7d: num(c7.rec?.supportedCompletion), supported_return_7d: num(c7.rec?.supportedReturn),
      production_minutes: NA, variable_cost_usd: NA,
      issue: st.incidents ? `${st.incidents} reconciliation incident(s)` : '',
      next_action: NEXT[st.state] ?? 'review',
    });
  }
  return [...rows.values()];
}

export function summary(rows) {
  const views = rows.map(r => r.views_24h).filter(v => /^\d+$/.test(v)).map(Number);
  return {
    targets: rows.length,
    publicVerified: rows.filter(r => r.status === 'public_verified').length,
    unresolved: rows.filter(r => ['intent', 'uncertain'].includes(r.status)).length,
    views24h: { covered: views.length, of: rows.length, total: views.reduce((a, b) => a + b, 0) },
  };
}

const cell = v => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function toCsv(rows) {
  return [TRACKER_COLUMNS.join(','), ...rows.map(r => TRACKER_COLUMNS.map(c => cell(r[c] ?? NA)).join(','))].join('\r\n') + '\r\n';
}

