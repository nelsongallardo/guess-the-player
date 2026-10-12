#!/usr/bin/env node
// Read-only against Buffer: finds or polls the post for one target and records
// what it saw in the local ledger. Never creates, edits or deletes posts.
//
//   BUFFER_API_KEY=… node reconcile.mjs --readonly --manifest JOB.json --channel ID --derivative OUT.mp4 --asset-url URL --state DIR

import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJob } from './lib/job.mjs';
import { loadConfig } from './lib/config.mjs';
import { reconcileTarget } from './lib/worker.mjs';
import { createBufferClient } from './lib/buffer.mjs';
import { derivativeOf } from './lib/cli-deps.mjs';

const { values: a } = parseArgs({ options: {
  readonly: { type: 'boolean' }, manifest: { type: 'string' }, channel: { type: 'string' }, derivative: { type: 'string' }, 'asset-url': { type: 'string' }, state: { type: 'string' },
} });
try {
  if (!a.readonly) throw new Error('pass --readonly to confirm this is a read-only reconciliation');
  if (!a.manifest || !a.channel || !a.derivative || !a['asset-url'] || !a.state) throw new Error('usage: --readonly --manifest --channel --derivative --asset-url --state');
  const job = readJob(a.manifest);
  const target = job.targets.find(t => t.channelId === a.channel);
  if (!target) throw new Error(`job has no target for channel ${a.channel}`);
  const deps = {
    config: loadConfig(path.join(a.state, 'config.json')), stateDir: a.state, assetUrl: a['asset-url'],
    derivative: await derivativeOf(a.derivative, target.platform),
    buffer: createBufferClient({ apiKey: process.env.BUFFER_API_KEY }),
  };
  const out = await reconcileTarget(deps, { job, channelId: a.channel, nowUtc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
  console.log(JSON.stringify(out, null, 2));
  if (out.incident) process.exitCode = 3;
} catch (e) {
  console.error(`reconcile failed: ${e.message}`);
  process.exit(1);
}
