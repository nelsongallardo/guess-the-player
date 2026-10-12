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

test('non-native permalinks are refused', async () => {
  assert.equal((await check(ytPage(), evidence({ url: 'https://evil.example.com/shorts/abcdefghijk' }), target, 'https://evil.example.com/shorts/abcdefghijk')).verdict, 'public_unverified');
});

// TikTok: the official oEmbed endpoint answers only for public videos and names
// the author and caption. Privacy, interactions and the promotional label are
// not machine-readable, so the owner's observation must confirm each one.
const TT_LINK = 'https://www.tiktok.com/@derabona.club/video/7300000000000000000';
const ttTarget = { platform: 'tiktok', nativeAccount: '@derabona.club', privacy: 'public_to_everyone', interactions: { comments: true, duet: false, stitch: false }, disclosures: { aiGenerated: true, promotional: true } };
const ttInput = { text: 'Cinco clubes, un jugador. ¿Lo sacás? #futbol #quienes' };
const oembed = (over = {}) => JSON.stringify({ author_unique_id: 'derabona.club', author_url: 'https://www.tiktok.com/@derabona.club', title: ttInput.text, embed_product_id: '7300000000000000000', ...over });
const ttEvidence = (over = {}) => evidence({ url: TT_LINK, privacyOk: true, interactionsOk: true, promotionalLabelVisible: true, ...over });
const ttCheck = (body, ev = ttEvidence(), t = ttTarget, link = TT_LINK) => {
  const urls = [];
  return verifyPublic({ target: t, input: ttInput, externalLink: link, fetchPublic: async u => { urls.push(u); if (body instanceof Error) throw body; return body; }, ownerEvidence: ev }).then(r => ({ ...r, urls }));
};

test('a TikTok post verifies from the official oEmbed author and caption plus the owner confirming the hand-set controls', async () => {
  const r = await ttCheck(oembed());
  assert.equal(r.verdict, 'public_verified', r.reasons.join());
  assert.deepEqual(r.urls, [`https://www.tiktok.com/oembed?url=${encodeURIComponent(TT_LINK)}`]);
});

test('a TikTok post stays unverified on any machine mismatch or a missing owner confirmation', async () => {
  const cases = [
    [oembed({ author_unique_id: 'someoneelse' })],
    [oembed({ title: 'otro texto' })],
    [oembed({ embed_product_id: '1' })],
    ['<html>not json</html>'],
    [new Error('HTTP 404')],
    [oembed(), ttEvidence({ privacyOk: false })],
    [oembed(), ttEvidence({ interactionsOk: undefined })],
    [oembed(), ttEvidence({ promotionalLabelVisible: false })],
    [oembed(), ttEvidence({ disclosureVisible: false })],
    [oembed(), null],
    [oembed(), ttEvidence(), { ...ttTarget, privacy: 'self_only' }],
    [oembed(), ttEvidence({ url: 'https://www.tiktok.com/@someoneelse/video/7300000000000000000' }), ttTarget, 'https://www.tiktok.com/@someoneelse/video/7300000000000000000'],
  ];
  for (const [body, ev, t, link] of cases) {
    const r = await ttCheck(body, ev === undefined ? ttEvidence() : ev, t, link);
    assert.equal(r.verdict, 'public_unverified', JSON.stringify([String(body).slice(0, 40), ev, t?.privacy, link]));
  }
});

test('the verdict is appended to the target ledger', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-public-'));
  initLedger(dir);
  const r = await check(ytPage());
  recordPublicVerdict(openLedger(dir), 'k1', r, '2026-10-19T16:25:00Z');
  assert.equal(openLedger(dir).state('k1').state, 'public_verified');
});
