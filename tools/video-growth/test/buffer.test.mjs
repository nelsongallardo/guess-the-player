// MOCK Buffer responses only. Nothing here proves an account, channel, quota or
// delivery; G1/G6 need authenticated read-only evidence and a real smoke test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCreatePostInput, assertSupportedInput, createBufferClient, assertChannelMatches, classifyReadback, BUFFER_ENDPOINT } from '../lib/buffer.mjs';
import { approvalPayload } from '../lib/approval.mjs';
import { validJob, HEX } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'buffer_mock_secret_key_987';
const URL_OK = 'https://media.example.org/v/0123456789abcdef0123/dddddddddddddddd-youtube.mp4';

const licensed = () => validJob({ license: { ttsProvider: 'elevenlabs', ttsPlan: 'creator', ttsCommercialUse: true, voiceId: 'MockVoice0123456789', modelId: 'eleven_multilingual_v2', evidence: 'mock', crests: 'embedded', music: 'none' } });
const ytPayload = (mut = () => {}) => { const j = licensed(); mut(j); return approvalPayload({ job: j, target: j.targets[0], derivative: { platform: 'youtube', sha256: HEX('d'), sizeBytes: 10, durationSec: 25 } }); };
const ttPayload = () => {
  const j = licensed();
  j.targets = [{ platform: 'tiktok', channelId: 'mock-tt', nativeAccount: '@mockhandle', publishAtUtc: '2026-10-19T16:00:00Z', privacy: 'public_to_everyone', madeForKids: false, interactions: { comments: true, duet: false, stitch: false }, disclosures: { aiGenerated: true, promotional: true } }];
  return approvalPayload({ job: j, target: j.targets[0], derivative: { platform: 'tiktok', sha256: HEX('d'), sizeBytes: 10, durationSec: 25 } });
};

test('YouTube maps to the documented automatic, custom-scheduled Shorts input', () => {
  const p = ytPayload();
  const input = buildCreatePostInput({ payload: p, assetUrl: URL_OK });
  assert.deepEqual(input, {
    channelId: 'mock-yt-channel', text: p.script.caption,
    assets: [{ video: { url: URL_OK } }],
    schedulingType: 'automatic', mode: 'customScheduled', dueAt: '2026-10-19T16:00:00Z',
    saveToDraft: false, needsApproval: false, aiAssisted: true,
    metadata: { youtube: { title: p.script.title, categoryId: '17', privacy: 'public', madeForKids: false, license: 'youtube', embeddable: true, notifySubscribers: false, isAiGenerated: true } },
  });
});

test('privacy and audience are never defaulted', () => {
  assert.throws(() => buildCreatePostInput({ payload: { ...ytPayload(), target: { ...ytPayload().target, privacy: undefined } }, assetUrl: URL_OK }), /privacy/);
  assert.throws(() => buildCreatePostInput({ payload: { ...ytPayload(), target: { ...ytPayload().target, madeForKids: undefined } }, assetUrl: URL_OK }), /madeForKids/);
});

const TT_URL = URL_OK.replace('youtube', 'tiktok');

// Owner-approved 2026-10-12: TikTok goes only as a Buffer draft. Buffer's API
// cannot carry TikTok privacy, comment/Duet/Stitch or the promotional label, so
// the owner sets them in Buffer and schedules; the tool can never auto-publish.
test('TikTok maps to a Buffer draft carrying only the AI label; the owner finishes the native controls', () => {
  const p = ttPayload();
  assert.deepEqual(buildCreatePostInput({ payload: p, assetUrl: TT_URL }), {
    channelId: 'mock-tt', text: p.script.caption,
    assets: [{ video: { url: TT_URL } }],
    schedulingType: 'automatic', mode: 'customScheduled', dueAt: '2026-10-19T16:00:00Z',
    saveToDraft: true, needsApproval: false, aiAssisted: true,
    metadata: { tiktok: { isAiGenerated: true } },
  });
});

test('a TikTok input that could schedule itself or carries invented fields is refused', () => {
  const ok = buildCreatePostInput({ payload: ttPayload(), assetUrl: TT_URL });
  const bad = [
    { ...ok, saveToDraft: false },
    { ...ok, metadata: { tiktok: { isAiGenerated: true, privacyLevel: 'PUBLIC_TO_EVERYONE' } } },
    { ...ok, metadata: { tiktok: { isAiGenerated: false } } },
    { ...ok, metadata: { youtube: {} } },
    { ...ok, schedulingType: 'notification' },
    { ...ok, needsApproval: true },
  ];
  for (const input of bad) assert.throws(() => assertSupportedInput(input, 'tiktok'), JSON.stringify(input).slice(0, 80));
  const noChoices = ttPayload(); noChoices.target.interactions = null;
  assert.throws(() => buildCreatePostInput({ payload: noChoices, assetUrl: TT_URL }), /interactions/);
  const noPrivacy = ttPayload(); noPrivacy.target.privacy = 'public';
  assert.throws(() => buildCreatePostInput({ payload: noPrivacy, assetUrl: TT_URL }), /privacy/);
});

