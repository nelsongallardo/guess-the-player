// All ElevenLabs responses here are MOCKS built from local ffmpeg tones. They
// prove request shape, validation and gating — never that real speech works.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElevenLabsClient, validateAlignment, decodeAudioBase64, narrateSegment, ttsCacheKey, createTtsCache } from '../lib/elevenlabs.mjs';
import { wordsFromAlignment, buildCues, toSrt } from '../lib/captions.mjs';
import { createSpendLedger } from '../lib/spend.mjs';
import { audioStats } from '../lib/probe.mjs';
import { validConfig } from './fixtures.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-audio-'));
const KEY = 'sk_mock_secret_value_123';
const VOICE = 'MockVoice0123456789';

function tone(file, { volume = 0.2, seconds = 1, wave = 'sine' } = {}) {
  const src = wave === 'square' ? `aevalsrc='if(lt(mod(t*440,1),0.5),1,-1)':s=44100:d=${seconds}` : `sine=frequency=440:duration=${seconds}`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-af', `volume=${volume}`, '-c:a', 'libmp3lame', '-b:a', '128k', file]);
  return fs.readFileSync(file);
}

function alignmentFor(text, start = 0, perChar = 0.06) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => +(start + i * perChar).toFixed(3)),
    character_end_times_seconds: characters.map((_, i) => +(start + (i + 1) * perChar).toFixed(3)),
  };
}

function mockFetch(body, { status = 200, headers = { 'request-id': 'req_mock_1' } } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  };
  fn.calls = calls;
  return fn;
}

const REQUEST = { voiceId: VOICE, text: 'Mirá los clubes. ¿Quién es?', modelId: 'eleven_multilingual_v2', voiceSettings: { stability: 0.5, similarity_boost: 0.75 }, dictionaryLocators: [], outputFormat: 'mp3_44100_128' };

test('client posts to the official timestamp route with explicit model and no language_code', async () => {
  const dir = tmp();
  const mp3 = tone(path.join(dir, 'q.mp3'));
  const fetchImpl = mockFetch({ audio_base64: mp3.toString('base64'), alignment: alignmentFor(REQUEST.text), normalized_alignment: alignmentFor(REQUEST.text) });
  const client = createElevenLabsClient({ apiKey: KEY, fetchImpl });
  const out = await client.synthesize(REQUEST);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['xi-api-key'], KEY);
  const body = JSON.parse(init.body);
  assert.equal(body.model_id, 'eleven_multilingual_v2');
  assert.equal(body.text, REQUEST.text);
  assert.ok(!('language_code' in body));
  assert.deepEqual(body.voice_settings, REQUEST.voiceSettings);
  assert.ok(out.audio.equals(mp3));
  assert.equal(out.requestId, 'req_mock_1');
});

test('malformed or non-audio base64 is rejected', () => {
  assert.throws(() => decodeAudioBase64('not base64!!'), /base64/);
  assert.throws(() => decodeAudioBase64(''), /base64/);
  assert.throws(() => decodeAudioBase64('QUJD'), /MP3/); // "ABC"
  assert.throws(() => decodeAudioBase64('SUQz='), /base64/);
});

test('missing, mismatched or non-monotonic alignment is rejected', () => {
  const text = 'Era Mock.';
  assert.doesNotThrow(() => validateAlignment(text, alignmentFor(text)));
  assert.throws(() => validateAlignment(text, null), /alignment/);
  assert.throws(() => validateAlignment(text, alignmentFor('Era Mack.')), /text/);
  const short = alignmentFor(text); short.character_end_times_seconds.pop();
  assert.throws(() => validateAlignment(text, short), /length/);
  const back = alignmentFor(text); back.character_start_times_seconds[4] = 0.01;
  assert.throws(() => validateAlignment(text, back), /monotonic/);
  const inverted = alignmentFor(text); inverted.character_end_times_seconds[2] = 0;
  assert.throws(() => validateAlignment(text, inverted), /end/);
});

test('vendor errors never echo the key or response body', async () => {
  const fetchImpl = mockFetch({ detail: { message: `bad key ${KEY}` }, audio_base64: 'SUQz' }, { status: 401 });
  const client = createElevenLabsClient({ apiKey: KEY, fetchImpl });
  await assert.rejects(client.synthesize(REQUEST), e => {
    assert.match(e.message, /401/);
    assert.ok(!e.message.includes(KEY) && !e.message.includes('SUQz') && !e.message.includes('bad key'));
    return true;
  });
  const thrower = async () => { throw new Error(`connect failed with header xi-api-key: ${KEY}`); };
  await assert.rejects(createElevenLabsClient({ apiKey: KEY, fetchImpl: thrower }).synthesize(REQUEST), e => !e.message.includes(KEY));
});

test('cache key changes with any voice, model, settings or dictionary change', () => {
  const base = ttsCacheKey(REQUEST);
  assert.equal(base, ttsCacheKey({ ...REQUEST }));
  for (const change of [{ voiceId: 'OtherVoice0123456789' }, { modelId: 'eleven_v3' }, { voiceSettings: { stability: 0.6, similarity_boost: 0.75 } },
    { dictionaryLocators: [{ pronunciation_dictionary_id: 'd', version_id: 'v2' }] }, { text: 'Mirá los clubes.' }, { outputFormat: 'mp3_22050_32' }]) {
    assert.notEqual(ttsCacheKey({ ...REQUEST, ...change }), base, JSON.stringify(change));
  }
});

