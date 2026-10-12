// Real Playwright + FFmpeg renders with MOCK tone "narration". They prove the
// layout, timeline and encoding contract — not voice quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planTimeline, layoutCheck, renderVideo, CONTENT_BOX } from '../lib/render.mjs';
import { ffprobeJson, frameDistance } from '../lib/probe.mjs';
import { readSnapshot } from '../lib/source.mjs';
import { careerFor } from '../lib/select.mjs';
import { buildScript } from '../lib/script.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-render-'));
const snap = readSnapshot({ repo: REPO, commit: 'HEAD' });

function segment(dir, name, text, seconds) {
  const file = path.join(dir, `${name}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-af', 'volume=0.3', '-c:a', 'libmp3lame', '-b:a', '128k', file]);
  const chars = [...text];
  const per = (seconds - 0.1) / chars.length;
  return {
    audioPath: file, text, durationSec: seconds,
    alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => +(i * per).toFixed(3)), character_end_times_seconds: chars.map((_, i) => +((i + 1) * per).toFixed(3)) },
  };
}

function narrationFor(dir, script, { h = 2.4, cl = 9, q = 2.2, a = 1.6, c = 2.4 } = {}) {
  return {
    hook: segment(dir, 'h', script.narration.hook, h),
    clubs: segment(dir, 'cl', script.narration.clubs, cl),
    question: segment(dir, 'q', script.narration.question, q),
    answer: segment(dir, 'a', script.narration.answer, a),
    cta: segment(dir, 'c', script.narration.cta, c),
  };
}
const durations = (over = {}) => ({ hook: 2.4, clubs: 9, question: 2.2, answer: 1.6, cta: 2.4, ...over });

const crestUrls = (playerId) => {
  const p = snap.players.find(x => x.id === playerId);
  return p.clubCrests.map(ref => snap.crests[ref].dataUrl);
};

test('timeline plays hook, clubs and question, keeps five quiet seconds before the reveal and lands in 15–40 s', () => {
  const t = planTimeline({ durations: durations() });
  assert.ok(t.hook.end <= t.clubs.start && t.clubs.end <= t.question.start);
  assert.ok(t.revealAt - t.question.end >= 5);
  assert.ok(t.end >= 15 && t.end <= 40);
  assert.equal(t.answer.start, t.revealAt);
  assert.ok(t.cta.start >= t.answer.end);
});

test('overlong narration is rejected instead of squeezed', () => {
  assert.throws(() => planTimeline({ durations: durations({ clubs: 30 }) }), /40/);
  assert.throws(() => planTimeline({ durations: durations({ cta: undefined }) }), /cta/);
});

test('eight clubs stay readable at phone-feed size inside the content box', async () => {
  const long = snap.players.find(p => p.clubs.length === 8);
  const career = careerFor(snap, long.id);
  const r = await layoutCheck({ clubs: career.clubs.map((c, i) => ({ name: c.name, crest: crestUrls(long.id)[i] })), answerName: career.name, captionLines: ['Mirá los clubes.', '¿Quién es?'] });
  assert.deepEqual(r.errors, []);
  assert.ok(r.minClubFontPx >= 36);
  assert.ok(r.minClubFontPx * 375 / 1080 >= 12.5);
});

test('an unreadable club label, too many clubs or an offscreen caption is rejected', async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `Club ${i}`, crest: null }));
  await assert.rejects(layoutCheck({ clubs: many, answerName: 'X Y', captionLines: [] }), /clubs/);
  const huge = [{ name: 'Club Atlético Social y Deportivo Reserva Especial de la Ciudad Autónoma Metropolitana', crest: null }, { name: 'Beta', crest: null }, { name: 'Gamma', crest: null }];
  const r = await layoutCheck({ clubs: huge, answerName: 'X Y', captionLines: [] });
  assert.ok(r.errors.some(e => /club/.test(e)), r.errors.join());
  const cap = await layoutCheck({ clubs: huge.slice(1).concat([{ name: 'Delta', crest: null }]), answerName: 'X Y', captionLines: ['Una línea de subtítulo demasiado larga para caber en pantalla sin cortarse jamás'] });
  assert.ok(cap.errors.some(e => /caption/.test(e)), cap.errors.join());
});

test('a full YouTube render encodes to spec, keeps the answer out of every pre-reveal frame and writes QA', { timeout: 240000 }, async () => {
  const dir = tmp();
  const career = careerFor(snap, 'cristiano-ronaldo');
  const script = buildScript(career, 'youtube');
  const out = await renderVideo({ career, script, narration: narrationFor(dir, script), crests: crestUrls('cristiano-ronaldo'), outDir: dir, crestMode: 'embedded' });

  const probe = await ffprobeJson(out.mp4Path);
  const v = probe.streams.find(s => s.codec_type === 'video');
  const a = probe.streams.find(s => s.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1920);
  assert.equal(v.r_frame_rate, '30/1');
  assert.equal(a.codec_name, 'aac');
  const dur = Number(probe.format.duration);
  assert.ok(dur >= 15 && dur <= 40, `duration ${dur}`);
  const bytes = fs.readFileSync(out.mp4Path);
  assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'), 'faststart');
  const tags = JSON.stringify(probe.format.tags ?? {}) + JSON.stringify(v.tags ?? {}) + JSON.stringify(a.tags ?? {});
  assert.ok(!/ronaldo|cristiano/i.test(tags));

  // Every keyframe that starts before the reveal must not contain the name.
  const pre = out.keyframes.filter(k => k.start < out.timeline.revealAt);
  assert.ok(pre.length >= 3);
  assert.ok(pre.every(k => !/cristiano|ronaldo/i.test(k.text)));
  assert.ok(out.keyframes.some(k => k.start >= out.timeline.revealAt && /Cristiano Ronaldo/.test(k.text)));

  // Encoded frames on either side of the reveal match the intended states.
  const revealFrame = Math.round(out.timeline.revealAt * 30);
  const before = await frameDistance(out.mp4Path, revealFrame - 1, out.thinkPng, out.revealPng);
  const after = await frameDistance(out.mp4Path, revealFrame, out.thinkPng, out.revealPng);
  assert.ok(before.toA < before.toB, `frame before reveal looks revealed ${JSON.stringify(before)}`);
  assert.ok(after.toB < after.toA, `reveal frame not revealed ${JSON.stringify(after)}`);

  const qa = JSON.parse(fs.readFileSync(out.qaPath, 'utf8'));
  // Tone fixtures carry no vendor request IDs, so QA must not call them verified narration.
  assert.equal(qa.narrationVerified, false);
  assert.ok(Math.abs(qa.loudness.lufs - -16) <= 1.5, `LUFS ${qa.loudness.lufs}`);
  assert.ok(qa.loudness.truePeakDb <= -1, `TP ${qa.loudness.truePeakDb}`);
  assert.ok(qa.quietBeforeRevealSec >= 5);
  assert.ok(fs.existsSync(out.srtPath));
  assert.ok(out.proofs.length >= 3 && out.proofs.every(p => fs.existsSync(p)));
  const proof = await ffprobeJson(out.proofs[0]);
  assert.equal(proof.streams[0].width, 375);
});

test('a TikTok render shows derabona.club only on the end card', { timeout: 240000 }, async () => {
  const dir = tmp();
  const career = careerFor(snap, 'cristiano-ronaldo');
  const script = buildScript(career, 'tiktok');
  const out = await renderVideo({ career, script, narration: narrationFor(dir, script), crests: crestUrls('cristiano-ronaldo'), outDir: dir, crestMode: 'text-only' });
  assert.ok(out.keyframes.filter(k => k.phase !== 'cta').every(k => !/derabona/i.test(k.text.replace(/Jugá más carreras como esta en derabona\.club\./, ''))));
  assert.ok(out.keyframes.some(k => k.phase === 'cta' && /derabona\.club/.test(k.text)));
  const dur = Number((await ffprobeJson(out.mp4Path)).format.duration);
  assert.ok(dur >= 15 && dur <= 40);
});

test('render inputs are re-derived from the pinned commit and must match the job hashes', async () => {
  const { resolveJobSources } = await import('../lib/job.mjs');
  const career = careerFor(snap, 'cristiano-ronaldo');
  const job = { source: { commit: snap.commit, ...snap.hashes }, career };
  const ok = resolveJobSources(job, REPO);
  assert.equal(ok.crests.length, career.clubs.length);
  assert.ok(ok.crests.every(c => c.startsWith('data:image/png;base64,')));
  assert.throws(() => resolveJobSources({ ...job, source: { ...job.source, rosterSha256: '0'.repeat(64) } }, REPO), /rosterSha256/);
  const swapped = { ...career, clubs: career.clubs.map((c, i) => i === 2 ? { ...c, crestSha256: '0'.repeat(64) } : c) };
  assert.throws(() => resolveJobSources({ ...job, career: swapped }, REPO), /crest/);
  const renamed = { ...career, clubs: career.clubs.map((c, i) => i === 0 ? { ...c, name: 'Benfica' } : c) };
  assert.throws(() => resolveJobSources({ ...job, career: renamed }, REPO), /career/);
});