test('TikTok readback: a draft waits for the owner, the AI label must survive, sent needs our native permalink', () => {
  const input = buildCreatePostInput({ payload: ttPayload(), assetUrl: TT_URL });
  const post = over => ({ id: 'post_t', status: 'draft', text: input.text, dueAt: input.dueAt, schedulingType: 'automatic', notificationStatus: null, channelId: 'mock-tt', channelService: 'tiktok',
    assets: [{ source: TT_URL }], metadata: { __typename: 'TiktokPostMetadata', isAiGenerated: true }, sentAt: null, externalLink: null, ...over });
  const cls = over => classifyReadback(post(over), { postId: 'post_t', input, platform: 'tiktok', nativeAccount: '@mockhandle' });
  assert.equal(cls({}).state, 'awaiting_owner_finish');
  assert.equal(cls({ status: 'scheduled' }).state, 'scheduled');
  assert.equal(cls({ status: 'sent', sentAt: '2026-10-19T16:00:04Z', externalLink: 'https://www.tiktok.com/@mockhandle/video/7300000000000000000' }).state, 'public_verification_pending');
  assert.throws(() => cls({ metadata: { __typename: 'TiktokPostMetadata', isAiGenerated: false } }), /TikTok metadata/);
  assert.throws(() => cls({ status: 'sent', sentAt: '2026-10-19T16:00:04Z', externalLink: 'https://www.tiktok.com/@someoneelse/video/7300000000000000000' }), /permalink/);
});

test('invented fields, thumbnail URLs, notification mode and drafts are rejected', () => {
  const ok = buildCreatePostInput({ payload: ytPayload(), assetUrl: URL_OK });
  const bad = [
    { ...ok, metadata: { ...ok.metadata, tiktok: { isAiGenerated: true, privacyLevel: 'PUBLIC_TO_EVERYONE' } } },
    { ...ok, metadata: { youtube: { ...ok.metadata.youtube, commentsDisabled: true } } },
    { ...ok, assets: [{ video: { url: URL_OK, thumbnailUrl: 'https://media.example.org/t.png' } }] },
    { ...ok, assets: [{ video: { url: URL_OK, metadata: { thumbnailOffset: 0 } } }] },
    { ...ok, assets: [{ video: { url: URL_OK } }, { video: { url: URL_OK } }] },
    { ...ok, schedulingType: 'notification' },
    { ...ok, saveToDraft: true },
    { ...ok, mode: 'shareNow' },
    { ...ok, replyTo: 'x' },
  ];
  for (const input of bad) assert.throws(() => assertSupportedInput(input, 'youtube'), JSON.stringify(input).slice(0, 80));
});

function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  fn.calls = calls;
  return fn;
}

test('createPost: success, typed mutation errors, GraphQL errors at HTTP 200 and transport failures are distinguished', async () => {
  const input = buildCreatePostInput({ payload: ytPayload(), assetUrl: URL_OK });
  const success = mockFetch([{ body: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'post_1', status: 'scheduled' } } } } }]);
  const c = createBufferClient({ apiKey: KEY, fetchImpl: success });
  assert.deepEqual(await c.createPost(input), { kind: 'created', postId: 'post_1', status: 'scheduled' });
  assert.equal(success.calls[0].url, BUFFER_ENDPOINT);
  assert.equal(success.calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(success.calls[0].body.variables.input, input);
  assert.match(success.calls[0].body.query, /mutation/);

  const cases = [
    [{ body: { data: { createPost: { __typename: 'InvalidInputError', message: 'bad title' } } } }, 'rejected'],
    [{ body: { data: { createPost: { __typename: 'LimitReachedError', message: 'limit' } } } }, 'rejected'],
    [{ body: { data: { createPost: { __typename: 'UnexpectedError', message: 'oops' } } } }, 'uncertain'],
    [{ body: { errors: [{ message: 'Unknown argument', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] } }, 'rejected'],
    [{ body: { errors: [{ message: 'Internal', extensions: { code: 'INTERNAL_SERVER_ERROR' } }], data: null } }, 'uncertain'],
    [{ status: 401, body: { error: KEY } }, 'rejected'],
    [{ status: 429, body: {} }, 'rejected'],
    [{ status: 502, body: {} }, 'uncertain'],
    [new Error(`socket hang up ${KEY}`), 'uncertain'],
    [{ body: { data: { createPost: { __typename: 'PostActionSuccess', post: null } } } }, 'uncertain'],
  ];
  for (const [resp, kind] of cases) {
    const f = mockFetch([resp]);
    const out = await createBufferClient({ apiKey: KEY, fetchImpl: f }).createPost(input);
    assert.equal(out.kind, kind, JSON.stringify(resp).slice(0, 90));
    assert.ok(!JSON.stringify(out).includes(KEY));
    assert.equal(f.calls.length, 1, 'exactly one write attempt');
  }
});

