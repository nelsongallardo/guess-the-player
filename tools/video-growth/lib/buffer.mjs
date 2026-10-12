// Buffer GraphQL transport (official public API only). Field names follow the
// reference retrieved 2026-10-12 (llms-full.txt sha256 77d6faad…5508).
//
// TikTok: TikTokPostMetadataInput has only `isAiGenerated` and `title` (photo
// posts). There is no privacy level, comment/Duet/Stitch control or "Your
// brand / Promotional content" disclosure, so the controls TikTok requires for
// promotional synthetic-voice posts cannot be sent. Automatic TikTok posting
// is blocked in code until Buffer documents those controls.

import { PRIVACY } from './manifest.mjs';

export const BUFFER_ENDPOINT = 'https://api.buffer.com';
export const TIKTOK_BLOCK = 'TikTok automatic publishing is blocked: Buffer exposes no privacy, interaction or commercial-disclosure fields for TikTok videos (G2)';

const POST_FIELDS = `id status text dueAt sentAt externalLink schedulingType notificationStatus channelId channelService
  assets { source mimeType } error { message }
  metadata { __typename
    ... on YoutubePostMetadata { title privacy madeForKids license embeddable notifySubscribers isAiGenerated category { categoryId } }
    ... on TiktokPostMetadata { isAiGenerated } }`;
export const CREATE_POST = `mutation CreateVideoPost($input: CreatePostInput!) {
  createPost(input: $input) { __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } }
}`;
const POST_QUERY = `query VideoPost($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`;
const POSTS_QUERY = `query VideoPosts($first: Int!, $after: String, $input: PostsInput!) {
  posts(first: $first, after: $after, input: $input) { edges { node { ${POST_FIELDS} } } pageInfo { hasNextPage endCursor } }
}`;
const ORGS_QUERY = 'query Organizations { account { organizations { id name } } }';
const CHANNELS_QUERY = `query Channels($input: ChannelsInput!) {
  channels(input: $input) { id name service serviceId organizationId isDisconnected isLocked isQueuePaused }
}`;

export function buildCreatePostInput({ payload, assetUrl }) {
  const { target, script } = payload;
  if (target.platform === 'tiktok') throw new Error(TIKTOK_BLOCK);
  if (target.platform !== 'youtube') throw new Error(`unsupported platform ${target.platform}`);
  if (!PRIVACY.youtube.includes(target.privacy)) throw new Error('YouTube privacy must be an explicit owner choice; it is never defaulted');
  if (typeof target.madeForKids !== 'boolean') throw new Error('madeForKids must be an explicit owner choice');
  const input = {
    channelId: target.channelId,
    text: script.caption,
    assets: [{ video: { url: assetUrl } }],
    schedulingType: 'automatic', mode: 'customScheduled', dueAt: target.publishAtUtc,
    saveToDraft: false, needsApproval: false, aiAssisted: true,
    metadata: { youtube: {
      title: script.title, categoryId: '17', privacy: target.privacy, madeForKids: target.madeForKids,
      license: 'youtube', embeddable: true, notifySubscribers: false, isAiGenerated: target.disclosures.aiGenerated === true,
    } },
  };
  return assertSupportedInput(input, target.platform);
}

const TOP = ['channelId', 'text', 'assets', 'schedulingType', 'mode', 'dueAt', 'saveToDraft', 'needsApproval', 'aiAssisted', 'metadata'];
const YT = ['title', 'categoryId', 'privacy', 'madeForKids', 'license', 'embeddable', 'notifySubscribers', 'isAiGenerated'];
const sameKeys = (o, keys) => o && typeof o === 'object' && Object.keys(o).length === keys.length && keys.every(k => k in o);
const onlyKeys = (o, keys) => o && typeof o === 'object' && Object.keys(o).every(k => keys.includes(k));

// Whitelist of exactly what this lane sends. Anything else is a defect.
export function assertSupportedInput(input, platform) {
  if (platform === 'tiktok') throw new Error(TIKTOK_BLOCK);
  if (!sameKeys(input, TOP)) throw new Error('CreatePostInput has unsupported or missing fields');
  if (input.schedulingType !== 'automatic') throw new Error('only automatic publishing is allowed; notification posts are not delivery');
  if (input.mode !== 'customScheduled' || typeof input.dueAt !== 'string') throw new Error('posts must be custom-scheduled at the approved UTC slot');
  if (input.saveToDraft !== false || input.needsApproval !== false || input.aiAssisted !== true) throw new Error('draft/approval/aiAssisted flags differ from the approved contract');
  if (!Array.isArray(input.assets) || input.assets.length !== 1 || !sameKeys(input.assets[0], ['video'])) throw new Error('exactly one video asset is required');
  const v = input.assets[0].video;
  if (!onlyKeys(v, ['url', 'metadata']) || typeof v.url !== 'string') throw new Error('video asset has unsupported fields (thumbnailUrl is rejected by Buffer)');
  if ('metadata' in v) throw new Error('thumbnailOffset is only supported for TikTok/Instagram/Pinterest, not YouTube');
  if (!sameKeys(input.metadata, ['youtube']) || !sameKeys(input.metadata.youtube, YT)) throw new Error('YouTube metadata has unsupported or missing fields');
  return input;
}

const redact = (s, key) => String(s ?? '').split(key).join('[redacted]').slice(0, 200);
const DETERMINISTIC_CODES = new Set(['GRAPHQL_VALIDATION_FAILED', 'GRAPHQL_PARSE_FAILED', 'BAD_USER_INPUT']);
const REJECT_TYPES = new Set(['InvalidInputError', 'LimitReachedError', 'UnauthorizedError', 'NotFoundError']);