function setup({ config = validConfig(), body } = {}) {
  const dir = tmp();
  const mp3 = tone(path.join(dir, 'q.mp3'));
  const fetchImpl = mockFetch(body ?? { audio_base64: mp3.toString('base64'), alignment: alignmentFor(REQUEST.text), normalized_alignment: alignmentFor(REQUEST.text) });
  return {
    dir, fetchImpl,
    deps: { client: createElevenLabsClient({ apiKey: KEY, fetchImpl }), cache: createTtsCache(path.join(dir, 'tts')), spend: createSpendLedger(path.join(dir, 'spend.json'), config), config, stateDir: dir },
  };
}

test('an accepted segment is cached and reused without another paid call', async () => {
  const { fetchImpl, deps } = setup();
  const first = await narrateSegment(deps, REQUEST);
  assert.equal(first.cached, false);
  assert.ok(fs.existsSync(first.audioPath));
  assert.equal((fs.statSync(first.audioPath).mode & 0o777), 0o600);
  const again = await narrateSegment(deps, REQUEST);
  assert.equal(again.cached, true);
  assert.equal(again.audioPath, first.audioPath);
  assert.equal(fetchImpl.calls.length, 1);
});

test('disabled lane, unauthorized TTS, PAUSE or unknown rate make no request', async () => {
  for (const [label, config] of [['disabled', validConfig({ enabled: false })], ['unauthorized', validConfig({ tts: { authorized: false } })], ['rate', validConfig({ rates: { ttsUsdPerCharacter: null } })]]) {
    const { fetchImpl, deps } = setup({ config });
    await assert.rejects(narrateSegment(deps, REQUEST), label);
    assert.equal(fetchImpl.calls.length, 0, label);
  }
  const { fetchImpl, deps, dir } = setup();
  fs.writeFileSync(path.join(dir, 'PAUSE'), '');
  await assert.rejects(narrateSegment(deps, REQUEST), /PAUSE/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('spend cap exhaustion stops before the request and counts failed attempts', async () => {
  const tiny = validConfig({ caps: { variableUsd: 0.005, ttsCharacters: 2000 } }); // 27 chars * 0.0003 = 0.0081 > cap
  const { fetchImpl, deps } = setup({ config: tiny });
  await assert.rejects(narrateSegment(deps, REQUEST), /cap/);
  assert.equal(fetchImpl.calls.length, 0);

  const bad = setup({ body: { audio_base64: 'QUJD', alignment: alignmentFor(REQUEST.text) } });
  for (let i = 0; i < 3; i++) await assert.rejects(narrateSegment(bad.deps, REQUEST), /MP3/);
  await assert.rejects(narrateSegment(bad.deps, REQUEST), /attempt/);
  assert.equal(bad.fetchImpl.calls.length, 3);
  assert.equal(bad.deps.spend.totals().reservedUsd > 0, true);
});

test('clipped audio is detected and not accepted', async () => {
  const dir = tmp();
  const loud = path.join(dir, 'loud.mp3');
  tone(loud, { volume: 4, wave: 'square' });
  assert.equal((await audioStats(loud)).clipped, true);
  const quiet = path.join(dir, 'quiet.mp3');
  tone(quiet, { volume: 0.2 });
  const stats = await audioStats(quiet);
  assert.equal(stats.clipped, false);
  assert.ok(stats.durationSec > 0.9 && stats.durationSec < 1.2);

  const loudBytes = fs.readFileSync(loud);
  const { deps } = setup({ body: { audio_base64: loudBytes.toString('base64'), alignment: alignmentFor(REQUEST.text) } });
  await assert.rejects(narrateSegment(deps, REQUEST), /clip/);
  assert.equal(deps.cache.get(ttsCacheKey(REQUEST)), null);
});

test('caption words come from alignment with segment offsets and display spelling', () => {
  const text = 'Mirá los clubes. ¿Quién es?';
  const words = wordsFromAlignment(text, alignmentFor(text, 0.1, 0.05), 2);
  assert.deepEqual(words.map(w => w.text), ['Mirá', 'los', 'clubes.', '¿Quién', 'es?']);
  assert.equal(words[0].start, 2.1);
  assert.ok(words.every((w, i) => w.end > w.start && (i === 0 || w.start >= words[i - 1].end)));
  assert.throws(() => wordsFromAlignment(text, undefined, 0), /alignment/);
});

test('cues have at most two lines and SRT keeps exact text', () => {
  const text = 'Era Juan Román Riquelme y esto es una frase bastante larga para partir.';
  const cues = buildCues(wordsFromAlignment(text, alignmentFor(text), 18), { maxCharsPerLine: 18, maxLines: 2 });
  assert.ok(cues.length >= 2);
  assert.ok(cues.every(c => c.lines.length <= 2 && c.lines.every(l => l.length <= 18)));
  assert.equal(cues.flatMap(c => c.lines).join(' '), text);
  const srt = toSrt(cues);
  assert.match(srt, /^1\n00:00:18,000 --> /);
  assert.ok(srt.includes('Román'));
  assert.throws(() => buildCues([{ text: 'Supercalifragilisticoespialidoso', start: 0, end: 1 }], { maxCharsPerLine: 10, maxLines: 2 }), /line/);
});
