#!/usr/bin/env node
// PAID: generates ElevenLabs narration for one job/platform. Requires the lane
// enabled, config.tts.authorized, a known rate and cap, the approved voice and
// ELEVENLABS_API_KEY from approved engineering secret storage. Accepted audio
// is cached by exact request; re-running reuses it at no cost.
//
//   ELEVENLABS_API_KEY=… node narrate.mjs --manifest JOB.json --platform youtube --state DIR \
//     --voice-id VOICE --model-id eleven_multilingual_v2 --settings '{"stability":0.5,"similarity_boost":0.75}' \
//     --out NARRATION.json --authorize-spend

import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJob, writePrivateJson } from './lib/job.mjs';
import { loadConfig } from './lib/config.mjs';
import { buildScript, validateScript } from './lib/script.mjs';
import { createElevenLabsClient, createTtsCache, narrateSegment } from './lib/elevenlabs.mjs';
import { createSpendLedger } from './lib/spend.mjs';

const { values: a } = parseArgs({ options: {
  manifest: { type: 'string' }, platform: { type: 'string' }, state: { type: 'string' }, 'voice-id': { type: 'string' }, 'model-id': { type: 'string' },
  settings: { type: 'string' }, dictionary: { type: 'string' }, out: { type: 'string' }, 'authorize-spend': { type: 'boolean' },
} });
try {
  for (const k of ['manifest', 'platform', 'state', 'voice-id', 'model-id', 'settings', 'out']) if (!a[k]) throw new Error(`--${k} is required`);
  if (!a['authorize-spend']) throw new Error('narration is paid; pass --authorize-spend only with the owner\'s spend approval');
  const job = readJob(a.manifest);
  const script = buildScript(job.career, a.platform);
  const errors = validateScript(script, job.career);
  if (errors.length) throw new Error(`script rejected: ${errors.join('; ')}`);
  const config = loadConfig(path.join(a.state, 'config.json'));
  const deps = {
    client: createElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }),
    cache: createTtsCache(path.join(a.state, 'tts-cache')),
    spend: createSpendLedger(path.join(a.state, 'spend.json'), config),
    config, stateDir: a.state,
  };
  const base = { voiceId: a['voice-id'], modelId: a['model-id'], voiceSettings: JSON.parse(a.settings), dictionaryLocators: a.dictionary ? JSON.parse(a.dictionary) : [], outputFormat: 'mp3_44100_128' };
  const narration = {};
  for (const seg of ['question', 'answer', 'cta']) {
    const text = script.narration[seg];
    if (text == null) { narration[seg] = null; continue; }
    const r = await narrateSegment(deps, { ...base, text });
    narration[seg] = { audioPath: r.audioPath, text, alignment: r.alignment, requestId: r.requestId, audioSha256: r.audioSha256, cached: r.cached };
    console.log(`${seg}: ${r.cached ? 'cached' : 'generated'} ${r.audioSha256.slice(0, 12)}`);
  }
  writePrivateJson(a.out, { voice: base, ...narration });
  console.log(`wrote ${a.out}; listen to every segment before rendering for review`);
} catch (e) {
  console.error(`narration refused: ${e.message}`);
  process.exit(1);
}
