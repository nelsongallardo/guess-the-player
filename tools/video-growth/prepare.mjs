#!/usr/bin/env node
// Choose a spoiler-safe career from fresh upstream and write a private job
// manifest. No network writes; no paid work.
//
//   git fetch origin
//   node prepare.mjs --state DIR --campaign pilot-20261019 --job v01 --publish-at 2026-10-19T16:00:00Z \
//     --seed v01 --made-for-kids false --platform youtube --youtube-privacy public [--crests embedded|text-only] [--source-ref origin/main]
//   node prepare.mjs ... --platform tiktok --tiktok-privacy public_to_everyone \
//     --tiktok-comments true --tiktok-duet false --tiktok-stitch false
//
// TikTok is draft-only (lib/buffer.mjs): these choices are bound into the
// approval and then applied by the owner in Buffer, so none is ever defaulted.
//
// Targets come from the config's channel allowlist. Without approved channels
// (G1) pass --sample to write placeholder targets that can be rendered and
// reviewed but never approved or published.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/config.mjs';
import { readSnapshot } from './lib/source.mjs';
import { selectCareer } from './lib/select.mjs';
import { assertValidJob } from './lib/manifest.mjs';
import { writePrivateJson } from './lib/job.mjs';
import { REPO } from './lib/cli-deps.mjs';

const { values: a } = parseArgs({ options: {
  state: { type: 'string' }, campaign: { type: 'string' }, job: { type: 'string' }, 'publish-at': { type: 'string' }, seed: { type: 'string' },
  'youtube-privacy': { type: 'string' }, 'made-for-kids': { type: 'string' }, crests: { type: 'string', default: 'embedded' },
  'source-ref': { type: 'string', default: 'origin/main' }, sample: { type: 'boolean' }, platform: { type: 'string' },
  'tiktok-privacy': { type: 'string' }, 'tiktok-comments': { type: 'string' }, 'tiktok-duet': { type: 'string' }, 'tiktok-stitch': { type: 'string' },
} });
const bool = k => {
  if (!['true', 'false'].includes(a[k])) throw new Error(`--${k} must be true or false (an explicit owner choice)`);
  return a[k] === 'true';
};
try {
  for (const k of ['state', 'campaign', 'job', 'publish-at', 'seed', 'made-for-kids', 'platform']) if (!a[k]) throw new Error(`--${k} is required`);
  const platform = a.platform;
  if (!['youtube', 'tiktok'].includes(platform)) throw new Error('--platform must be youtube or tiktok');
  const madeForKids = bool('made-for-kids');
  let settings;
  if (platform === 'youtube') {
    if (!a['youtube-privacy']) throw new Error('--youtube-privacy is required');
    settings = { privacy: a['youtube-privacy'], interactions: null, disclosures: { aiGenerated: true, promotional: false } };
  } else {
    if (!a['tiktok-privacy']) throw new Error('--tiktok-privacy is required');
    // The video promotes Derabona itself, so TikTok's "Your brand" promotional label applies.
    settings = { privacy: a['tiktok-privacy'], interactions: { comments: bool('tiktok-comments'), duet: bool('tiktok-duet'), stitch: bool('tiktok-stitch') }, disclosures: { aiGenerated: true, promotional: true } };
  }
  const config = loadConfig(path.join(a.state, 'config.json'));
  const jobsDir = path.join(a.state, 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true, mode: 0o700 });
  const out = path.join(jobsDir, `${a.job}.json`);
  if (fs.existsSync(out)) throw new Error(`${out} already exists; jobs are immutable`);

  const recentUses = fs.readdirSync(jobsDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8')))
    .flatMap(j => j.targets.map(t => ({ playerId: j.career.playerId, publishAtUtc: t.publishAtUtc })));
  const snapshot = readSnapshot({ repo: REPO, commit: a['source-ref'] });
  const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const career = selectCareer(snapshot, { nowUtc, publishAtUtc: a['publish-at'], recentUses, seed: a.seed });

  const channels = a.sample
    ? [{ platform, channelId: 'sample-unassigned', nativeAccount: 'sample-unassigned' }]
    : config.buffer.channels.filter(c => c.platform === platform);
  if (!channels.length) throw new Error(`no approved ${platform} channel in the config allowlist (G1); use --sample for review-only renders`);
  const job = assertValidJob({
    schemaVersion: 1, campaignId: a.campaign, jobId: a.job, assetId: crypto.randomBytes(10).toString('hex'),
    source: { commit: snapshot.commit, ...snapshot.hashes },
    career,
    license: { ttsProvider: null, ttsPlan: null, ttsCommercialUse: null, voiceId: null, modelId: null, evidence: null, crests: a.crests, music: 'none' },
    targets: channels.map(c => ({
      platform, channelId: c.channelId, nativeAccount: c.nativeAccount, publishAtUtc: a['publish-at'],
      madeForKids, ...settings,
    })),
  });
  writePrivateJson(out, job);
  console.log(`wrote ${out} (private: contains the answer)`);
  console.log(`career: ${career.clubs.length} clubs; source ${snapshot.commit.slice(0, 12)}`);
} catch (e) {
  console.error(`prepare refused: ${e.message}`);
  process.exit(1);
}
