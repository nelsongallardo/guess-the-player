// Deterministic vertical render: Playwright rasterizes one PNG per distinct
// visual state, FFmpeg assembles them frame-accurately with the measured
// narration segments. No generative video, no stock footage, no network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { canonicalJson, sha256 } from './manifest.mjs';
import { wordsFromAlignment, buildCues, toSrt } from './captions.mjs';
import { audioStats, ffprobeJson, loudness, run } from './probe.mjs';
import { MAX_CLUBS } from './select.mjs';
import { clubsLine } from './script.mjs';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/puzzle.html');

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const CONTENT_BOX = Object.freeze({ x0: 72, x1: 900, y0: 180, y1: 1500 });
// Narration segments in play order (owner-requested engaging format, 2026-10-12).
export const SEGMENTS = Object.freeze(['hook', 'clubs', 'question', 'answer', 'cta']);
export const TIMING = Object.freeze({ start: 0.3, gap: 0.35, minQuiet: 5, ctaGap: 0.5, tail: 1.2, min: 15, max: 40 });
export const CAPTION = Object.freeze({ maxCharsPerLine: 24, maxLines: 2, holdSec: 0.3 });
export const LOUDNESS = Object.freeze({ lufs: -16, truePeakTarget: -2, truePeakMax: -1, tolerance: 1.5 });

const toFrame = t => Math.ceil(t * FPS - 1e-6) / FPS;

// hook → clubs → question, then at least minQuiet seconds of countdown before
// the reveal, then answer → cta. Durations are the measured narration lengths.
export function planTimeline({ durations }) {
  for (const k of SEGMENTS) if (!(Number.isFinite(durations?.[k]) && durations[k] > 0)) throw new Error(`${k} must be a measured positive duration`);
  const seg = {};
  let t = TIMING.start;
  for (const k of ['hook', 'clubs', 'question']) { seg[k] = { start: t, end: t + durations[k] }; t = seg[k].end + TIMING.gap; }
  const revealAt = toFrame(seg.question.end + TIMING.minQuiet);
  seg.answer = { start: revealAt, end: revealAt + durations.answer };
  seg.cta = { start: seg.answer.end + TIMING.ctaGap, end: seg.answer.end + TIMING.ctaGap + durations.cta };
  const end = toFrame(Math.max(seg.cta.end + TIMING.tail, TIMING.min));
  if (end > TIMING.max) throw new Error(`narration needs ${end.toFixed(2)} s; videos must end by ${TIMING.max} s — shorten the script, do not speed it up`);
  return { ...seg, thinkStart: revealAt - TIMING.minQuiet, revealAt, end };
}

async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.goto(`file://${TEMPLATE}`);
    return await fn(page);
  } finally { await browser.close(); }
}

async function paint(page, state) {
  await page.evaluate(s => window.renderState(s), state);
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  return page.evaluate(() => window.measure());
}

function assertClubCount(clubs) {
  if (!Array.isArray(clubs) || clubs.length < 1 || clubs.length > MAX_CLUBS) throw new Error(`renderer supports 1–${MAX_CLUBS} clubs; long careers need their own readable prototype`);
}

// Worst-case readability check: reveal state with answer and captions shown.
export async function layoutCheck({ clubs, answerName, captionLines }) {
  assertClubCount(clubs);
  return withPage(page => paint(page, { phase: 'reveal', top: '¿Quién es?', clubs, answerLabel: 'Era', answerName, captionLines }));
}

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function captionCues(narration, timeline) {
  const cues = SEGMENTS.flatMap(k => buildCues(wordsFromAlignment(narration[k].text, narration[k].alignment, timeline[k].start), CAPTION));
  return cues.map((c, i) => ({ ...c, showUntil: Math.min(c.end + CAPTION.holdSec, cues[i + 1]?.start ?? Infinity, timeline.end) }));
}

