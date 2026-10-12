// Owner approval receipts. A receipt binds one target's complete payload
// (source, career, script, rights, derivative bytes, account, privacy,
// interactions, disclosures, UTC slot) by canonical digest. Any change
// afterwards — however small — means a new review.

import fs from 'node:fs';
import path from 'node:path';
import { assertValidJob, digest, isUtc } from './manifest.mjs';
import { buildScript, validateScript } from './script.mjs';

const VOICE_ID = { elevenlabs: /^[A-Za-z0-9]{10,40}$/, azure: /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/ };

export function licenseComplete(l) {
  return !!l && Object.hasOwn(VOICE_ID, l.ttsProvider ?? '') && typeof l.ttsPlan === 'string' && !!l.ttsPlan.trim()
    && l.ttsCommercialUse === true && VOICE_ID[l.ttsProvider].test(l.voiceId ?? '')
    && typeof l.modelId === 'string' && !!l.modelId && typeof l.evidence === 'string' && !!l.evidence.trim();
}

export function approvalPayload({ job, target, derivative }) {
  assertValidJob(job);
  if (!licenseComplete(job.license)) throw new Error('license is incomplete: commercial TTS provider, plan, voice, model and evidence must be recorded');
  if (!job.targets.includes(target)) throw new Error('target is not part of this job');
  if (target.channelId.startsWith('sample-') || target.nativeAccount.startsWith('sample-')) throw new Error('sample placeholder targets are for review renders only and cannot be approved');
  if (derivative?.platform !== target.platform || !/^[0-9a-f]{64}$/.test(derivative.sha256 ?? '')) throw new Error('derivative must be the hashed render for this platform');
  const script = buildScript(job.career, target.platform);
  const errors = validateScript(script, job.career);
  if (errors.length) throw new Error(`script rejected: ${errors.join('; ')}`);
  return {
    schemaVersion: 1,
    campaignId: job.campaignId, jobId: job.jobId, assetId: job.assetId,
    source: job.source,
    career: job.career,
    script,
    license: job.license,
    derivative: { platform: derivative.platform, sha256: derivative.sha256, sizeBytes: derivative.sizeBytes, durationSec: derivative.durationSec },
    target: {
      platform: target.platform, channelId: target.channelId, nativeAccount: target.nativeAccount,
      publishAtUtc: target.publishAtUtc, privacy: target.privacy, madeForKids: target.madeForKids,
      interactions: target.interactions, disclosures: target.disclosures,
    },
  };
}

export function issueReceipt({ payload, approver, confirmDigest, nowUtc, expiresAtUtc }) {
  const d = digest(payload);
  if (confirmDigest !== d) throw new Error('approval must quote the exact digest shown by --review-only');
  if (typeof approver !== 'string' || !approver.trim()) throw new Error('approver is required');
  if (!isUtc(nowUtc) || !isUtc(expiresAtUtc) || expiresAtUtc <= nowUtc) throw new Error('expiresAtUtc must be a UTC time after now');
  if (expiresAtUtc > payload.target.publishAtUtc) throw new Error('approval must expire no later than the intended publication time');
  return {
    schemaVersion: 1, digest: d, approver: approver.trim(), approvedAtUtc: nowUtc, expiresAtUtc,
    assetId: payload.assetId, platform: payload.target.platform, channelId: payload.target.channelId, publishAtUtc: payload.target.publishAtUtc,
  };
}

export function verifyReceipt(receipt, payload, { nowUtc }) {
  if (!receipt) return ['no approval receipt'];
  const errors = [];
  if (receipt.digest !== digest(payload)) errors.push('payload changed since approval; a new review is required');
  if (nowUtc >= receipt.expiresAtUtc) errors.push('approval receipt expired');
  if (nowUtc >= payload.target.publishAtUtc) errors.push('intended publication time has passed');
  return errors;
}

export function appendReceipt(file, receipt) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.writeSync(fd, `${JSON.stringify(receipt)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function findReceipt(file, d) {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const receipts = lines.map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`approvals line ${i + 1} is malformed; refusing`); } });
  return receipts.filter(r => r.digest === d).at(-1) ?? null;
}
