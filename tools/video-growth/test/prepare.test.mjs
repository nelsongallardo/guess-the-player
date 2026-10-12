// Runs prepare.mjs against this checkout's origin/main snapshot (local git
// only, no network) with the disabled default config.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const prepare = (state, args) => spawnSync(process.execPath, [path.join(HERE, '../prepare.mjs'), '--state', state, '--campaign', 'pilot-test', '--job', 'v01',
  '--publish-at', '2026-12-01T16:00:00Z', '--seed', 'v01', '--made-for-kids', 'false', ...args], { encoding: 'utf8' });

test('a TikTok job records every hand-set choice the owner must apply in Buffer', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-prepare-'));
  const res = prepare(state, ['--sample', '--platform', 'tiktok', '--tiktok-privacy', 'public_to_everyone', '--tiktok-comments', 'true', '--tiktok-duet', 'false', '--tiktok-stitch', 'false']);
  assert.equal(res.status, 0, res.stderr);
  const job = JSON.parse(fs.readFileSync(path.join(state, 'jobs', 'v01.json'), 'utf8'));
  assert.equal(job.targets.length, 1);
  assert.deepEqual({ ...job.targets[0], channelId: undefined, nativeAccount: undefined }, {
    platform: 'tiktok', channelId: undefined, nativeAccount: undefined, publishAtUtc: '2026-12-01T16:00:00Z', privacy: 'public_to_everyone', madeForKids: false,
    interactions: { comments: true, duet: false, stitch: false }, disclosures: { aiGenerated: true, promotional: true },
  });
});

test('TikTok choices are never defaulted', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-prepare-'));
  for (const drop of ['--tiktok-privacy', '--tiktok-comments', '--tiktok-duet', '--tiktok-stitch']) {
    const full = { '--tiktok-privacy': 'public_to_everyone', '--tiktok-comments': 'true', '--tiktok-duet': 'false', '--tiktok-stitch': 'false' };
    delete full[drop];
    const res = prepare(state, ['--sample', '--platform', 'tiktok', ...Object.entries(full).flat()]);
    assert.notEqual(res.status, 0, drop);
    assert.match(res.stderr, new RegExp(drop.slice(2)), drop);
  }
  assert.ok(!fs.existsSync(path.join(state, 'jobs', 'v01.json')));
});