export async function renderVideo({ career, script, narration, crests, outDir, crestMode }) {
  if (!['embedded', 'text-only'].includes(crestMode)) throw new Error('crestMode must be embedded or text-only');
  assertClubCount(script.clubs);
  if (crestMode === 'embedded' && crests?.length !== script.clubs.length) throw new Error('every club needs its embedded crest');
  for (const k of SEGMENTS) if (narration[k]?.text !== script.narration[k]) throw new Error(`narration.${k} does not match the approved script text`);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

  const stats = {};
  for (const k of SEGMENTS) {
    stats[k] = await audioStats(narration[k].audioPath);
    if (stats[k].clipped) throw new Error(`${k} narration is clipped`);
  }
  const timeline = planTimeline({ durations: Object.fromEntries(SEGMENTS.map(k => [k, stats[k].durationSec])) });
  const cues = captionCues(narration, timeline);

  const F = t => Math.round(t * FPS);
  const endF = F(timeline.end), revealF = F(timeline.revealAt), thinkF = revealF - TIMING.minQuiet * FPS, ctaF = F(timeline.cta.start), clubsF = F(timeline.clubs.start);
  // Each card appears on the first spoken character of its club name.
  const cardF = clubsLine(script.clubs).starts.map(i => F(timeline.clubs.start + narration.clubs.alignment.character_start_times_seconds[i]));
  const clubs = script.clubs.map((name, i) => ({ name, crest: crestMode === 'embedded' ? crests[i] : null }));
  const stateAt = f => {
    const phase = f < clubsF ? 'hook' : f < thinkF ? 'clues' : f < revealF ? 'think' : f >= ctaF ? 'cta' : 'reveal';
    const t = f / FPS;
    const cue = cues.find(c => t >= c.start - 1e-6 && t < c.showUntil - 1e-6);
    const shown = phase === 'hook' ? 0 : phase === 'clues' ? cardF.filter(cf => f >= cf).length : clubs.length;
    return {
      phase, clubs: clubs.map((c, i) => ({ ...c, hidden: i >= shown })),
      top: { hook: script.onScreen.hook, clues: script.onScreen.prompt, think: script.onScreen.think, reveal: script.onScreen.prompt, cta: script.onScreen.cta }[phase],
      countdown: phase === 'think' ? Math.ceil((revealF - f) / FPS) : null,
      answerLabel: phase === 'reveal' || phase === 'cta' ? script.onScreen.answerLabel : null,
      answerName: phase === 'reveal' || phase === 'cta' ? career.name : null,
      captionLines: cue?.lines ?? [],
    };
  };
  const bounds = new Set([0, clubsF, thinkF, revealF, ctaF, endF, ...cardF]);
  for (let k = 1; k < TIMING.minQuiet; k++) bounds.add(revealF - k * FPS);
  for (const c of cues) { bounds.add(F(c.start)); bounds.add(F(c.showUntil)); }
  const starts = [...bounds].filter(f => f >= 0 && f < endF).sort((a, b) => a - b);

  const keyDir = path.join(outDir, 'keyframes');
  const frameDir = path.join(outDir, 'frames');
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(frameDir, { recursive: true, mode: 0o700 });
  const nameTokens = fold(career.name).match(/[a-z0-9]+/g).filter(w => w.length >= 3);

  const keyframes = await withPage(async page => {
    const out = [];
    const pngByState = new Map();
    for (let i = 0; i < starts.length; i++) {
      const state = stateAt(starts[i]);
      const key = sha256(canonicalJson(state));
      let entry = pngByState.get(key);
      if (!entry) {
        const m = await paint(page, state);
        if (m.errors.length) throw new Error(`layout rejected (${state.phase}): ${m.errors.join('; ')}`);
        const png = path.join(keyDir, `k${String(pngByState.size).padStart(3, '0')}.png`);
        await page.screenshot({ path: png });
        entry = { png, text: m.text, phase: state.phase, minClubFontPx: m.minClubFontPx };
        pngByState.set(key, entry);
      }
      const startF = starts[i], endFrame = starts[i + 1] ?? endF;
      if (startF < revealF && nameTokens.some(w => fold(entry.text).match(/[a-z0-9]+/g)?.includes(w))) throw new Error('answer appears before the reveal frame');
      for (let f = startF; f < endFrame; f++) fs.linkSync(entry.png, path.join(frameDir, `f${String(f).padStart(5, '0')}.png`));
      out.push({ start: startF / FPS, frames: endFrame - startF, ...entry });
    }
    return out;
  });

  const mp4Path = path.join(outDir, `${script.platform}.mp4`);
  // Countdown ticks (one per second of the quiet window) and a reveal chime:
  // generated tones, so no music licence is involved.
  const tick = path.join(outDir, 'tick.wav'), chime = path.join(outDir, 'chime.wav');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1300:duration=0.07', '-af', 'afade=t=out:st=0.02:d=0.05,volume=0.30', tick]);
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.45', '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=0.45',
    '-filter_complex', '[0][1]amix=inputs=2:normalize=0,afade=t=out:st=0.1:d=0.35,volume=0.30', chime]);
  const sfx = [...Array.from({ length: TIMING.minQuiet }, (_, k) => [tick, timeline.thinkStart + k]), [chime, timeline.revealAt - 0.15]];
  const tracks = [...SEGMENTS.map(k => [narration[k].audioPath, timeline[k].start]), ...sfx];
  const inputs = tracks.flatMap(([file]) => ['-i', file]);
  const delays = tracks.map(([, at], i) => `[${i + 1}:a]adelay=${Math.round(at * 1000)}:all=1[s${i}]`);
  const filter = `${delays.join(';')};${tracks.map((_, i) => `[s${i}]`).join('')}amix=inputs=${tracks.length}:normalize=0:duration=longest,`
    + `apad=whole_dur=${timeline.end},atrim=0:${timeline.end},loudnorm=I=${LOUDNESS.lufs}:TP=${LOUDNESS.truePeakTarget}:LRA=11,aresample=48000,aformat=channel_layouts=stereo[aout]`;
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.png'), ...inputs,
    '-filter_complex', filter, '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-t', String(timeline.end), '-movflags', '+faststart', '-map_metadata', '-1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', mp4Path]);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.rmSync(tick, { force: true }); fs.rmSync(chime, { force: true });
  fs.chmodSync(mp4Path, 0o600);

  const covering = f => keyframes.find(k => f >= k.start * FPS - 1e-6 && f < k.start * FPS + k.frames - 1e-6);
  const thinkPng = covering(revealF - 1).png;
  const revealPng = covering(revealF).png;
  const proofs = [];
  for (const [label, png] of [['hook', covering(0).png], ['clues', covering(thinkF - 1).png], ['think', thinkPng], ['reveal', revealPng], ['cta', covering(endF - 1).png]]) {
    const proof = path.join(outDir, `proof-375-${label}.png`);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=375:-1', proof]);
    proofs.push(proof);
  }

  const srtPath = path.join(outDir, `${script.platform}.srt`);
  fs.writeFileSync(srtPath, toSrt(cues), { mode: 0o600 });
  const probe = await ffprobeJson(mp4Path);
  const loud = await loudness(mp4Path);
  const qa = {
    platform: script.platform,
    mp4Sha256: sha256(fs.readFileSync(mp4Path)),
    sizeBytes: fs.statSync(mp4Path).size,
    durationSec: Number(probe.format.duration),
    streams: probe.streams.map(s => ({ codec: s.codec_name, type: s.codec_type, width: s.width, height: s.height, pixFmt: s.pix_fmt, rate: s.r_frame_rate, sampleRate: s.sample_rate })),
    timeline, cardTimesSec: cardF.map(f => f / FPS), cues, quietBeforeRevealSec: timeline.revealAt - timeline.question.end,
    loudness: loud,
    loudnessOk: Math.abs(loud.lufs - LOUDNESS.lufs) <= LOUDNESS.tolerance && loud.truePeakDb <= LOUDNESS.truePeakMax,
    segmentStats: stats,
    narrationVerified: SEGMENTS.every(k => typeof narration[k].requestId === 'string' && narration[k].requestId.length > 0),
    crestMode, minClubFontPx: Math.min(...keyframes.map(k => k.minClubFontPx)),
    keyframes: keyframes.map(k => ({ start: k.start, frames: k.frames, phase: k.phase, png: path.basename(k.png) })),
    proofs: proofs.map(p => path.basename(p)),
    review: 'Owner must watch with sound, watch muted and check the 375px proofs before approval.',
  };
  const qaPath = path.join(outDir, `${script.platform}.qa.json`);
  fs.writeFileSync(qaPath, JSON.stringify(qa, null, 2), { mode: 0o600 });
  return { mp4Path, srtPath, qaPath, timeline, keyframes, thinkPng, revealPng, proofs, qa };
}
