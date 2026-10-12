// Public media hosting checks. Buffer has no upload endpoint and fetches a
// stable public HTTPS URL, possibly long after scheduling. Before each submit we
// re-download the exact bytes anonymously. Uploading to a host is a separate,
// owner-approved step this module does not perform.

import dns from 'node:dns/promises';
import net from 'node:net';
import { sha256 } from './manifest.mjs';

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function publicObjectKey(assetId, platform, derivativeSha256) {
  if (!/^[0-9a-f]{20,64}$/.test(assetId)) throw new Error('assetId must be opaque hex');
  if (!['youtube', 'tiktok'].includes(platform)) throw new Error('unknown platform');
  if (!/^[0-9a-f]{64}$/.test(derivativeSha256)) throw new Error('derivative sha256 required');
  return `v/${assetId}/${derivativeSha256.slice(0, 16)}-${platform}.mp4`;
}

export function assertPublicUrlShape(raw, { allowedHosts, answerTokens = [] }) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('media URL is not a URL'); }
  if (url.protocol !== 'https:') throw new Error('media URL must be https');
  if (url.username || url.password) throw new Error('media URL must not carry credentials');
  if (url.port) throw new Error('media URL must use the default https port');
  if (url.search || raw.includes('?')) throw new Error('media URL must not have a query string (signed or expiring URLs are not stable)');
  if (url.hash || raw.includes('#')) throw new Error('media URL must not have a fragment');
  if (!allowedHosts.includes(url.hostname)) throw new Error(`media host ${url.hostname} is not on the allowlist`);
  if (!/\.mp4$/.test(url.pathname)) throw new Error('media URL must point at an .mp4 object');
  const p = fold(decodeURIComponent(url.pathname));
  if (answerTokens.some(t => t.length >= 3 && p.includes(fold(t)))) throw new Error('media URL path reveals the answer');
  return url;
}

const blocked = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(a, p, 'ipv6');

export function isPrivateAddress(address) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = net.isIP(address);
  if (!family) return true;
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

async function readCapped(res, cap) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > cap) throw new Error(`hosted object is larger than the expected ${cap} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function verifyHostedAsset(raw, { expected, allowedHosts, answerTokens = [], lookup = (h) => dns.lookup(h, { all: true }), fetchImpl = globalThis.fetch, timeoutMs = 60000 }) {
  const url = assertPublicUrlShape(raw, { allowedHosts, answerTokens });
  const addresses = await lookup(url.hostname);
  if (!addresses?.length) throw new Error('media host does not resolve');
  for (const { address } of addresses) if (isPrivateAddress(address)) throw new Error(`media host resolves to a private or reserved address (${address})`);

  let res;
  try { res = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'video/mp4' } }); }
  catch { throw new Error('anonymous GET of the media URL failed (network/timeout)'); }
  if (res.status >= 300 && res.status < 400) throw new Error('media URL redirects; Buffer needs the direct object URL');
  if (res.status !== 200) throw new Error(`media URL returned HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('video/mp4')) throw new Error(`media URL content type is ${type || 'missing'}, not video/mp4`);
  const declared = res.headers.get('content-length');
  if (declared !== null && Number(declared) !== expected.sizeBytes) throw new Error(`hosted size ${declared} differs from the approved ${expected.sizeBytes} bytes`);
  const bytes = await readCapped(res, expected.sizeBytes);
  if (bytes.subarray(4, 8).toString('latin1') !== 'ftyp') throw new Error('hosted object is not an MP4 file');
  if (bytes.length !== expected.sizeBytes) throw new Error(`hosted size ${bytes.length} differs from the approved ${expected.sizeBytes} bytes`);
  const got = sha256(bytes);
  if (got !== expected.sha256) throw new Error('hosted bytes do not match the approved sha256');
  return { url: url.href, sha256: got, sizeBytes: bytes.length, checkedAtUtc: new Date().toISOString() };
}

export function hostingCostUsd({ sizeBytes, rates, months, fetches }) {
  const { storageUsdPerGbMonth: s, egressUsdPerGb: e } = rates ?? {};
  if (![s, e].every(x => Number.isFinite(x) && x >= 0)) throw new Error('hosting rates are unknown; record the approved host quote first');
  const gb = sizeBytes / 1e9;
  return gb * s * months + gb * e * fetches;
}

// Retention: keep until 7 days after publication AND every dependent target
// has a terminal state, and only with an owner-approved cleanup.
const TERMINAL = new Set(['public_verified', 'rejected', 'blocked', 'cancelled']);
export const RETAIN_AFTER_PUBLISH_DAYS = 7;

export function canDeleteObject({ targets, nowUtc, ownerApproved }) {
  if (!ownerApproved) return { ok: false, reason: 'cleanup needs an owner-approved decision' };
  if (!targets?.length) return { ok: false, reason: 'no recorded targets; cannot prove nothing depends on the object' };
  for (const t of targets) {
    if (!TERMINAL.has(t.state)) return { ok: false, reason: `target still ${t.state}` };
    if (Date.parse(nowUtc) < Date.parse(t.publishAtUtc) + RETAIN_AFTER_PUBLISH_DAYS * 86400000) return { ok: false, reason: 'retention window not over' };
  }
  return { ok: true };
}
