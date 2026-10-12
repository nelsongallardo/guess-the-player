import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKER_COLUMNS, trackerRows, toCsv, summary } from '../lib/report.mjs';

const KEY = 'pilot-20261019|0123456789abcdef0123|mock-yt-channel|2026-10-19T16:00:00Z';
const job = { campaignId: 'pilot-20261019', assetId: '0123456789abcdef0123', targets: [{ platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmock', publishAtUtc: '2026-10-19T16:00:00Z' }] };
const entries = (sentAt = '2026-10-19T16:07:00Z') => [
  { type: 'intent', key: KEY, digest: 'a'.repeat(64), at: '2026-10-18T10:00:00Z' },
  { type: 'created', key: KEY, postId: 'post_1', at: '2026-10-18T10:00:01Z' },
  { type: 'status', key: KEY, state: 'public_verification_pending', externalLink: 'https://www.youtube.com/shorts/abcdefghijk', sentAt, at: '2026-10-19T16:10:00Z' },
  { type: 'public', key: KEY, verdict: 'public_verified', at: '2026-10-19T16:30:00Z' },
];
const row = (opts) => trackerRows({ jobs: [job], entries: entries(), metrics: [], nowUtc: '2026-10-21T00:00:00Z', ...opts })[0];

test('the tracker has exactly the planned columns', () => {
  assert.equal(TRACKER_COLUMNS[0], 'campaign_id');
  assert.equal(TRACKER_COLUMNS.at(-1), 'next_action');
  assert.equal(TRACKER_COLUMNS.length, 39);
  assert.deepEqual(Object.keys(row()), TRACKER_COLUMNS);
});

test('missing metrics are N/A, never zero; a real zero stays zero', () => {
  const r = row();
  for (const k of ['views_24h', 'likes_24h', 'comments_24h', 'consented_arrivals_24h', 'supported_completion_24h']) assert.equal(r[k], 'N/A', k);
  const zero = row({ metrics: [{ key: KEY, checkpoint: '24h', views: 0, likes: null, comments: 3, source: 'buffer', observedAtUtc: '2026-10-20T17:00:00Z' }] });
  assert.equal(zero.views_24h, '0');
  assert.equal(zero.likes_24h, 'N/A');
  assert.equal(zero.comments_24h, '3');
});

test('checkpoints derive from the actual sentAt and are not invented before they are due', () => {
  const r = row();
  assert.equal(r.metric_due_24h, '2026-10-20T16:07:00Z');
  assert.equal(r.metric_due_7d, '2026-10-26T16:07:00Z');
  assert.equal(r.views_7d, 'N/A (not due)');
  const early = row({ metrics: [{ key: KEY, checkpoint: '7d', views: 999, source: 'buffer', observedAtUtc: '2026-10-20T00:00:00Z' }] });
  assert.equal(early.views_7d, 'N/A (not due)');
  const notSent = trackerRows({ jobs: [job], entries: entries().slice(0, 2), metrics: [], nowUtc: '2026-10-21T00:00:00Z' })[0];
  assert.equal(notSent.metric_due_24h, 'N/A (not sent)');
  assert.equal(notSent.status, 'created');
});

test('duplicate records for one target produce one row and one count', () => {
  const metrics = [
    { key: KEY, checkpoint: '24h', views: 10, source: 'buffer', observedAtUtc: '2026-10-20T17:00:00Z' },
    { key: KEY, checkpoint: '24h', views: 12, source: 'buffer', observedAtUtc: '2026-10-20T18:00:00Z' },
  ];
  const rows = trackerRows({ jobs: [job, job], entries: [...entries(), ...entries()], metrics, nowUtc: '2026-10-21T00:00:00Z' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].views_24h, '12');
  assert.equal(rows[0].metrics_observed_at, '2026-10-20T18:00:00Z');
  const s = summary(rows);
  assert.equal(s.targets, 1);
  assert.equal(s.publicVerified, 1);
  assert.equal(s.views24h.covered, 1);
  assert.equal(s.views24h.total, 12);
});

test('CSV escapes commas, quotes and newlines', () => {
  const csv = toCsv([{ ...Object.fromEntries(TRACKER_COLUMNS.map(c => [c, 'x'])), issue: 'a, "b"\nc' }]);
  const [header, line] = csv.split('\r\n');
  assert.equal(header, TRACKER_COLUMNS.join(','));
  assert.ok(line.includes('"a, ""b""\nc"') || csv.includes('"a, ""b""\nc"'));
});
