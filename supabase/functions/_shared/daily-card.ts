// On-demand Daily career card for the reminder email (ADR 0030 amendment).
// The data source is the deployed game itself (index.html): its Daily
// schedule, frozen Daily payloads and embedded crests. New players, crests or
// a longer schedule therefore need no separate export or pre-render step.
// The card shows only what round 1 shows before any hint: crests and club
// names in order. Never a name, years, nationality or position, and never a
// date after today (UTC), so it cannot leak upcoming puzzles.
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.6/mod.ts';

type Club = { name: string; crestKey?: string };
export type SiteData = { schedule: { payloadId: string }[]; payloads: Record<string, { player: { clubs: Club[] } }>; crests: Record<string, { dataUrl?: string }> };

// Extract one JSON literal that follows `marker` in the page source.
export function extractLiteral(source: string, marker: string): unknown {
  const at = source.indexOf(marker);
  if (at < 0) throw Error(`MISSING ${marker}`);
  let i = at + marker.length;
  while (source[i] !== '{' && source[i] !== '[') i++;
  const open = source[i], close = open === '{' ? '}' : ']';
  let depth = 0, inString = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (inString) { if (ch === '\\') j++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(source.slice(i, j + 1));
  }
  throw Error(`UNTERMINATED ${marker}`);
}

export function parseSite(html: string): SiteData {
  return {
    schedule: extractLiteral(html, 'const DAILY_SCHEDULE_V1=dailyDeepFreeze(') as SiteData['schedule'],
    payloads: extractLiteral(html, 'const DAILY_PAYLOAD_V1=dailyDeepFreeze(') as SiteData['payloads'],
    crests: extractLiteral(html, 'const CREST_ASSETS = ') as SiteData['crests'],
  };
}

// Same arithmetic as DailyChallenge.forDate: challenge #1 is 2026-09-17 UTC.
export function dailySlot(date: string, scheduleLength: number) {
  const challengeNumber = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.UTC(2026, 8, 17)) / 86400000) + 1;
  return { challengeNumber, slot: (((challengeNumber - 1) * 3) % scheduleLength + scheduleLength) % scheduleLength };
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node =>
  ({ type, props: { style, children, ...extra } });

export function cardElement(clubs: Club[], crests: SiteData['crests']) {
  const n = clubs.length, cols = n <= 5 ? n : n <= 8 ? 4 : n <= 10 ? 5 : n <= 12 ? 4 : n <= 15 ? 5 : 6;
  const gap = 22, inner = 1200 - 96, tileW = Math.floor((inner - gap * (cols - 1)) / cols);
  const crest = cols >= 6 ? 96 : cols === 5 ? 112 : 132, font = cols >= 6 ? 21 : cols === 5 ? 24 : 28;
  const tiles = clubs.map((club, i) => {
    const src = club.crestKey ? crests[club.crestKey]?.dataUrl : undefined;
    const mark = src
      ? h('img', { width: crest * 0.78, height: crest * 0.78, objectFit: 'contain' }, undefined, { src })
      : h('div', { fontSize: 30, color: '#122a38', fontWeight: 700 }, club.name.split(' ').map(w => w[0]).join('').slice(0, 3));
    return h('div', { position: 'relative', width: tileW, background: '#fffdf7', borderRadius: 20, padding: '26px 14px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 6px 0 #0a1a24' }, [
      h('div', { position: 'absolute', top: 12, left: 14, fontSize: 20, fontWeight: 700, color: '#7b8a93' }, String(i + 1)),
      h('div', { width: crest, height: crest, borderRadius: crest, background: '#f1efe6', display: 'flex', alignItems: 'center', justifyContent: 'center' }, mark),
      h('div', { marginTop: 14, height: font * 2.4, fontSize: font, fontWeight: 700, color: '#122a38', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2 }, club.name),
    ]);
  });
  const rows = Math.ceil(n / cols), tileH = 26 + crest + 14 + font * 2.4 + 22;
  const height = Math.ceil(44 + 64 + 34 + rows * tileH + (rows - 1) * gap + 52 + 6);
  const element = h('div', { width: 1200, height, display: 'flex', flexDirection: 'column', padding: '44px 48px 52px', background: 'linear-gradient(160deg,#173a4f 0%,#0f2635 60%,#0b1d29 100%)', fontFamily: 'Noto Sans' }, [
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 34, height: 64 }, [
      h('div', { display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: -2, color: '#f7f4eb' }, ['dera', h('span', { color: '#89cff0' }, 'bona')]),
      h('div', { display: 'flex', alignItems: 'center' }, [
        h('div', { width: 64, height: 64, borderRadius: 64, background: '#89cff0', color: '#122a38', fontSize: 42, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }, '?'),
        h('div', { marginLeft: 14, fontSize: 26, fontWeight: 700, color: '#cfe9f6', border: '2px solid #3f6a80', borderRadius: 999, padding: '10px 22px' }, '1 / 3'),
      ]),
    ]),
    h('div', { display: 'flex', flexWrap: 'wrap', gap }, tiles),
  ]);
  return { element, height };
}

export type CardDependencies = { fetchSite: () => Promise<string>; fetchFonts?: () => Promise<ArrayBuffer[]>; now?: () => number };

// Pinned bold Noto Sans (Latin + Latin Extended, for names like České Budějovice).
const FONT_URLS = ['https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@5.1.1/latin-700-normal.ttf', 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@5.1.1/latin-ext-700-normal.ttf'];
export const fetchFonts = () => Promise.all(FONT_URLS.map(async url => { const r = await fetch(url); if (!r.ok) throw Error('FONT'); return await r.arrayBuffer(); }));

export function cardHandler(deps: CardDependencies) {
  let cache: { at: number; data: SiteData } | null = null, fonts: Promise<ArrayBuffer[]> | null = null;
  const site = async () => {
    const now = Date.now();
    if (!cache || now - cache.at > 10 * 60 * 1000) cache = { at: now, data: parseSite(await deps.fetchSite()) };
    return cache.data;
  };
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const today = new Date(deps.now?.() ?? Date.now()).toISOString().slice(0, 10);
    const date = new URL(req.url).searchParams.get('date') ?? today;
    // Only today or earlier: an email opened later shows that day's card, and
    // nothing here can reveal a future puzzle.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > today || date < '2026-09-17') return new Response('Not found', { status: 404 });
    try {
      const data = await site();
      const { slot } = dailySlot(date, data.schedule.length);
      const clubs = data.payloads[data.schedule[slot].payloadId].player.clubs;
      const { element, height } = cardElement(clubs, data.crests);
      fonts ??= (deps.fetchFonts ?? fetchFonts)().catch(error => { fonts = null; throw error; });
      const fontData = await fonts;
      const image = new ImageResponse(element as never, { width: 1200, height, fonts: fontData.map((data, i) => ({ name: i ? 'Noto Sans Ext' : 'Noto Sans', data, weight: 700 as const, style: 'normal' as const })) });
      const headers = new Headers(image.headers);
      headers.set('Cache-Control', date < today ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      return new Response(req.method === 'HEAD' ? null : image.body, { status: 200, headers });
    } catch {
      return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
