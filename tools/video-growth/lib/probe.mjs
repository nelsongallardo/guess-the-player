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

// Integrated loudness and true peak of a finished file.
export async function loudness(file) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const lufs = Number(summary.match(/I:\s*(-?[\d.]+)\s*LUFS/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s*(-?[\d.]+)\s*dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeak)) throw new Error(`could not measure loudness of ${file}`);
  return { lufs, truePeakDb: truePeak };
}
