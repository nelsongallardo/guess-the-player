// Real dependencies for the publish/reconcile CLIs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './manifest.mjs';
import { readSnapshot, compareLive, fetchLiveHtml } from './source.mjs';
import { stillValid } from './select.mjs';
import { verifyHostedAsset } from './hosting.mjs';
import { ffprobeJson } from './probe.mjs';

export const REPO = process.env.DERABONA_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function derivativeOf(file, platform) {
  const bytes = fs.readFileSync(file);
  const probe = await ffprobeJson(file);
  return { platform, sha256: sha256(bytes), sizeBytes: bytes.length, durationSec: Number(probe.format.duration) };
}

// Fresh upstream (caller must `git fetch` first) and the live public page.
export function sourceChecker({ ref = 'origin/main' } = {}) {
  return async (job, nowUtc) => {
    const errors = stillValid(job, readSnapshot({ repo: REPO, commit: ref }), { nowUtc });
    try {
      const live = compareLive(readSnapshot({ repo: REPO, commit: ref }), await fetchLiveHtml());
      if (!live.ok) errors.push(`live derabona.club differs from ${ref} (roster ${live.rosterMatches}, schedule ${live.scheduleMatches}); review before sending`);
    } catch (e) { errors.push(`could not read the live site: ${e.message}`); }
    return errors;
  };
}

export function hostVerifier(config, job) {
  const answerTokens = job.career.name.split(/\s+/);
  return (url, { expected }) => verifyHostedAsset(url, { expected, allowedHosts: config.hosting.allowedHosts, answerTokens });
}