export function createBufferClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('BUFFER_API_KEY is not configured');
  const send = (query, variables) => fetchImpl(BUFFER_ENDPOINT, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  async function read(query, variables, pick) {
    let res, json;
    try { res = await send(query, variables); json = await res.json(); }
    catch { throw new Error('Buffer read failed (network/timeout/non-JSON); details withheld'); }
    if (res.status !== 200) throw new Error(`Buffer read returned HTTP ${res.status}`);
    if (json?.errors?.length) throw new Error(`Buffer GraphQL read error: ${redact(json.errors[0]?.message, apiKey)}`);
    return pick(json.data);
  }

  return Object.freeze({
    // Exactly one HTTP request. Never retried here: Buffer writes have no idempotency key.
    async createPost(input) {
      let res;
      try { res = await send(CREATE_POST, { input }); }
      catch { return { kind: 'uncertain', reason: 'network error or timeout before a response' }; }
      if (res.status === 429) return { kind: 'rejected', reason: 'rate limited (HTTP 429, refunded, not created)', retryable: true };
      if ([400, 401, 403, 404].includes(res.status)) return { kind: 'rejected', reason: `HTTP ${res.status}` };
      if (res.status !== 200) return { kind: 'uncertain', reason: `HTTP ${res.status}` };
      let json;
      try { json = await res.json(); } catch { return { kind: 'uncertain', reason: 'non-JSON response' }; }
      if (json?.errors?.length) {
        const codes = json.errors.map(e => e?.extensions?.code);
        const reason = `GraphQL error: ${redact(json.errors[0]?.message, apiKey)}`;
        return codes.every(c => DETERMINISTIC_CODES.has(c)) ? { kind: 'rejected', reason } : { kind: 'uncertain', reason };
      }
      const r = json?.data?.createPost;
      if (r?.__typename === 'PostActionSuccess' && typeof r.post?.id === 'string' && r.post.id) return { kind: 'created', postId: r.post.id, status: r.post.status };
      if (REJECT_TYPES.has(r?.__typename)) return { kind: 'rejected', reason: `${r.__typename}: ${redact(r.message, apiKey)}` };
      return { kind: 'uncertain', reason: `unexpected createPost result ${r?.__typename ?? 'missing'}` };
    },
    readPost(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid Buffer post ID');
      return read(POST_QUERY, { input: { id } }, d => d?.post ?? null);
    },
    listPosts({ organizationId, channelId, start, end, after = null, first = 50 }) {
      return read(POSTS_QUERY, { first, after, input: { organizationId, filter: { channelIds: [channelId], startDate: start, endDate: end } } }, d => d?.posts);
    },
    organizations: () => read(ORGS_QUERY, {}, d => d?.account?.organizations ?? []),
    channels: organizationId => read(CHANNELS_QUERY, { input: { organizationId } }, d => d?.channels ?? []),
  });
}

export function assertChannelMatches(channel, allow, organizationId) {
  const native = allow.platform === 'youtube' ? channel?.serviceId : channel?.name;
  const expectedNative = allow.platform === 'tiktok' ? allow.nativeAccount.replace(/^@/, '') : allow.nativeAccount;
  if (channel?.id !== allow.channelId || channel.service !== allow.platform || native !== expectedNative || channel.organizationId !== organizationId) {
    throw new Error(`Buffer channel ${channel?.id ?? '?'} does not match the approved ${allow.platform} account`);
  }
  if (channel.isDisconnected !== false || channel.isLocked !== false || channel.isQueuePaused !== false) throw new Error('Buffer channel is disconnected, locked or paused');
  return channel;
}

const LINKS = {
  youtube: /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=)[A-Za-z0-9_-]{11}$|^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}$/,
  tiktok: /^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/video\/\d+$/,
};

// Provider state only. `sent` never means public: it starts public verification.
export function classifyReadback(post, { postId, input, platform }) {
  if (!post || post.id !== postId) throw new Error('Buffer post ID mismatch');
  if (post.channelId !== input.channelId || post.channelService !== platform) throw new Error('Buffer post channel mismatch');
  if (post.text !== input.text) throw new Error('Buffer stored text differs from the approved text');
  if (Date.parse(post.dueAt) !== Date.parse(input.dueAt)) throw new Error('Buffer due time differs from the approved slot');
  if (post.schedulingType !== 'automatic' || post.notificationStatus != null) throw new Error('post is on the notification route; that is not automated delivery');
  if (post.assets?.length !== 1 || post.assets[0].source !== input.assets[0].video.url) throw new Error('Buffer stored media differs from the approved asset');
  if (platform === 'youtube') {
    const m = post.metadata, want = input.metadata.youtube;
    if (m?.__typename !== 'YoutubePostMetadata' || m.category?.categoryId !== want.categoryId
      || ['title', 'privacy', 'madeForKids', 'license', 'embeddable', 'notifySubscribers', 'isAiGenerated'].some(k => m[k] !== want[k])) {
      throw new Error('Buffer stored YouTube metadata differs from the approved values');
    }
  }
  switch (post.status) {
    case 'draft': case 'needs_approval': return { state: 'not_scheduled', verified: false };
    case 'scheduled': return { state: 'scheduled', verified: false };
    case 'sending': return { state: 'sending', verified: false };
    case 'error': return { state: 'error', verified: false, error: String(post.error?.message ?? 'unknown').slice(0, 200) };
    case 'sent':
      if (!post.sentAt || !Number.isFinite(Date.parse(post.sentAt))) throw new Error('sent post has no sentAt');
      if (!LINKS[platform].test(post.externalLink ?? '')) throw new Error('sent post has no valid native permalink');
      return { state: 'public_verification_pending', verified: false, externalLink: post.externalLink, sentAt: post.sentAt };
    default: throw new Error(`undocumented Buffer status ${post.status}`);
  }
}
