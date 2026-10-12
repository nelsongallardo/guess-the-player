// Local HTTP fixtures stand in for the (not yet chosen) public host. They prove
// the verifier's rules, not that any real host serves the bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { verifyHostedAsset, publicObjectKey, canDeleteObject, hostingCostUsd } from '../lib/hosting.mjs';
import { createSpendLedger } from '../lib/spend.mjs';
import { sha256 } from '../lib/manifest.mjs';
import { validConfig } from './fixtures.mjs';

const HOST = 'media.example.org';
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(4000, 7)]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-host-'));

async function server(handler) {
  const s = http.createServer(handler);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  // Route the public hostname to the local fixture; DNS is stubbed separately.
  const fetchImpl = (url, init) => fetch(String(url).replace(`https://${HOST}`, `http://127.0.0.1:${port}`), init);
  return { fetchImpl, close: () => s.close() };
}
const publicDns = async () => [{ address: '203.0.113.7', family: 4 }];
const serveBytes = (getBytes, type = 'video/mp4') => (req, res) => { const b = getBytes(); res.writeHead(200, { 'content-type': type, 'content-length': b.length }); res.end(b); };
const opts = (over = {}) => ({ expected: { sha256: sha256(MP4), sizeBytes: MP4.length }, allowedHosts: [HOST], answerTokens: ['cristiano', 'ronaldo'], lookup: publicDns, ...over });
const URL_OK = `https://${HOST}/${publicObjectKey('0123456789abcdef0123', 'youtube', sha256(MP4))}`;

test('opaque object keys never contain the answer', () => {
  const key = publicObjectKey('0123456789abcdef0123', 'youtube', sha256(MP4));
  assert.match(key, /^v\/[0-9a-f]{20}\/[0-9a-f]{16}-youtube\.mp4$/);
  assert.throws(() => publicObjectKey('cristiano-ronaldo', 'youtube', sha256(MP4)), /opaque/);
});

test('exact public MP4 bytes on an allowlisted host verify', async () => {
  const s = await server(serveBytes(() => MP4));
  try {
    const r = await verifyHostedAsset(URL_OK, opts({ fetchImpl: s.fetchImpl }));
    assert.equal(r.sha256, sha256(MP4));
  } finally { s.close(); }
});

test('signed, query, credential, non-https, odd-port and unlisted URLs are refused before fetching', async () => {
  let fetched = 0;
  const fetchImpl = async () => { fetched++; throw new Error('should not fetch'); };
  for (const url of [
    `${URL_OK}?X-Amz-Expires=3600&X-Amz-Signature=abc`, `${URL_OK}?token=x`, `${URL_OK}#frag`,
    `https://user:pw@${HOST}/v/a.mp4`, `http://${HOST}/v/a.mp4`, `https://${HOST}:8443/v/a.mp4`,
    'https://evil.example.net/v/a.mp4', `https://${HOST}/v/cristiano-ronaldo.mp4`, `https://${HOST}/v/a.html`,
  ]) await assert.rejects(verifyHostedAsset(url, opts({ fetchImpl })), url);
  assert.equal(fetched, 0);
});

test('hosts resolving to private, loopback or metadata addresses are refused (SSRF)', async () => {
  let fetched = 0;
  const fetchImpl = async () => { fetched++; throw new Error('should not fetch'); };
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    const lookup = async () => [{ address, family: address.includes(':') ? 6 : 4 }];
    await assert.rejects(verifyHostedAsset(URL_OK, opts({ fetchImpl, lookup })), /private|address/, address);
  }
  assert.equal(fetched, 0);
});

test('redirects, HTML, wrong type, missing objects and changed bytes fail', async () => {
  const cases = [
    [(req, res) => { res.writeHead(302, { location: 'https://elsewhere.example.org/x.mp4' }); res.end(); }, /redirect/],
    [serveBytes(() => Buffer.from('<!doctype html><title>login</title>'), 'text/html'), /type|MP4/],
    [serveBytes(() => Buffer.from('<!doctype html>'), 'video/mp4'), /MP4|size/],
    [serveBytes(() => Buffer.from('<!doctype html>'.padEnd(MP4.length, ' ')), 'video/mp4'), /not an MP4/],
    [(req, res) => { res.writeHead(404); res.end(); }, /404/],
    [(req, res) => { res.writeHead(403); res.end(); }, /403/],
    [serveBytes(() => Buffer.concat([MP4.subarray(0, 100), Buffer.alloc(MP4.length - 100, 9)])), /sha256|bytes/],
  ];
  for (const [handler, re] of cases) {
    const s = await server(handler);
    try { await assert.rejects(verifyHostedAsset(URL_OK, opts({ fetchImpl: s.fetchImpl })), re); } finally { s.close(); }
  }
});

test('a late fetch catches bytes replaced after the first check', async () => {
  let bytes = MP4;
  const s = await server(serveBytes(() => bytes));
  try {
    await verifyHostedAsset(URL_OK, opts({ fetchImpl: s.fetchImpl }));
    bytes = Buffer.concat([MP4, Buffer.from('x')]);
    await assert.rejects(verifyHostedAsset(URL_OK, opts({ fetchImpl: s.fetchImpl })), /size|sha256/);
  } finally { s.close(); }
});

test('hosting cost needs known rates and fits under the cap', () => {
  assert.throws(() => hostingCostUsd({ sizeBytes: 5e7, rates: { storageUsdPerGbMonth: null, egressUsdPerGb: 0.01 }, months: 1, fetches: 10 }), /unknown/);
  const usd = hostingCostUsd({ sizeBytes: 5e7, rates: { storageUsdPerGbMonth: 0.015, egressUsdPerGb: 0.09 }, months: 1, fetches: 10 });
  assert.ok(usd > 0 && usd < 0.1);
  const spend = createSpendLedger(path.join(tmp(), 'spend.json'), validConfig({ caps: { variableUsd: 0.01, ttsCharacters: 0 } }));
  assert.throws(() => spend.reserveOther({ kind: 'hosting', key: 'k', usd: null }), /unknown/);
  assert.throws(() => spend.reserveOther({ kind: 'hosting', key: 'k', usd }), /cap/);
});

test('objects are deletable only when every dependent target is resolved, aged and owner-approved', () => {
  const base = { nowUtc: '2026-10-27T00:00:00Z', ownerApproved: true };
  const t = (state, publishAtUtc = '2026-10-19T16:00:00Z') => ({ state, publishAtUtc });
  assert.equal(canDeleteObject({ ...base, targets: [t('public_verified'), t('rejected')] }).ok, true);
  assert.equal(canDeleteObject({ ...base, ownerApproved: false, targets: [t('public_verified')] }).ok, false);
  for (const pending of ['intent', 'uncertain', 'scheduled', 'sending', 'sent', 'public_verification_pending', 'public_unverified']) {
    assert.equal(canDeleteObject({ ...base, targets: [t('public_verified'), t(pending)] }).ok, false, pending);
  }
  assert.equal(canDeleteObject({ ...base, targets: [t('public_verified', '2026-10-21T16:00:00Z')] }).ok, false);
  assert.equal(canDeleteObject({ ...base, targets: [] }).ok, false);
});
