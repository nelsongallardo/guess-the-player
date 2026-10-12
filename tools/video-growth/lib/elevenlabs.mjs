// Official ElevenLabs "create speech with timing" client plus the gated,
// cached narration step. Never logs the key, raw base64 or vendor bodies.
// Reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps

import fs from 'node:fs';
import path from 'node:path';
import { digest, sha256 } from './manifest.mjs';
import { writeGate } from './config.mjs';
import { validateAlignment } from './captions.mjs';
import { audioStats } from './probe.mjs';

export { validateAlignment };
export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
export const MAX_ATTEMPTS = 3; // first try + two regenerations per segment

const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decodeAudioBase64(value) {
  if (typeof value !== 'string' || !value || !B64.test(value)) throw new Error('audio_base64 is not valid base64');
  const bytes = Buffer.from(value, 'base64');
  const id3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
  const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !frameSync) throw new Error('decoded audio is not MP3');
  return bytes;
}

function assertRequest(r) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(r.voiceId ?? '')) throw new Error('voiceId is missing or malformed');
  if (typeof r.text !== 'string' || !r.text.trim()) throw new Error('text is required');
  if (typeof r.modelId !== 'string' || !r.modelId) throw new Error('modelId must be explicit');
  if (!r.voiceSettings || typeof r.voiceSettings !== 'object') throw new Error('voiceSettings must be explicit');
  if (!/^mp3_\d+_\d+$/.test(r.outputFormat ?? '')) throw new Error('outputFormat must be an explicit mp3 format');
}

export function createElevenLabsClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('ELEVENLABS_API_KEY is not configured');
  return Object.freeze({
    async synthesize(request) {
      assertRequest(request);
      const url = `${ELEVENLABS_BASE}/v1/text-to-speech/${request.voiceId}/with-timestamps?output_format=${request.outputFormat}`;
      const body = { text: request.text, model_id: request.modelId, voice_settings: request.voiceSettings };
      if (request.dictionaryLocators?.length) body.pronunciation_dictionary_locators = request.dictionaryLocators;
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { throw new Error('ElevenLabs request failed before a response (network/timeout); details withheld'); }
      if (res.status !== 200) throw new Error(`ElevenLabs HTTP ${res.status}; response body withheld`);
      let json;
      try { json = await res.json(); } catch { throw new Error('ElevenLabs response was not JSON'); }
      const audio = decodeAudioBase64(json?.audio_base64);
      validateAlignment(request.text, json.alignment);
      return { audio, alignment: json.alignment, normalizedAlignment: json.normalized_alignment ?? null, requestId: res.headers.get('request-id') };
    },
  });
}

export function ttsCacheKey(r) {
  return digest({ text: r.text, voiceId: r.voiceId, modelId: r.modelId, voiceSettings: r.voiceSettings, dictionaryLocators: r.dictionaryLocators ?? [], outputFormat: r.outputFormat });
}

// Accepted audio, keyed by exact request. Reusing approved bytes (not
// regenerating) is what keeps an approval valid: TTS is nondeterministic.
export function createTtsCache(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const paths = key => ({ audio: path.join(dir, `${key}.mp3`), meta: path.join(dir, `${key}.json`) });
  return {
    get(key) {
      const p = paths(key);
      if (!fs.existsSync(p.meta) || !fs.existsSync(p.audio)) return null;
      const meta = JSON.parse(fs.readFileSync(p.meta, 'utf8'));
      if (sha256(fs.readFileSync(p.audio)) !== meta.audioSha256) throw new Error(`cached audio ${key} does not match its recorded hash`);
      return { ...meta, audioPath: p.audio };
    },
    put(key, result, tmpAudioPath, stats) {
      const p = paths(key);
      fs.renameSync(tmpAudioPath, p.audio);
      fs.chmodSync(p.audio, 0o600);
      const meta = { key, audioSha256: sha256(fs.readFileSync(p.audio)), alignment: result.alignment, normalizedAlignment: result.normalizedAlignment, requestId: result.requestId, stats };
      fs.writeFileSync(p.meta, JSON.stringify(meta, null, 2), { mode: 0o600 });
      return { ...meta, audioPath: p.audio };
    },
    dir,
  };
}

// One narration segment: cache → gates → reservation → one request → checks.
export async function narrateSegment({ client, cache, spend, config, stateDir }, request) {
  const key = ttsCacheKey(request);
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  writeGate(config, { stateDir });
  if (config.tts?.authorized !== true) throw new Error('paid TTS is not authorized (config.tts.authorized is false)');
  if (spend.attempts(key) >= MAX_ATTEMPTS) throw new Error(`segment reached ${MAX_ATTEMPTS} attempts; owner review required`);
  spend.reserveTts({ key, characters: [...request.text].length });

  const result = await client.synthesize(request);
  const tmp = path.join(cache.dir, `${key}.${process.pid}.tmp.mp3`);
  fs.writeFileSync(tmp, result.audio, { mode: 0o600 });
  let stats;
  try {
    stats = await audioStats(tmp);
    if (stats.clipped) throw new Error(`segment audio is clipped (peak ${stats.peakDb} dBFS)`);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  return { ...cache.put(key, result, tmp, stats), cached: false };
}
