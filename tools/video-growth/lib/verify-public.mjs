// Public delivery evidence. Buffer's `sent` only starts this step. A target is
// `public_verified` only when the native public page shows the exact account,
// title, description and public visibility AND the owner has recorded watching
// it (playback, career order, reveal timing, audio, visible AI disclosure).
// Anything unreadable stays `public_unverified` with reasons.

import { TIKTOK_BLOCK } from './buffer.mjs';

const YT_LINK = /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=)([A-Za-z0-9_-]{11})$|^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})$/;
const OWNER_CHECKS = ['playable', 'careerOrderOk', 'revealOk', 'audioOk', 'disclosureVisible'];

// Balanced-brace JSON extraction after a marker, string-aware.
export function extractJsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function ownerReasons(ev, externalLink) {
  if (!ev) return ['owner observation not recorded (playback, career order, reveal, audio, disclosure)'];
  const r = [];
  if (ev.url !== externalLink) r.push('owner evidence is for a different URL');
  if (typeof ev.observedBy !== 'string' || !ev.observedBy || typeof ev.observedAtUtc !== 'string') r.push('owner evidence lacks observer/time');
  for (const k of OWNER_CHECKS) if (ev[k] !== true) r.push(`owner did not confirm ${k}`);
  return r;
}

export async function verifyPublic({ target, input, externalLink, fetchPublic, ownerEvidence }) {
  const reasons = [];
  const done = machine => ({ verdict: reasons.length ? 'public_unverified' : 'public_verified', reasons, machine, ownerEvidence: ownerEvidence ?? null });
  if (target.platform === 'tiktok') { reasons.push(TIKTOK_BLOCK); return done(null); }
  const m = (externalLink ?? '').match(YT_LINK);
  if (!m) { reasons.push('permalink is not a native YouTube video URL'); return done(null); }
  const videoId = m[1] ?? m[2];
  if (target.privacy !== 'public') reasons.push(`target privacy is ${target.privacy}: an intentionally non-public smoke cannot satisfy public acceptance`);

  let html;
  try { html = await fetchPublic(`https://www.youtube.com/watch?v=${videoId}`); }
  catch (e) { reasons.push(`public page could not be read (${String(e.message).slice(0, 80)}); ask the owner for evidence`); return done(null); }
  const pr = extractJsonAfter(html ?? '', 'ytInitialPlayerResponse');
  if (!pr?.videoDetails) { reasons.push('public page could not be read (bot wall or consent page); ask the owner for evidence'); return done(null); }

  const v = pr.videoDetails;
  const micro = pr.microformat?.playerMicroformatRenderer ?? {};
  const machine = { videoId: v.videoId, channelId: v.channelId, title: v.title, isPrivate: v.isPrivate, isUnlisted: micro.isUnlisted, playability: pr.playabilityStatus?.status };
  if (v.videoId !== videoId) reasons.push('public video ID differs from the permalink');
  if (v.channelId !== target.nativeAccount) reasons.push(`public channel ${v.channelId} is not the approved channel`);
  if (v.title !== input.metadata.youtube.title) reasons.push('public title differs from the approved title');
  // The only normalization allowed: YouTube serves descriptions with \n line endings.
  if ((v.shortDescription ?? '').replace(/\r\n/g, '\n') !== input.text.replace(/\r\n/g, '\n')) reasons.push('public description differs from the approved text');
  if (target.privacy === 'public' && (v.isPrivate === true || micro.isUnlisted === true)) reasons.push('video is private or unlisted, not public');
  if (pr.playabilityStatus?.status !== 'OK') reasons.push(`video is not playable (${pr.playabilityStatus?.status ?? 'unknown'})`);
  reasons.push(...ownerReasons(ownerEvidence, externalLink));
  return done(machine);
}

export function recordPublicVerdict(ledger, key, result, nowUtc) {
  ledger.append({ type: 'public', key, verdict: result.verdict, reasons: result.reasons, machine: result.machine, ownerEvidence: result.ownerEvidence, at: nowUtc });
}
