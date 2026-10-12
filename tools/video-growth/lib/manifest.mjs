// Versioned job manifest + the one canonical serialization every digest uses.
// A digest binds approval to exact bytes, so serialization must be total and
// unambiguous: sorted keys, explicit nulls, no undefined/NaN/Dates/classes.

import crypto from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const PLATFORMS = Object.freeze(['youtube', 'tiktok']);

// YouTube values are Buffer's YoutubePrivacy enum. TikTok values are TikTok's
// own privacy levels; Buffer cannot send them today (see lib/buffer.mjs), but
// the owner's choice must still be recorded explicitly.
export const PRIVACY = Object.freeze({
  youtube: ['public', 'unlisted', 'private'],
  tiktok: ['public_to_everyone', 'mutual_follow_friends', 'follower_of_creator', 'self_only'],
});

// Second-precision ISO UTC with a literal Z. One spelling per instant keeps
// digests stable.
export const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export function isUtc(value) {
  return typeof value === 'string' && UTC_RE.test(value) && new Date(value).toISOString().replace('.000Z', 'Z') === value;
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: numbers must be finite');
    return JSON.stringify(value);
  }
  if (value === undefined) throw new Error('canonicalJson: undefined is not allowed; use explicit null');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new Error('canonicalJson: only plain objects, arrays and primitives are allowed');
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function digest(value) {
  return sha256(canonicalJson(value));
}

const LICENSE_KEYS = ['ttsProvider', 'ttsPlan', 'ttsCommercialUse', 'voiceId', 'modelId', 'evidence', 'crests', 'music'];

// Structural validation. Returns a list of errors (empty = valid). License
// fields may be null while a job is being prepared; lib/approval.mjs requires
// them to be complete before any receipt can be issued.
export function validateJob(job) {
  const errors = [];
  const err = m => errors.push(m);
  if (!job || typeof job !== 'object') return ['job must be an object'];
  if (job.schemaVersion !== SCHEMA_VERSION) err(`schemaVersion must be ${SCHEMA_VERSION}`);
  for (const k of ['campaignId', 'jobId']) if (typeof job[k] !== 'string' || !/^[a-z0-9-]+$/.test(job[k])) err(`${k} must be a lowercase slug`);
  if (typeof job.assetId !== 'string' || !/^[0-9a-f]{20,64}$/.test(job.assetId)) err('assetId must be an opaque hex id');

  const s = job.source;
  if (!s || typeof s !== 'object') err('source is required');
  else {
    if (!/^[0-9a-f]{40}$/.test(s.commit ?? '')) err('source.commit must be a full git SHA');
    for (const k of ['indexSha256', 'rosterSha256', 'scheduleSha256', 'researchSha256']) if (!SHA_RE.test(s[k] ?? '')) err(`source.${k} must be sha256 hex`);
  }

  const c = job.career;
  if (!c || typeof c !== 'object') err('career is required');
  else {
    if (typeof c.playerId !== 'string' || !c.playerId) err('career.playerId is required');
    if (typeof c.name !== 'string' || !c.name.trim()) err('career.name is required');
    if (!Array.isArray(c.clubs) || !c.clubs.length || c.clubs.some(x => typeof x?.name !== 'string' || !x.name)) err('career.clubs must be ordered named clubs');
    if (!Array.isArray(c.evidenceSources) || !c.evidenceSources.length) err('career.evidenceSources must cite at least one source');
  }

  const l = job.license;
  if (!l || typeof l !== 'object') err('license is required');
  else {
    for (const k of LICENSE_KEYS) if (!(k in l)) err(`license.${k} must be present (null if not yet established)`);
    if (!['embedded', 'text-only'].includes(l.crests)) err('license.crests must be embedded or text-only');
    if (l.music !== 'none') err('license.music must be none until a music license is recorded');
  }

  if (!Array.isArray(job.targets) || !job.targets.length) err('targets must list at least one target');
  else job.targets.forEach((t, i) => {
    const p = `targets[${i}]`;
    if (!PLATFORMS.includes(t?.platform)) { err(`${p}.platform must be one of ${PLATFORMS.join(', ')}`); return; }
    if (typeof t.channelId !== 'string' || !t.channelId) err(`${p}.channelId is required`);
    if (typeof t.nativeAccount !== 'string' || !t.nativeAccount) err(`${p}.nativeAccount is required`);
    if (!isUtc(t.publishAtUtc)) err(`${p}.publishAtUtc must be second-precision UTC like 2026-10-19T16:00:00Z`);
    if (!PRIVACY[t.platform].includes(t.privacy)) err(`${p}.privacy must be an explicit owner choice: ${PRIVACY[t.platform].join(', ')}`);
    if (typeof t.madeForKids !== 'boolean') err(`${p}.madeForKids must be an explicit boolean`);
    if (t.disclosures?.aiGenerated !== true) err(`${p}.disclosures.aiGenerated must be true for synthetic narration`);
    if (typeof t.disclosures?.promotional !== 'boolean') err(`${p}.disclosures.promotional must be an explicit boolean`);
    if (t.platform === 'tiktok' && (t.interactions === null || typeof t.interactions !== 'object'
      || ['comments', 'duet', 'stitch'].some(k => typeof t.interactions[k] !== 'boolean'))) {
      err(`${p}.interactions must record explicit comments/duet/stitch choices for TikTok`);
    }
  });
  return errors;
}

export function assertValidJob(job) {
  const errors = validateJob(job);
  if (errors.length) throw new Error(`invalid job manifest:\n- ${errors.join('\n- ')}`);
  return job;
}
