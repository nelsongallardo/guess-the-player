// Azure AI Speech (free F0 tier). BOUNDARIES is the word-boundary event list a
// real es-AR-TomasNeural request returned on 2026-10-12; audio here is a local
// ffmpeg tone. These prove conversion, request shape and gating only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { alignmentFromBoundaries, createAzureTtsClient } from '../lib/azure-tts.mjs';
import { narrateSegment, ttsCacheKey, createTtsCache } from '../lib/elevenlabs.mjs';
import { validateAlignment, wordsFromAlignment } from '../lib/captions.mjs';
import { createSpendLedger } from '../lib/spend.mjs';
import { validateConfig } from '../lib/config.mjs';
import { licenseComplete } from '../lib/approval.mjs';
import { validConfig } from './fixtures.mjs';

const TEXT = 'Mirá los clubes. ¿Quién es? Era Vladimír Šmicer.';
const BOUNDARIES = [
  { text: 'Mirá', textOffset: 0, wordLength: 4, audioOffset: 500000, duration: 2500000 },
  { text: 'los', textOffset: 5, wordLength: 3, audioOffset: 3375000, duration: 1250000 },
  { text: 'clubes', textOffset: 9, wordLength: 6, audioOffset: 5250000, duration: 4750000 },
  { text: '.', textOffset: 15, wordLength: 1, audioOffset: 10375000, duration: 375000 },
  { text: '¿Quién', textOffset: 17, wordLength: 6, audioOffset: 19125000, duration: 2375000 },
  { text: 'es', textOffset: 24, wordLength: 2, audioOffset: 21500000, duration: 3500000 },
  { text: '?', textOffset: 26, wordLength: 1, audioOffset: 25875000, duration: 0 },
  { text: 'Era', textOffset: 28, wordLength: 3, audioOffset: 34375000, duration: 2125000 },
  { text: 'Vladimír', textOffset: 32, wordLength: 8, audioOffset: 36875000, duration: 4250000 },
  { text: 'Šmicer', textOffset: 41, wordLength: 6, audioOffset: 41500000, duration: 3625000 },
  { text: '.', textOffset: 47, wordLength: 1, audioOffset: 45875000, duration: 375000 },
];
const KEY = 'azure_mock_secret_key_456';
const REQUEST = { provider: 'azure', text: TEXT, voiceName: 'es-AR-TomasNeural', outputFormat: 'Audio24Khz96KBitRateMonoMp3' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-azure-'));
const toneMp3 = dir => {
  const f = path.join(dir, 't.mp3');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-af', 'volume=0.2', '-c:a', 'libmp3lame', '-b:a', '96k', f]);
  return fs.readFileSync(f);
};

test('Azure word boundaries become a character alignment whose words carry the exact reported times', () => {
  const alignment = alignmentFromBoundaries(TEXT, BOUNDARIES);
  assert.equal(validateAlignment(TEXT, alignment), true);
  const words = wordsFromAlignment(TEXT, alignment, 0);
  assert.deepEqual(words.map(w => w.text), ['Mirá', 'los', 'clubes.', '¿Quién', 'es?', 'Era', 'Vladimír', 'Šmicer.']);
  assert.deepEqual(words[0], { text: 'Mirá', start: 0.05, end: 0.3 });
  assert.deepEqual(words[3], { text: '¿Quién', start: 1.913, end: 2.15 });
  assert.deepEqual(words[4], { text: 'es?', start: 2.15, end: 2.588 });
  assert.deepEqual(words[7], { text: 'Šmicer.', start: 4.15, end: 4.625 });
});

test('boundaries that do not match the text, go backwards or are missing are rejected, never guessed', () => {
  assert.throws(() => alignmentFromBoundaries(TEXT, []), /boundar/);
  assert.throws(() => alignmentFromBoundaries(TEXT, BOUNDARIES.map((b, i) => (i === 8 ? { ...b, text: 'Vladimir' } : b))), /does not match/);
  assert.throws(() => alignmentFromBoundaries(TEXT, BOUNDARIES.map((b, i) => (i === 2 ? { ...b, audioOffset: 100000 } : b))), /backwards|monotonic/);
  assert.throws(() => alignmentFromBoundaries(TEXT, BOUNDARIES.filter((_, i) => i !== 5)), /no boundary/);
});

test('the client sends the explicit voice and format, returns MP3 + alignment + result ID, and never echoes the key', async () => {
  const mp3 = toneMp3(tmp());
  const calls = [];
  const client = createAzureTtsClient({ key: KEY, region: 'eastus', speak: async args => { calls.push(args); return { audio: mp3, boundaries: BOUNDARIES, resultId: 'RESULT123' }; } });
  const r = await client.synthesize(REQUEST);
  assert.deepEqual(calls, [{ key: KEY, region: 'eastus', text: TEXT, voiceName: 'es-AR-TomasNeural', outputFormat: 'Audio24Khz96KBitRateMonoMp3', timeoutMs: 60000 }]);
  assert.equal(r.requestId, 'RESULT123');
  assert.deepEqual(r.audio, mp3);
  assert.equal(validateAlignment(TEXT, r.alignment), true);

  for (const bad of [{ voiceName: 'Tomas' }, { outputFormat: 'Riff24Khz16BitMonoPcm' }, { text: ' ' }]) await assert.rejects(client.synthesize({ ...REQUEST, ...bad }), JSON.stringify(bad));
  assert.throws(() => createAzureTtsClient({ key: '', region: 'eastus' }), /AZURE_SPEECH_KEY/);
  assert.throws(() => createAzureTtsClient({ key: KEY, region: 'east us' }), /region/);
  const failing = createAzureTtsClient({ key: KEY, region: 'eastus', speak: async () => { throw new Error(`401 for key ${KEY}`); } });
  await assert.rejects(failing.synthesize(REQUEST), e => !e.message.includes(KEY));
  const notMp3 = createAzureTtsClient({ key: KEY, region: 'eastus', speak: async () => ({ audio: Buffer.from('RIFFxxxx'), boundaries: BOUNDARIES, resultId: 'R' }) });
  await assert.rejects(notMp3.synthesize(REQUEST), /MP3/);
});

test('the cache key changes with the Azure voice, format or text', () => {
  const base = ttsCacheKey(REQUEST);
  assert.equal(base, ttsCacheKey({ ...REQUEST }));
  for (const change of [{ voiceName: 'es-AR-ElenaNeural' }, { outputFormat: 'Audio48Khz192KBitRateMonoMp3' }, { text: 'Mirá los clubes.' }]) assert.notEqual(ttsCacheKey({ ...REQUEST, ...change }), base);
});

test('a free provider needs a known zero rate and is still bounded by the character cap', async () => {
  const free = validConfig({ rates: { ttsUsdPerCharacter: 0, storageUsdPerGbMonth: null, egressUsdPerGb: null }, caps: { variableUsd: 0, ttsCharacters: 60 } });
  assert.deepEqual(validateConfig(free), []);
  const dir = tmp();
  const mp3 = toneMp3(dir);
  let calls = 0;
  const deps = {
    client: createAzureTtsClient({ key: KEY, region: 'eastus', speak: async () => { calls++; return { audio: mp3, boundaries: BOUNDARIES, resultId: `R${calls}` }; } }),
    cache: createTtsCache(path.join(dir, 'tts')), spend: createSpendLedger(path.join(dir, 'spend.json'), free), config: free, stateDir: dir,
  };
  const first = await narrateSegment(deps, REQUEST);
  assert.equal(first.cached, false);
  assert.equal(first.requestId, 'R1');
  assert.equal((await narrateSegment(deps, REQUEST)).cached, true);
  assert.equal(calls, 1);
  await assert.rejects(narrateSegment(deps, { ...REQUEST, voiceName: 'es-AR-ElenaNeural' }), /character cap/);
  assert.equal(calls, 1);
  assert.equal(deps.spend.totals().reservedUsd, 0);
});

test('an Azure free-tier licence record is complete only with the voice, plan and evidence', () => {
  const azure = { ttsProvider: 'azure', ttsPlan: 'F0', ttsCommercialUse: true, voiceId: 'es-AR-TomasNeural', modelId: 'neural', evidence: 'Azure Speech F0 resource, eastus, created 2026-10-12', crests: 'embedded', music: 'none' };
  assert.equal(licenseComplete(azure), true);
  for (const bad of [{ voiceId: 'MockVoice0123456789' }, { ttsPlan: '' }, { evidence: ' ' }, { ttsCommercialUse: null }, { ttsProvider: 'edge' }]) assert.equal(licenseComplete({ ...azure, ...bad }), false, JSON.stringify(bad));
});