test('reads surface GraphQL errors and never echo the key', async () => {
  const f = mockFetch([{ body: { errors: [{ message: `denied ${KEY}` }] } }]);
  await assert.rejects(createBufferClient({ apiKey: KEY, fetchImpl: f }).readPost('post_1'), e => !e.message.includes(KEY) && /GraphQL/.test(e.message));
  assert.throws(() => createBufferClient({ apiKey: '' }), /BUFFER_API_KEY/);
});

const allow = { platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmockmockmockmockmockmo' };
const channel = (over = {}) => ({ id: 'mock-yt-channel', name: 'derabona', service: 'youtube', serviceId: 'UCmockmockmockmockmockmo', organizationId: 'mock-org', isDisconnected: false, isLocked: false, isQueuePaused: false, ...over });

test('channel identity must match the allowlist exactly', () => {
  assert.doesNotThrow(() => assertChannelMatches(channel(), allow, 'mock-org'));
  for (const over of [{ organizationId: 'other-org' }, { serviceId: 'UCsomeoneelse' }, { service: 'tiktok' }, { id: 'other' }, { isDisconnected: true }, { isLocked: true }, { isQueuePaused: true }]) {
    assert.throws(() => assertChannelMatches(channel(over), allow, 'mock-org'), JSON.stringify(over));
  }
});

test('readback classifies only documented statuses and demands exact stored content', () => {
  const p = ytPayload();
  const input = buildCreatePostInput({ payload: p, assetUrl: URL_OK });
  const post = (over = {}) => ({ id: 'post_1', status: 'scheduled', text: input.text, dueAt: '2026-10-19T16:00:00.000Z', sentAt: null, externalLink: null, schedulingType: 'automatic', notificationStatus: null, channelId: 'mock-yt-channel', channelService: 'youtube', assets: [{ source: URL_OK }],
    metadata: { __typename: 'YoutubePostMetadata', title: p.script.title, privacy: 'public', madeForKids: false, license: 'youtube', embeddable: true, notifySubscribers: false, isAiGenerated: true, category: { categoryId: '17' } }, error: null, ...over });
  assert.equal(classifyReadback(post(), { postId: 'post_1', input, platform: 'youtube' }).state, 'scheduled');
  assert.equal(classifyReadback(post({ status: 'sending' }), { postId: 'post_1', input, platform: 'youtube' }).state, 'sending');
  const sent = classifyReadback(post({ status: 'sent', sentAt: '2026-10-19T16:00:05Z', externalLink: 'https://www.youtube.com/shorts/abcdefghijk' }), { postId: 'post_1', input, platform: 'youtube' });
  assert.equal(sent.state, 'public_verification_pending');
  assert.equal(sent.verified, false);
  assert.equal(classifyReadback(post({ status: 'error', error: { message: 'quota' } }), { postId: 'post_1', input, platform: 'youtube' }).state, 'error');
  for (const s of ['draft', 'needs_approval']) assert.equal(classifyReadback(post({ status: s }), { postId: 'post_1', input, platform: 'youtube' }).state, 'not_scheduled');
  for (const over of [{ status: 'processing' }, { status: 'published' }, { text: `${input.text} ` }, { schedulingType: 'notification' }, { notificationStatus: 'markedAsPublished' }, { assets: [{ source: 'https://other.example.org/x.mp4' }] },
    { dueAt: '2026-10-19T17:00:00Z' }, { channelId: 'other' }, { metadata: { ...post().metadata, privacy: 'private' } }, { metadata: { ...post().metadata, isAiGenerated: false } }, { id: 'post_2' },
    { status: 'sent', sentAt: '2026-10-19T16:00:05Z', externalLink: 'https://evil.example.com/shorts/abc' }]) {
    assert.throws(() => classifyReadback(post(over), { postId: 'post_1', input, platform: 'youtube' }), JSON.stringify(over).slice(0, 80));
  }
});

test('offline preflight makes no network call and fails while gates are closed', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-preflight-'));
  const noNet = 'data:text/javascript,globalThis.fetch=()=>{throw new Error("network used")};';
  const res = spawnSync(process.execPath, ['--import', noNet, path.join(HERE, '../preflight.mjs'), '--mode', 'offline', '--state', state], { encoding: 'utf8' });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stdout, /enabled: false/);
  assert.match(res.stdout, /tiktok: draft-only/);
  assert.ok(!/network used/.test(res.stdout + res.stderr));
  const ro = spawnSync(process.execPath, ['--import', noNet, path.join(HERE, '../preflight.mjs'), '--mode', 'readonly', '--target', 'youtube', '--state', state], { encoding: 'utf8', env: { ...process.env, BUFFER_API_KEY: '' } });
  assert.equal(ro.status, 1);
  assert.match(ro.stderr, /BUFFER_API_KEY/);
});
