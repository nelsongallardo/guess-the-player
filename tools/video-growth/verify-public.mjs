#!/usr/bin/env node
// Record public-delivery evidence for one sent target (read-only GET of the
// public page). Owner evidence is a JSON file written after actually watching:
// { observedBy, observedAtUtc, url, playable, careerOrderOk, revealOk, audioOk, disclosureVisible }
// TikTok adds { privacyOk, interactionsOk, promotionalLabelVisible } for the settings applied by hand in Buffer.
//
//   node verify-public.mjs --manifest JOB.json --channel ID --derivative OUT.mp4 --asset-url URL --state DIR [--owner-evidence FILE]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJob } from './lib/job.mjs';
import { openLedger, targetKey } from './lib/ledger.mjs';
import { approvalPayload } from './lib/approval.mjs';
import { buildCreatePostInput } from './lib/buffer.mjs';
import { verifyPublic, recordPublicVerdict } from './lib/verify-public.mjs';
import { derivativeOf } from './lib/cli-deps.mjs';
import { acquireLock } from './lib/lock.mjs';

const { values: a } = parseArgs({ options: {
  manifest: { type: 'string' }, channel: { type: 'string' }, derivative: { type: 'string' }, 'asset-url': { type: 'string' }, state: { type: 'string' }, 'owner-evidence': { type: 'string' },
} });
try {
  if (!a.manifest || !a.channel || !a.derivative || !a['asset-url'] || !a.state) throw new Error('usage: --manifest --channel --derivative --asset-url --state [--owner-evidence FILE]');
  const job = readJob(a.manifest);
  const target = job.targets.find(t => t.channelId === a.channel);
  if (!target) throw new Error(`job has no target for channel ${a.channel}`);
  const input = buildCreatePostInput({ payload: approvalPayload({ job, target, derivative: await derivativeOf(a.derivative, target.platform) }), assetUrl: a['asset-url'] });
  const release = acquireLock(a.state);
  try {
    const ledger = openLedger(a.state);
    const key = targetKey({ job, target });
    const st = ledger.state(key);
    if (!['public_verification_pending', 'public_unverified'].includes(st.state) || !st.externalLink) throw new Error(`target is ${st.state}; run reconcile until Buffer reports it sent`);
    const ownerEvidence = a['owner-evidence'] ? JSON.parse(fs.readFileSync(a['owner-evidence'], 'utf8')) : null;
    const fetchPublic = async url => {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'Accept-Language': 'es-AR,es;q=0.9' } });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };
    const result = await verifyPublic({ target, input, externalLink: st.externalLink, fetchPublic, ownerEvidence });
    recordPublicVerdict(ledger, key, result, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'public_verified') process.exitCode = 1;
  } finally { release(); }
} catch (e) {
  console.error(`public verification failed: ${e.message}`);
  process.exit(1);
}
