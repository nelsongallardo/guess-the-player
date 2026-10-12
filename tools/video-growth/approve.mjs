#!/usr/bin/env node
// Show (or, with explicit owner input, record) the approval for one target.
//
//   node approve.mjs --manifest JOB.json --platform youtube --derivative OUT.mp4 --state DIR --review-only
//   node approve.mjs ... --approve --approver Nelson --digest <hex from review> --expires 2026-10-19T15:00:00Z
//
// --review-only never writes. --approve refuses unless the quoted digest matches
// the current payload exactly, so a bare "yes" after a change cannot approve.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJob } from './lib/job.mjs';
import { approvalPayload, issueReceipt, appendReceipt } from './lib/approval.mjs';
import { digest, sha256 } from './lib/manifest.mjs';
import { ffprobeJson } from './lib/probe.mjs';

const { values: a } = parseArgs({ options: {
  manifest: { type: 'string' }, platform: { type: 'string' }, derivative: { type: 'string' }, state: { type: 'string' },
  'review-only': { type: 'boolean' }, approve: { type: 'boolean' }, approver: { type: 'string' }, digest: { type: 'string' }, expires: { type: 'string' },
} });
if (!a.manifest || !a.platform || !a.derivative || !a.state || a['review-only'] === a.approve) {
  console.error('usage: approve.mjs --manifest JOB.json --platform P --derivative MP4 --state DIR (--review-only | --approve --approver NAME --digest HEX --expires UTC)');
  process.exit(2);
}
try {
  const job = readJob(a.manifest);
  const target = job.targets.find(t => t.platform === a.platform);
  if (!target) throw new Error(`job has no ${a.platform} target`);
  const bytes = fs.readFileSync(a.derivative);
  const probe = await ffprobeJson(a.derivative);
  const payload = approvalPayload({ job, target, derivative: { platform: a.platform, sha256: sha256(bytes), sizeBytes: bytes.length, durationSec: Number(probe.format.duration) } });
  const d = digest(payload);
  console.log(JSON.stringify({ ...payload, career: { ...payload.career, note: 'private: never publish this manifest' } }, null, 2));
  console.log(`digest: ${d}`);
  if (a['review-only']) process.exit(0);
  if (!a.approver || !a.digest || !a.expires) throw new Error('--approve needs --approver, --digest and --expires');
  const receipt = issueReceipt({ payload, approver: a.approver, confirmDigest: a.digest, nowUtc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), expiresAtUtc: a.expires });
  appendReceipt(path.join(a.state, 'approvals.jsonl'), receipt);
  console.log(`recorded approval ${receipt.digest} by ${receipt.approver}, expires ${receipt.expiresAtUtc}`);
} catch (e) {
  console.error(`approval refused: ${e.message}`);
  process.exit(1);
}
