// State-machine tests with MOCK Buffer/host/source dependencies. They prove the
// local no-resend fence, not provider behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { initLedger, openLedger, targetKey } from '../lib/ledger.mjs';
import { acquireLock } from '../lib/lock.mjs';
import { publishTarget, reconcileTarget } from '../lib/worker.mjs';
import { approvalPayload, issueReceipt, appendReceipt } from '../lib/approval.mjs';
import { createBufferClient, buildCreatePostInput } from '../lib/buffer.mjs';
import { digest } from '../lib/manifest.mjs';
import { validJob, validConfig, HEX } from './fixtures.mjs';

const NOW = '2026-10-18T10:00:00Z';
const URL_OK = 'https://media.example.org/v/0123456789abcdef0123/dddddddddddddddd-youtube.mp4';
const DERIV = { platform: 'youtube', sha256: HEX('d'), sizeBytes: 10, durationSec: 25 };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-publish-'));

const licensed = () => validJob({ license: { ttsProvider: 'elevenlabs', ttsPlan: 'creator', ttsCommercialUse: true, voiceId: 'MockVoice0123456789', modelId: 'eleven_multilingual_v2', evidence: 'mock', crests: 'embedded', music: 'none' } });
const twoYoutube = () => {
  const j = licensed();
  j.targets.push({ ...j.targets[0], channelId: 'mock-yt-2', nativeAccount: 'UCsecondsecondsecondsec', disclosures: { aiGenerated: true, promotional: false } });
  return j;
};
const config = (over = {}) => validConfig({ buffer: { organizationId: 'mock-org', channels: [
  { platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmockmockmockmockmockmo' },
  { platform: 'youtube', channelId: 'mock-yt-2', nativeAccount: 'UCsecondsecondsecondsec' }] }, ...over });

function approveAll(stateDir, job) {
  for (const target of job.targets) {
    const payload = approvalPayload({ job, target, derivative: { ...DERIV, platform: target.platform } });
    appendReceipt(path.join(stateDir, 'approvals.jsonl'), issueReceipt({ payload, approver: 'Nelson', confirmDigest: digest(payload), nowUtc: NOW, expiresAtUtc: '2026-10-19T15:00:00Z' }));
  }
}

function fakeBuffer(results, onCreate = () => {}) {
  const calls = { create: 0, read: 0, list: 0 };
  return {
    calls,
    async createPost(input) { calls.create++; onCreate(input); const r = results.create.shift(); if (r instanceof Error) throw r; return r; },
    async readPost(id) { calls.read++; return results.read.shift()?.(id); },
    async listPosts() { calls.list++; return results.list.shift(); },
  };
}

function setup({ job = licensed(), results = { create: [{ kind: 'created', postId: 'post_1', status: 'scheduled' }], read: [], list: [] }, onCreate, cfg = config(), init = true } = {}) {
  const stateDir = tmp();
  if (init) initLedger(stateDir);
  approveAll(stateDir, job);
  const buffer = fakeBuffer(results, onCreate);
  const deps = {
    config: cfg, stateDir, buffer,
    derivative: DERIV, assetUrl: URL_OK,
    verifyHost: async () => ({ sha256: DERIV.sha256 }),
    checkSource: async () => [],
  };
  return { stateDir, job, buffer, deps };
}
const run = (s, channelId = 'mock-yt-channel', over = {}) => publishTarget({ ...s.deps, ...over }, { job: s.job, channelId, nowUtc: NOW });

test('a missing or malformed ledger fails closed with no request', async () => {
  const s = setup({ init: false });
  await assert.rejects(run(s), /ledger/);
  initLedger(s.stateDir);
  fs.appendFileSync(path.join(s.stateDir, 'intents.jsonl'), '{"type":"intent",\n');
  await assert.rejects(run(s), /ledger/);
  assert.equal(s.buffer.calls.create, 0);
  assert.throws(() => initLedger(s.stateDir), /exists/);
});

test('the intent is durable before the single create request, and success is recorded', async () => {
  let sawIntent = false;
  const s = setup({ onCreate: () => { sawIntent = /"type":"intent"/.test(fs.readFileSync(path.join(s.stateDir, 'intents.jsonl'), 'utf8')); } });
  const out = await run(s);
  assert.equal(sawIntent, true);
  assert.equal(out.state, 'created');
  assert.equal(s.buffer.calls.create, 1);
  const st = openLedger(s.stateDir).state(targetKey({ job: s.job, target: s.job.targets[0] }));
  assert.equal(st.state, 'created');
  assert.equal(st.postId, 'post_1');
  await assert.rejects(run(s), /already/);
  assert.equal(s.buffer.calls.create, 1);
  assert.equal(fs.existsSync(path.join(s.stateDir, 'publish.lock')), false);
});

test('two concurrent publishers produce one create', async () => {
  const s = setup({ results: { create: [{ kind: 'created', postId: 'post_1', status: 'scheduled' }, { kind: 'created', postId: 'post_dup', status: 'scheduled' }], read: [], list: [] } });
  const outcomes = await Promise.allSettled([run(s), run(s)]);
  assert.equal(s.buffer.calls.create, 1);
  assert.equal(outcomes.filter(o => o.status === 'rejected').length, 1);
});

test('a lock held by another live process blocks publishing', async () => {
  const s = setup();
  const lockFile = path.join(s.stateDir, 'publish.lock');
  const child = spawn(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(lockFile)}, String(process.pid), {flag:'wx'}); setTimeout(()=>{}, 5000)`]);
  for (let i = 0; i < 50 && !fs.existsSync(lockFile); i++) await new Promise(r => setTimeout(r, 20));
  try {
    await assert.rejects(run(s), /another publisher/);
    assert.equal(s.buffer.calls.create, 0);
  } finally { child.kill(); }
  await new Promise(r => child.on('exit', r));
  assert.throws(() => acquireLock(s.stateDir), /stale/);
});

test('a crash after the intent leaves the target unresolved until reconciliation finds one exact post', async () => {
  const s = setup({ results: { create: [new Error('process killed mid-request')], read: [], list: [] } });
  await assert.rejects(run(s), /killed/);
  const key = targetKey({ job: s.job, target: s.job.targets[0] });
  assert.equal(openLedger(s.stateDir).state(key).state, 'uncertain');
  await assert.rejects(run(s), /already|unresolved/);
  assert.equal(s.buffer.calls.create, 1);

  const input = buildCreatePostInput({ payload: approvalPayload({ job: s.job, target: s.job.targets[0], derivative: DERIV }), assetUrl: URL_OK });
  const node = (id, over = {}) => ({ node: { id, text: input.text, dueAt: input.dueAt, channelId: input.channelId, assets: [{ source: URL_OK }], ...over } });
  s.buffer.calls.list = 0;
  const results = { create: [], read: [], list: [{ edges: [node('other', { text: 'different' }), node('post_9')], pageInfo: { hasNextPage: false } }] };
  const r = await reconcileTarget({ ...s.deps, buffer: fakeBuffer(results) }, { job: s.job, channelId: 'mock-yt-channel', nowUtc: NOW, sleep: async () => {} });
  assert.equal(r.attached, 'post_9');
  assert.equal(openLedger(s.stateDir).state(key).postId, 'post_9');
});

test('no match or several matches after an ambiguous write is an incident, never a retry', async () => {
  for (const edges of [[], [1, 2]]) {
    const s = setup({ results: { create: [{ kind: 'uncertain', reason: 'HTTP 502' }], read: [], list: [] } });
    await run(s);
    const input = buildCreatePostInput({ payload: approvalPayload({ job: s.job, target: s.job.targets[0], derivative: DERIV }), assetUrl: URL_OK });
    const list = { edges: edges.map(i => ({ node: { id: `p${i}`, text: input.text, dueAt: input.dueAt, channelId: input.channelId, assets: [{ source: URL_OK }] } })), pageInfo: { hasNextPage: false } };
    const r = await reconcileTarget({ ...s.deps, buffer: fakeBuffer({ create: [], read: [], list: [list] }) }, { job: s.job, channelId: 'mock-yt-channel', nowUtc: NOW, sleep: async () => {} });
    assert.equal(r.incident, true);
    await assert.rejects(run(s), /unresolved|already/);
    assert.equal(s.buffer.calls.create, 1);
  }
});

test('a timeout whose response arrives late is uncertain and never recreated', async () => {
  let late = 0;
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
    setTimeout(() => { late++; resolve(new Response(JSON.stringify({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'post_late', status: 'scheduled' } } } }))); }, 150);
  });
  const s = setup();
  const client = createBufferClient({ apiKey: 'k', fetchImpl, timeoutMs: 30 });
  const out = await run(s, 'mock-yt-channel', { buffer: client });
  assert.equal(out.state, 'uncertain');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(late, 1);
  const st = openLedger(s.stateDir).state(targetKey({ job: s.job, target: s.job.targets[0] }));
  assert.equal(st.state, 'uncertain');
  assert.equal(st.postId, null);
  await assert.rejects(run(s, 'mock-yt-channel', { buffer: client }), /unresolved|already/);
});

test('a deterministic rejection needs a changed, re-approved payload before another intent', async () => {
  const s = setup({ results: { create: [{ kind: 'rejected', reason: 'InvalidInputError: title' }, { kind: 'created', postId: 'post_2', status: 'scheduled' }], read: [], list: [] } });
  assert.equal((await run(s)).state, 'rejected');
  await assert.rejects(run(s), /new approval/);
  const fixed = structuredClone(s.job);
  fixed.targets[0].madeForKids = false; fixed.targets[0].privacy = 'unlisted';
  approveAll(s.stateDir, fixed);
  assert.equal((await publishTarget(s.deps, { job: fixed, channelId: 'mock-yt-channel', nowUtc: NOW })).state, 'created');
  assert.equal(s.buffer.calls.create, 2);
});

test('targets are independent: one success and one uncertain are both preserved', async () => {
  const s = setup({ job: twoYoutube(), results: { create: [{ kind: 'created', postId: 'post_a', status: 'scheduled' }, { kind: 'uncertain', reason: 'HTTP 503' }], read: [], list: [] } });
  assert.equal((await run(s, 'mock-yt-channel')).state, 'created');
  assert.equal((await run(s, 'mock-yt-2')).state, 'uncertain');
  await assert.rejects(run(s, 'mock-yt-channel'), /already/);
  await assert.rejects(run(s, 'mock-yt-2'), /unresolved|already/);
  assert.equal(s.buffer.calls.create, 2);
  const led = openLedger(s.stateDir);
  assert.equal(led.state(targetKey({ job: s.job, target: s.job.targets[0] })).state, 'created');
  assert.equal(led.state(targetKey({ job: s.job, target: s.job.targets[1] })).state, 'uncertain');
});

test('late edits, source drift, an unavailable host, PAUSE or TikTok stop before any intent', async () => {
  const cases = [
    ['late edit', s => { s.job.targets[0].privacy = 'unlisted'; }, /approval|changed/],
    ['source', s => { s.deps.checkSource = async () => ['Daily schedule changed since the job was prepared']; }, /schedule/],
    ['host', s => { s.deps.verifyHost = async () => { throw new Error('media URL returned HTTP 403'); }; }, /403/],
    ['pause', s => { fs.writeFileSync(path.join(s.stateDir, 'PAUSE'), ''); }, /PAUSE/],
    ['disabled', s => { s.deps.config = config({ enabled: false }); }, /disabled/],
  ];
  for (const [label, mutate, re] of cases) {
    const s = setup();
    mutate(s);
    await assert.rejects(run(s), re, label);
    assert.equal(s.buffer.calls.create, 0, label);
    assert.equal(fs.readFileSync(path.join(s.stateDir, 'intents.jsonl'), 'utf8'), '', label);
  }
  const t = licensed();
  t.targets = [{ platform: 'tiktok', channelId: 'mock-tt', nativeAccount: '@mock', publishAtUtc: '2026-10-19T16:00:00Z', privacy: 'public_to_everyone', madeForKids: false, interactions: { comments: true, duet: false, stitch: false }, disclosures: { aiGenerated: true, promotional: true } }];
  const s = setup({ job: t, cfg: config({ buffer: { organizationId: 'mock-org', channels: [{ platform: 'tiktok', channelId: 'mock-tt', nativeAccount: '@mock' }] } }) });
  s.deps.derivative = { ...DERIV, platform: 'tiktok' };
  await assert.rejects(publishTarget({ ...s.deps }, { job: t, channelId: 'mock-tt', nowUtc: NOW }), /TikTok/);
});

test('dry-run reports every failing gate and writes nothing', async () => {
  const s = setup({ cfg: config({ enabled: false }) });
  s.deps.verifyHost = async () => { throw new Error('media URL returned HTTP 404'); };
  const ledgerBefore = fs.readFileSync(path.join(s.stateDir, 'intents.jsonl'));
  const listing = fs.readdirSync(s.stateDir).sort();
  const out = await publishTarget(s.deps, { job: s.job, channelId: 'mock-yt-channel', nowUtc: NOW, dryRun: true });
  assert.equal(out.dryRun, true);
  assert.equal(out.ok, false);
  assert.ok(out.gates.some(g => !g.ok && /disabled/.test(g.error)));
  assert.ok(out.gates.some(g => !g.ok && /404/.test(g.error)));
  assert.equal(s.buffer.calls.create, 0);
  assert.deepEqual(fs.readFileSync(path.join(s.stateDir, 'intents.jsonl')), ledgerBefore);
  assert.deepEqual(fs.readdirSync(s.stateDir).sort(), listing);
});

test('reconcile polls the stored ID within a bounded budget and never treats sent as public', async () => {
  const s = setup();
  await run(s);
  const input = buildCreatePostInput({ payload: approvalPayload({ job: s.job, target: s.job.targets[0], derivative: DERIV }), assetUrl: URL_OK });
  const post = over => () => ({ id: 'post_1', status: 'scheduled', text: input.text, dueAt: input.dueAt, schedulingType: 'automatic', notificationStatus: null, channelId: input.channelId, channelService: 'youtube', assets: [{ source: URL_OK }],
    metadata: { __typename: 'YoutubePostMetadata', ...input.metadata.youtube, category: { categoryId: '17' } }, sentAt: null, externalLink: null, ...over });
  const pending = fakeBuffer({ create: [], read: Array.from({ length: 20 }, () => post({})), list: [] });
  const early = await reconcileTarget({ ...s.deps, buffer: pending }, { job: s.job, channelId: 'mock-yt-channel', nowUtc: NOW, sleep: async () => {}, maxReads: 10 });
  assert.equal(early.state, 'scheduled');
  assert.equal(pending.calls.read, 1, 'before the slot one confirming read is enough');
  const AFTER = '2026-10-19T16:01:00Z';
  const r1 = await reconcileTarget({ ...s.deps, buffer: pending }, { job: s.job, channelId: 'mock-yt-channel', nowUtc: AFTER, sleep: async () => {}, maxReads: 10 });
  assert.equal(pending.calls.read, 11);
  assert.equal(r1.state, 'scheduled');
  const sent = fakeBuffer({ create: [], read: [post({ status: 'sending' }), post({ status: 'sent', sentAt: '2026-10-19T16:00:04Z', externalLink: 'https://www.youtube.com/shorts/abcdefghijk' })], list: [] });
  const r2 = await reconcileTarget({ ...s.deps, buffer: sent }, { job: s.job, channelId: 'mock-yt-channel', nowUtc: AFTER, sleep: async () => {} });
  assert.equal(r2.state, 'public_verification_pending');
  assert.equal(openLedger(s.stateDir).state(targetKey({ job: s.job, target: s.job.targets[0] })).state, 'public_verification_pending');
  assert.equal(pending.calls.create + sent.calls.create, 0);
});
