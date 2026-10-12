import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { approvalPayload, issueReceipt, verifyReceipt, appendReceipt, findReceipt, licenseComplete } from '../lib/approval.mjs';
import { digest } from '../lib/manifest.mjs';
import { validJob, HEX } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-approval-'));
const NOW = '2026-10-18T10:00:00Z';
const EXPIRES = '2026-10-19T15:00:00Z';

const licensed = (over = {}) => validJob({
  license: { ttsProvider: 'elevenlabs', ttsPlan: 'creator', ttsCommercialUse: true, voiceId: 'MockVoice0123456789', modelId: 'eleven_multilingual_v2', evidence: 'invoice INV-mock 2026-10-14', crests: 'embedded', music: 'none' },
  ...over,
});
const derivative = (c = 'd') => ({ platform: 'youtube', sha256: HEX(c), sizeBytes: 1234567, durationSec: 25 });
const payloadOf = (job = licensed(), d = derivative()) => approvalPayload({ job, target: job.targets[0], derivative: d });
const approve = (payload, over = {}) => issueReceipt({ payload, approver: 'Nelson', confirmDigest: digest(payload), nowUtc: NOW, expiresAtUtc: EXPIRES, ...over });

test('an explicit approval of the exact digest verifies', () => {
  const p = payloadOf();
  const r = approve(p);
  assert.equal(r.digest, digest(p));
  assert.deepEqual(verifyReceipt(r, p, { nowUtc: NOW }), []);
});

test('a bare yes or a stale digest cannot issue a receipt', () => {
  const p = payloadOf();
  assert.throws(() => approve(p, { confirmDigest: undefined }), /digest/);
  assert.throws(() => approve(p, { confirmDigest: digest(payloadOf(licensed(), derivative('e'))) }), /digest/);
  assert.throws(() => approve(p, { approver: '' }), /approver/);
  assert.throws(() => approve(p, { expiresAtUtc: '2026-10-18T09:00:00Z' }), /expir/);
  assert.throws(() => approve(p, { expiresAtUtc: '2026-10-20T00:00:00Z' }), /publication/);
});

test('incomplete rights or an invalid script refuse approval', () => {
  assert.equal(licenseComplete(validJob().license), false);
  assert.throws(() => payloadOf(validJob()), /license/);
  const noCommercial = licensed(); noCommercial.license.ttsCommercialUse = false;
  assert.throws(() => payloadOf(noCommercial), /license/);
});

test('every late change invalidates an existing receipt', () => {
  const job = licensed();
  const p = payloadOf(job);
  const r = approve(p);
  const mutate = fn => { const j = licensed(); fn(j); return payloadOf(j); };
  const cases = {
    source: mutate(j => { j.source.scheduleSha256 = HEX('9'); }),
    audio: payloadOf(job, derivative('e')),
    caption: (() => { const q = payloadOf(job); q.script.caption += ' #extra'; return q; })(),
    account: mutate(j => { j.targets[0].nativeAccount = 'UCother'; }),
    channel: mutate(j => { j.targets[0].channelId = 'other-channel'; }),
    rights: mutate(j => { j.license.voiceId = 'OtherVoice0123456789'; }),
    privacy: mutate(j => { j.targets[0].privacy = 'unlisted'; }),
    kids: mutate(j => { j.targets[0].madeForKids = true; }),
    disclosure: mutate(j => { j.targets[0].disclosures.promotional = true; }),
    schedule: mutate(j => { j.targets[0].publishAtUtc = '2026-10-19T16:30:00Z'; }),
  };
  for (const [label, changed] of Object.entries(cases)) {
    assert.ok(verifyReceipt(r, changed, { nowUtc: NOW }).some(e => /changed since approval/.test(e)), label);
  }
});

test('TikTok interaction choices are bound into the digest', () => {
  const tik = () => licensed({ targets: [{ platform: 'tiktok', channelId: 'mock-tt', nativeAccount: '@mock', publishAtUtc: '2026-10-19T16:00:00Z', privacy: 'public_to_everyone', madeForKids: false, interactions: { comments: true, duet: false, stitch: false }, disclosures: { aiGenerated: true, promotional: true } }] });
  const a = tik(); const b = tik(); b.targets[0].interactions.duet = true;
  const da = { ...derivative(), platform: 'tiktok' };
  assert.notEqual(digest(approvalPayload({ job: a, target: a.targets[0], derivative: da })), digest(approvalPayload({ job: b, target: b.targets[0], derivative: da })));
});

test('expired receipts and past publication times fail', () => {
  const p = payloadOf();
  const r = approve(p);
  assert.ok(verifyReceipt(r, p, { nowUtc: '2026-10-19T15:00:00Z' }).some(e => /expired/.test(e)));
  const late = approve(p, { expiresAtUtc: '2026-10-19T16:00:00Z' });
  assert.ok(verifyReceipt(late, p, { nowUtc: '2026-10-19T16:00:00Z' }).some(e => /expired|publication/.test(e)));
});

test('three reviewed derivatives each need and keep their own receipt', () => {
  const dir = tmp();
  const file = path.join(dir, 'approvals.jsonl');
  const payloads = ['a', 'b', 'c'].map(c => payloadOf(licensed({ assetId: `${c}`.repeat(20) }), derivative(c)));
  payloads.forEach(p => appendReceipt(file, approve(p)));
  assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 3);
  assert.equal((fs.statSync(file).mode & 0o777), 0o600);
  payloads.forEach(p => assert.deepEqual(verifyReceipt(findReceipt(file, digest(p)), p, { nowUtc: NOW }), []));
  assert.equal(findReceipt(file, digest(payloadOf(licensed(), derivative('f')))), null);
});

test('approve.mjs --review-only prints the digest and writes nothing', () => {
  const dir = tmp();
  const job = licensed();
  const jobFile = path.join(dir, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  const mp4 = path.join(dir, 'youtube.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=108x192:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
  const state = path.join(dir, 'state');
  const res = spawnSync(process.execPath, [path.join(HERE, '../approve.mjs'), '--manifest', jobFile, '--platform', 'youtube', '--derivative', mp4, '--state', state, '--review-only'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /digest: [0-9a-f]{64}/);
  assert.ok(!fs.existsSync(path.join(state, 'approvals.jsonl')));
  const noFlag = spawnSync(process.execPath, [path.join(HERE, '../approve.mjs'), '--manifest', jobFile, '--platform', 'youtube', '--derivative', mp4, '--state', state, '--approve', '--approver', 'Nelson'], { encoding: 'utf8' });
  assert.notEqual(noFlag.status, 0);
  assert.ok(!fs.existsSync(path.join(state, 'approvals.jsonl')));
});
