// ffprobe/ffmpeg measurements. Arguments are always arrays; no shell.

import { execFile } from 'node:child_process';

export function run(cmd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${cmd} failed: ${String(stderr).split('\n').filter(Boolean).slice(-3).join(' | ')}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function ffprobeJson(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(stdout);
}

export const CLIP_DBFS = -0.1;

export async function audioStats(file) {
  const [{ stderr }, probe] = await Promise.all([
    run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'astats=measure_perchannel=none', '-f', 'null', '-']),
    ffprobeJson(file),
  ]);
  const peak = stderr.match(/Overall[\s\S]*?Peak level dB:\s*(-?[\d.]+|-inf)/);
  if (!peak) throw new Error(`could not measure peak level of ${file}`);
  const peakDb = peak[1] === '-inf' ? -Infinity : Number(peak[1]);
  const durationSec = Number(probe.format?.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error(`could not measure duration of ${file}`);
  return { peakDb, durationSec, clipped: peakDb >= CLIP_DBFS };
}

// Mean absolute grey-level distance between one encoded frame and two PNGs,
// at 108x192. Used to prove which state an encoded frame actually shows.
function gray(input, select = '') {
  const vf = `${select}scale=108:192,format=gray`;
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'error', '-i', input, '-vf', vf, '-frames:v', '1', '-f', 'rawvideo', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 24 }, (e, out) => (e || !out.length ? reject(new Error(`ffmpeg could not extract a frame from ${input}`)) : resolve(out)));
  });
}

export async function frameDistance(video, frameIndex, pngA, pngB) {
  const [f, a, b] = await Promise.all([gray(video, `select=eq(n\\,${frameIndex}),`), gray(pngA), gray(pngB)]);
  const dist = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
  return { toA: dist(f, a), toB: dist(f, b) };
}

// Integrated loudness and true peak of a finished file.
export async function loudness(file) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const lufs = Number(summary.match(/I:\s*(-?[\d.]+)\s*LUFS/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s*(-?[\d.]+)\s*dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeak)) throw new Error(`could not measure loudness of ${file}`);
  return { lufs, truePeakDb: truePeak };
}
