#!/usr/bin/env node
// One Buffer post for one approved target. Dry-run unless --submit is given.
//
//   node publish.mjs --init-ledger --state DIR                       (one time)
//   node publish.mjs --manifest JOB.json --channel ID --derivative OUT.mp4 --asset-url URL --state DIR          (dry run)
//   BUFFER_API_KEY=… node publish.mjs ... --submit                    (G6+ only, with owner authorization)
//
// Dry run performs no vendor, host or ledger write (it does GET the hosted
// object and the public site to check them).

import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJob } from './lib/job.mjs';
import { loadConfig } from './lib/config.mjs';
import { initLedger } from './lib/ledger.mjs';
import { publishTarget } from './lib/worker.mjs';
import { createBufferClient } from './lib/buffer.mjs';
import { derivativeOf, sourceChecker, hostVerifier } from './lib/cli-deps.mjs';

const { values: a } = parseArgs({ options: {
  manifest: { type: 'string' }, channel: { type: 'string' }, derivative: { type: 'string' }, 'asset-url': { type: 'string' },
  state: { type: 'string' }, submit: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'init-ledger': { type: 'boolean' }, 'source-ref': { type: 'string' },
} });
const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
try {
  if (!a.state) throw new Error('--state DIR is required');
  if (a['init-ledger']) { initLedger(a.state); console.log(`initialized ${path.join(a.state, 'intents.jsonl')}`); process.exit(0); }
  if (!a.manifest || !a.channel || !a.derivative || !a['asset-url']) throw new Error('usage: --manifest --channel --derivative --asset-url --state [--submit]');
  if (a.submit && a['dry-run']) throw new Error('choose --submit or --dry-run, not both');
  const job = readJob(a.manifest);
  const target = job.targets.find(t => t.channelId === a.channel);
  if (!target) throw new Error(`job has no target for channel ${a.channel}`);
  const config = loadConfig(path.join(a.state, 'config.json'));
  const deps = {
    config, stateDir: a.state, assetUrl: a['asset-url'],
    derivative: await derivativeOf(a.derivative, target.platform),
    checkSource: sourceChecker({ ref: a['source-ref'] ?? 'origin/main' }),
    verifyHost: hostVerifier(config, job),
    buffer: a.submit ? createBufferClient({ apiKey: process.env.BUFFER_API_KEY }) : null,
  };
  const out = await publishTarget(deps, { job, channelId: a.channel, nowUtc, dryRun: !a.submit });
  console.log(JSON.stringify(out, null, 2));
  if (!out.dryRun && out.state === 'created' && target.platform === 'tiktok') {
    const on = v => (v ? 'on' : 'off');
    console.log([
      'TikTok DRAFT created. It will not publish until you finish it in Buffer:',
      `  1. Open the draft for ${target.nativeAccount} (Buffer post ${out.postId}). Do not change the caption, video or time.`,
      `  2. Who can view: ${target.privacy}. Comments ${on(target.interactions.comments)}, Duet ${on(target.interactions.duet)}, Stitch ${on(target.interactions.stitch)}.`,
      `  3. Promotional content ("Your brand"): ${on(target.disclosures.promotional)}. AI-generated: on (already set).`,
      `  4. Schedule it for ${target.publishAtUtc} (UTC) with Automatic publishing, then run reconcile.mjs --readonly.`,
    ].join('\n'));
  }
  if (out.dryRun ? !out.ok : out.state !== 'created') process.exitCode = 1;
} catch (e) {
  console.error(`publish refused: ${e.message}`);
  process.exit(1);
}
