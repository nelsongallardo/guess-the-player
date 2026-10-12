// MOCK public pages. Real G6 acceptance needs an authorized smoke post and an
// actual native readback; these fixtures only prove the decision rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyPublic, recordPublicVerdict } from '../lib/verify-public.mjs';
import { initLedger, openLedger } from '../lib/ledger.mjs';

const CHANNEL = 'UCmockmockmockmockmockmo';
const LINK = 'https://www.youtube.com/shorts/abcdefghijk';
const input = { text: 'Mirá la carrera en orden, pensá tu respuesta y esperá el final.\n\nJugá más carreras en derabona.club', metadata: { youtube: { title: '¿Quién es? Adiviná al futbolista por sus clubes #shorts' } } };
const target = { platform: 'youtube', nativeAccount: CHANNEL, privacy: 'public' };

function ytPage(over = {}, micro = {}, playable = 'OK') {
  const pr = {
    playabilityStatus: { status: playable },
    videoDetails: { videoId: 'abcdefghijk', channelId: CHANNEL, title: input.metadata.youtube.title, shortDescription: input.text, isPrivate: false, ...over },
    microformat: { playerMicroformatRenderer: { isUnlisted: false, ...micro } },
  };
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(pr)};var meta = {};</script></html>`;
}
const evidence = (over = {}) => ({ observedBy: 'Nelson', observedAtUtc: '2026-10-19T16:20:00Z', url: LINK, playable: true, careerOrderOk: true, revealOk: true, disclosureVisible: true, audioOk: true, ...over });
const check = (page, ev = evidence(), t = target, link = LINK) => verifyPublic({ target: t, input, externalLink: link, fetchPublic: async () => page, ownerEvidence: ev });

test('machine checks plus complete owner evidence verify a public Short', async () => {
  const r = await check(ytPage());
  assert.equal(r.verdict, 'public_verified', r.reasons.join());
});

test('wrong native author, edited caption or title, private/unlisted and unplayable videos do not verify', async () => {
  for (const [label, page, re] of [
    ['author', ytPage({ channelId: 'UCsomeoneelse' }), /channel/],
    ['caption', ytPage({ shortDescription: `${input.text} (edited)` }), /description/],
    ['title', ytPage({ title: 'Otro título' }), /title/],
    ['private', ytPage({ isPrivate: true }), /private|public/],
    ['unlisted', ytPage({}, { isUnlisted: true }), /unlisted|public/],
    ['unplayable', ytPage({}, {}, 'ERROR'), /playable/],
    ['video id', ytPage({ videoId: 'zzzzzzzzzzz' }), /video/],
  ]) {
    const r = await check(page);
    assert.equal(r.verdict, 'public_unverified', label);
    assert.ok(r.reasons.some(x => re.test(x)), `${label}: ${r.reasons.join(' | ')}`);
  }
});

test('reveal, career order, audio or disclosure problems seen by the owner block verification', async () => {
  for (const k of ['playable', 'careerOrderOk', 'revealOk', 'disclosureVisible', 'audioOk']) {
    const r = await check(ytPage(), evidence({ [k]: false }));
    assert.equal(r.verdict, 'public_unverified', k);
  }
  assert.equal((await check(ytPage(), null)).verdict, 'public_unverified');
  assert.equal((await check(ytPage(), evidence({ url: 'https://www.youtube.com/shorts/zzzzzzzzzzz' }))).verdict, 'public_unverified');
});

test('a bot wall or consent page is recorded as unverified, never verified', async () => {
  const r = await check('<html><form action="https://consent.youtube.com/save">Before you continue</form></html>');
  assert.equal(r.verdict, 'public_unverified');
  assert.ok(r.reasons.some(x => /could not be read|bot|consent/.test(x)));
  const thrown = await verifyPublic({ target, input, externalLink: LINK, fetchPublic: async () => { throw new Error('HTTP 429'); }, ownerEvidence: evidence() });
  assert.equal(thrown.verdict, 'public_unverified');
});

test('an intentionally private smoke test cannot satisfy public acceptance', async () => {
  const r = await check(ytPage({ isPrivate: true }), evidence(), { ...target, privacy: 'private' });
  assert.equal(r.verdict, 'public_unverified');
  assert.ok(r.reasons.some(x => /non-public/.test(x)));
});

test('non-native permalinks and TikTok are refused', async () => {
  assert.equal((await check(ytPage(), evidence({ url: 'https://evil.example.com/shorts/abcdefghijk' }), target, 'https://evil.example.com/shorts/abcdefghijk')).verdict, 'public_unverified');
  const t = await verifyPublic({ target: { platform: 'tiktok', nativeAccount: '@mock', privacy: 'public_to_everyone' }, input, externalLink: 'https://www.tiktok.com/@mock/video/123', fetchPublic: async () => '', ownerEvidence: evidence() });
  assert.equal(t.verdict, 'public_unverified');
});

test('the verdict is appended to the target ledger', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-public-'));
  initLedger(dir);
  const r = await check(ytPage());
  recordPublicVerdict(openLedger(dir), 'k1', r, '2026-10-19T16:25:00Z');
  assert.equal(openLedger(dir).state('k1').state, 'public_verified');
});
