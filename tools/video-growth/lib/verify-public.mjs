// Public delivery evidence. Buffer's `sent` only starts this step. A target is
// `public_verified` only when the native public page shows the exact account,
// title, description and public visibility AND the owner has recorded watching
// it (playback, career order, reveal timing, audio, visible AI disclosure).
// Anything unreadable stays `public_unverified` with reasons.
//
// TikTok: the official oEmbed endpoint (public videos only) supplies author,
// caption and video ID. Privacy, comment/Duet/Stitch and the promotional label
// were set by hand in Buffer and are not machine-readable, so the owner's
// observation must confirm each of them.

const YT_LINK = /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=)([A-Za-z0-9_-]{11})$|^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})$/;
const TT_LINK = /^https:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/video\/(\d+)$/;
const OWNER_CHECKS = ['playable', 'careerOrderOk', 'revealOk', 'audioOk', 'disclosureVisible'];
const TIKTOK_OWNER_CHECKS = ['privacyOk', 'interactionsOk'];

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

function ownerReasons(ev, externalLink, checks = OWNER_CHECKS) {
  if (!ev) return [`owner observation not recorded (${checks.join(', ')})`];
  const r = [];
  if (ev.url !== externalLink) r.push('owner evidence is for a different URL');
  if (typeof ev.observedBy !== 'string' || !ev.observedBy || typeof ev.observedAtUtc !== 'string') r.push('owner evidence lacks observer/time');
  for (const k of checks) if (ev[k] !== true) r.push(`owner did not confirm ${k}`);
  return r;
}

async function verifyTiktok({ target, input, externalLink, fetchPublic, ownerEvidence }, reasons) {
  const m = (externalLink ?? '').match(TT_LINK);
  const handle = String(target.nativeAccount ?? '').replace(/^@/, '');
  if (!m) { reasons.push('permalink is not a native TikTok video URL'); return null; }
  if (m[1] !== handle) { reasons.push('permalink is not on the approved TikTok account'); return null; }
  if (target.privacy !== 'public_to_everyone') reasons.push(`target privacy is ${target.privacy}: an intentionally non-public smoke cannot satisfy public acceptance`);
  let o;
  try { o = JSON.parse(await fetchPublic(`https://www.tiktok.com/oembed?url=${encodeURIComponent(externalLink)}`)); }
  catch (e) { reasons.push(`TikTok oEmbed could not be read (${String(e.message).slice(0, 80)}); the video may not be public`); }
  const machine = o ? { author: o.author_unique_id ?? null, videoId: o.embed_product_id ?? null, title: o.title ?? null } : null;
  if (machine) {
    if (machine.author !== handle) reasons.push(`public author ${machine.author} is not the approved account`);
    if (machine.videoId !== m[2]) reasons.push('public video ID differs from the permalink');
    if ((machine.title ?? '').trim() !== input.text.trim()) reasons.push('public caption differs from the approved text');
  }
  const checks = [...OWNER_CHECKS, ...TIKTOK_OWNER_CHECKS, ...(target.disclosures?.promotional === true ? ['promotionalLabelVisible'] : [])];
  reasons.push(...ownerReasons(ownerEvidence, externalLink, checks));
  return machine;
}

export async function verifyPublic({ target, input, externalLink, fetchPublic, ownerEvidence }) {
  const reasons = [];
  const done = machine => ({ verdict: reasons.length ? 'public_unverified' : 'public_verified', reasons, machine, ownerEvidence: ownerEvidence ?? null });
  if (target.platform === 'tiktok') return done(await verifyTiktok({ target, input, externalLink, fetchPublic, ownerEvidence }, reasons));
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
