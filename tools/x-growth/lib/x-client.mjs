// X API v2 client. OAuth 1.0a user context, signed with node:crypto — no npm deps.
// Every spending call checks the ledger first and records after a 2xx.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canSpend, recordSpend, COST } from './state.mjs';

const SECRETS = process.env.DERABONA_SECRETS
  || path.join(process.env.HOME, '.hermes/secrets/derabona-x.json');

export function loadCreds() {
  if (!fs.existsSync(SECRETS)) {
    throw new Error(`missing credentials at ${SECRETS} — see README, Nelson creates this file himself`);
  }
  const st = fs.statSync(SECRETS);
  if ((st.mode & 0o077) !== 0) throw new Error(`${SECRETS} must be chmod 600`);
  const c = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
  for (const k of ['appKey', 'appSecret', 'accessToken', 'accessSecret']) {
    if (!c[k]) throw new Error(`credentials missing "${k}"`);
  }
  return c;
}

const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(creds, method, url, bodyParams = {}) {
  const oauth = {
    oauth_consumer_key: creds.appKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const u = new URL(url);
  const all = { ...oauth, ...bodyParams };
  for (const [k, v] of u.searchParams) all[k] = v;
  const paramStr = Object.keys(all).sort()
    .map(k => `${enc(k)}=${enc(all[k])}`).join('&');
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(paramStr)].join('&');
  const key = `${enc(creds.appSecret)}&${enc(creds.accessSecret)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort()
    .map(k => `${enc(k)}="${enc(oauth[k])}"`).join(', ');
}

// X weighted count: URLs are 23, emoji 2. Good enough for our fixed formats.
// Built fresh per call on purpose: a shared /g regex carries lastIndex between
// .test() calls, so alternating checks silently return the wrong answer — and
// here that means billing a $0.20 post as $0.015.
const urlRe = () => /https?:\/\/\S+|\bwww\.\S+/gi;

export function containsUrl(text) { return urlRe().test(text); }

// X's weighted count, per its published twitter-text rules.
//
// Learned the hard way 2026-09-20: X returns **403 "You are not permitted to
// perform this action"** for an over-length post, NOT 400. That error reads
// like a permissions failure and sent this debugging session chasing OAuth
// scopes for half an hour. If a post 403s, check the length first.
//
// The ranges below are the CJK/Hangul/Hiragana blocks that count as 2. Every
// other character counts as 1 — including emoji, which are 2 only because they
// sit outside the BMP and are counted as surrogate pairs. An earlier version
// counted only the surrogate pairs and undercounted the real total.
const HEAVY = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
];

export function weightedLength(text) {
  const withoutUrls = text.replace(urlRe(), '');
  const urlCount = (text.match(urlRe()) || []).length;
  let n = 0;
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0);
    // Outside the BMP (emoji, etc.) = surrogate pair = 2.
    if (cp > 0xffff) { n += 2; continue; }
    n += HEAVY.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1;
  }
  return n + urlCount * 23;
}

export function postCost(text) {
  return containsUrl(text) ? COST.postWithUrl : COST.post;
}

// X's nominal limit is 280, but our computed weight is not byte-identical to
// theirs and a post measuring exactly 280 by our count was rejected live.
// Rather than reverse-engineer twitter-text exactly, we keep a 10-char margin.
// Measured 2026-09-20: 263 accepted, 280 rejected, in our real post shape.
export const POST_LIMIT = 270;

async function request(creds, { method, url, json, form, dryRun, label, cost, priority }) {
  if (cost) {
    const gate = canSpend(cost, priority);
    if (!gate.ok) throw new Error(`spend blocked: ${gate.reason} (${label})`);
  }
  if (dryRun) {
    console.log(`[dry-run] ${method} ${url}`);
    console.log(`[dry-run] cost $${(cost || 0).toFixed(3)} priority ${priority} — ${label}`);
    if (json) console.log(`[dry-run] body ${JSON.stringify(json)}`);
    return { data: { id: `dry-${Date.now()}` }, dryRun: true };
  }

  const headers = { Authorization: oauthHeader(creds, method, url, form ? Object.fromEntries(new URLSearchParams(form)) : {}) };
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = form; }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    if (res.ok) {
      if (cost) recordSpend(cost, label);
      return text ? JSON.parse(text) : {};
    }
    // Never retry a plain 4xx — a malformed post retried is money burned twice.
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`X API ${res.status} on ${label}: ${text.slice(0, 400)}`);
    }
    lastErr = new Error(`X API ${res.status} on ${label}: ${text.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw lastErr;
}

export function createClient({ dryRun = false } = {}) {
  const creds = dryRun && !fs.existsSync(SECRETS)
    ? { appKey: 'DRY', appSecret: 'DRY', accessToken: 'DRY', accessSecret: 'DRY' }
    : loadCreds();

  return {
    dryRun,

    // Upload goes to v1.1 (still works and returns a usable id), but alt text
    // MUST use v2 /2/media/metadata with {id, metadata:{alt_text}}.
    // Probed against the live API 2026-09-20:
    //   v1.1 upload.json            -> 200
    //   v1.1 metadata/create        -> 403  (deprecated 2025-03-31)
    //   v2 /2/media/metadata        -> 200  <- the one that works
    //   v2 with a media_id key      -> 400  (the field is "id", not "media_id")
    // Alt text is a hard requirement here, not a nicety: the card is the puzzle,
    // so a screen-reader user gets nothing without it.
    async uploadMedia(pngPath, altText) {
      const bytes = fs.readFileSync(pngPath);
      const form = new URLSearchParams({ media_data: bytes.toString('base64'), media_category: 'tweet_image' }).toString();
      const out = await request(creds, {
        method: 'POST', url: 'https://upload.twitter.com/1.1/media/upload.json',
        form, dryRun, label: 'media upload', cost: COST.media, priority: 1,
      });
      const mediaId = out.media_id_string || out.data?.id;
      if (altText && !dryRun && mediaId) {
        await request(creds, {
          method: 'POST', url: 'https://api.x.com/2/media/metadata',
          json: { id: String(mediaId), metadata: { alt_text: { text: altText.slice(0, 1000) } } },
          dryRun, label: 'alt text', cost: 0, priority: 1,
        });
      }
      return mediaId;
    },

    async createPost({ text, mediaIds, replyToId, priority = 1 }) {
      // Over-length posts return 403 "not permitted", which looks exactly like
      // a permissions failure. Fail here with a useful message instead.
      if (weightedLength(text) > POST_LIMIT) {
        throw new Error(`post is ${weightedLength(text)} weighted chars, over the safe limit of ${POST_LIMIT} `
          + `(X rejects over-length posts with a misleading 403)`);
      }
      const cost = postCost(text);
      if (cost === COST.postWithUrl) {
        console.warn(`[warn] post contains a URL — charged $${COST.postWithUrl}, not $${COST.post}`);
      }
      const json = { text };
      if (mediaIds?.length) json.media = { media_ids: mediaIds };
      if (replyToId) json.reply = { in_reply_to_tweet_id: replyToId };
      const out = await request(creds, {
        method: 'POST', url: 'https://api.x.com/2/tweets',
        json, dryRun, label: replyToId ? 'reply' : 'post', cost, priority,
      });
      return out.data;
    },

    async getMe() {
      const out = await request(creds, {
        method: 'GET', url: 'https://api.x.com/2/users/me?user.fields=public_metrics,username',
        dryRun, label: 'getMe', cost: COST.userRead, priority: 4,
      });
      return out.data || { username: 'dry', public_metrics: { followers_count: 0 } };
    },

    async getUserId(handle) {
      const out = await request(creds, {
        method: 'GET', url: `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
        dryRun, label: `lookup @${handle}`, cost: COST.userRead, priority: 4,
      });
      return out.data?.id || null;
    },

    // X enforces max_results minimum 5 on this endpoint, so asking for fewer is
    // impossible — the floor below is the API's rule, not a local choice.
    // Reserve against the unavoidable request size, not the caller's smaller
    // `max`: the caller used to pass per=2 and request/iterate up to 5 posts while
    // the ledger recorded 2, so the $6 cap and reserve floors read ~2.5x low.
    // This is deliberately conservative when an inactive account returns <5.
    async getUserPosts(userId, max = 5) {
      const effective = Math.max(5, max);
      const url = `https://api.x.com/2/users/${userId}/tweets`
        + `?max_results=${effective}&exclude=retweets,replies`
        + `&tweet.fields=created_at,text,public_metrics,entities`;
      const out = await request(creds, {
        method: 'GET', url, dryRun, label: `timeline ${userId}`,
        cost: COST.read * effective, priority: 4,
      });
      // A dry run makes no request, so its placeholder body is not a timeline.
      return Array.isArray(out.data) ? out.data : [];
    },

    // Deleting is free on X's pay-per-usage pricing (no charge listed for
    // DELETE /2/tweets/:id), but it is destructive, so it is never called by
    // any scheduled job — only by hand when a post has to be corrected.
    async deletePost(id) {
      const out = await request(creds, {
        method: 'DELETE', url: `https://api.x.com/2/tweets/${id}`,
        dryRun, label: `delete ${id}`, cost: 0, priority: 1,
      });
      return out.data?.deleted === true;
    },

    async getPost(id) {
      const out = await request(creds, {
        method: 'GET', url: `https://api.x.com/2/tweets/${id}?tweet.fields=public_metrics`,
        dryRun, label: `read ${id}`, cost: COST.read, priority: 4,
      });
      return out.data || null;
    },
  };
}
