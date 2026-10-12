#!/usr/bin/env node
// Render one platform derivative from a private job manifest and already
// accepted narration. Never generates (or pays for) audio.
//
//   node render.mjs --manifest JOB.json --narration NARRATION.json --platform youtube --out DIR
//
// NARRATION.json: { question: {audioPath,text,alignment,requestId}, answer: {...}, cta: {...}|null }
// as written by narrate.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readJob, resolveJobSources } from './lib/job.mjs';
import { buildScript, validateScript } from './lib/script.mjs';
import { renderVideo } from './lib/render.mjs';

const { values: a } = parseArgs({ options: { manifest: { type: 'string' }, narration: { type: 'string' }, platform: { type: 'string' }, out: { type: 'string' } } });
if (!a.manifest || !a.narration || !a.platform || !a.out) {
  console.error('usage: render.mjs --manifest JOB.json --narration NARRATION.json --platform youtube|tiktok --out DIR');
  process.exit(2);
}
const repo = process.env.DERABONA_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  const job = readJob(a.manifest);
  if (!job.targets.some(t => t.platform === a.platform)) throw new Error(`job has no ${a.platform} target`);
  const { crests } = resolveJobSources(job, repo);
  const script = buildScript(job.career, a.platform);
  const errors = validateScript(script, job.career);
  if (errors.length) throw new Error(`script rejected: ${errors.join('; ')}`);
  const narration = JSON.parse(fs.readFileSync(a.narration, 'utf8'));
  const out = await renderVideo({ career: job.career, script, narration, crests, outDir: a.out, crestMode: job.license.crests });
  console.log(JSON.stringify({ mp4: out.mp4Path, sha256: out.qa.mp4Sha256, qa: out.qaPath, srt: out.srtPath, proofs: out.proofs, loudnessOk: out.qa.loudnessOk, narrationVerified: out.qa.narrationVerified }, null, 2));
  if (!out.qa.loudnessOk) process.exitCode = 1;
} catch (e) {
  console.error(`render refused: ${e.message}`);
  process.exit(1);
}
