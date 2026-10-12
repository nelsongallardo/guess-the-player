// Azure AI Speech text to speech (owner chose the free F0 tier, 2026-10-12)
// through the official Speech SDK, which reports word boundaries. Never logs
// the key or vendor error bodies.
// Reference: https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis

import { validateAlignment } from './captions.mjs';

const VOICE_RE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/;
const FORMAT_RE = /^Audio\d+Khz\d+KBitRateMonoMp3$/;
const TICKS_PER_SECOND = 1e7;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function assertMp3(bytes) {
  const b = Buffer.from(bytes ?? []);
  const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
  const frameSync = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;
  if (!id3 && !frameSync) throw new Error('Azure audio is not MP3');
  return b;
}

// Every character of a reported word gets that word's start and end, so
// caption words keep exactly the times Azure reported. Unreported characters
// (spaces, unvoiced punctuation) repeat the previous timing. A letter or digit
// with no boundary is an error: nothing is estimated.
export function alignmentFromBoundaries(text, boundaries) {
  if (!Array.isArray(boundaries) || !boundaries.length) throw new Error('Azure returned no word boundaries; captions cannot be timed');
  const chars = [...text];
  // Azure offsets count UTF-16 code units; captions index code points.
  const unitToPoint = [];
  chars.forEach((ch, i) => { for (let u = 0; u < ch.length; u++) unitToPoint.push(i); });
  const start = new Array(chars.length).fill(null);
  const end = new Array(chars.length).fill(null);
  let lastStart = -Infinity;
  for (const b of boundaries) {
    const { textOffset: off, wordLength: len } = b;
    if (!Number.isInteger(off) || !Number.isInteger(len) || len < 1 || text.slice(off, off + len) !== b.text) {
      throw new Error(`Azure boundary "${String(b.text).slice(0, 20)}" does not match the requested text at ${off}`);
    }
    const s = b.audioOffset / TICKS_PER_SECOND;
    const e = (b.audioOffset + b.duration) / TICKS_PER_SECOND;
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < s) throw new Error(`Azure boundary "${b.text}" has invalid timing`);
    if (s < lastStart) throw new Error(`Azure boundaries go backwards at "${b.text}"`);
    lastStart = s;
    for (let p = unitToPoint[off]; p <= unitToPoint[off + len - 1]; p++) { start[p] = s; end[p] = e; }
  }
  let prevS = 0, prevE = 0;
  for (let i = 0; i < chars.length; i++) {
    if (start[i] === null) {
      if (WORD_CHAR.test(chars[i])) throw new Error(`Azure reported no boundary for "${chars[i]}" at ${i}; captions cannot be timed`);
      start[i] = prevS; end[i] = prevE;
    }
    prevS = start[i]; prevE = end[i];
  }
  const alignment = { characters: chars, character_start_times_seconds: start, character_end_times_seconds: end };
  validateAlignment(text, alignment);
  return alignment;
}

async function sdkSpeak({ key, region, text, voiceName, outputFormat, timeoutMs }) {
  const { default: sdk } = await import('microsoft-cognitiveservices-speech-sdk');
  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechSynthesisVoiceName = voiceName;
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat[outputFormat];
  const synth = new sdk.SpeechSynthesizer(config, null);
  const boundaries = [];
  synth.wordBoundary = (_s, e) => boundaries.push({ text: e.text, textOffset: e.textOffset, wordLength: e.wordLength, audioOffset: e.audioOffset, duration: e.duration });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      synth.speakTextAsync(text, r => {
        clearTimeout(timer);
        if (r.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
          const c = sdk.CancellationDetails.fromResult(r);
          return reject(new Error(`synthesis ${sdk.ResultReason[r.reason]} (${sdk.CancellationErrorCode[c.ErrorCode] ?? 'unknown'})`));
        }
        resolve({ audio: Buffer.from(r.audioData), boundaries, resultId: r.resultId });
      }, () => { clearTimeout(timer); reject(new Error('synthesis failed')); });
    });
  } finally { synth.close(); }
}

export function createAzureTtsClient({ key, region, speak = sdkSpeak, timeoutMs = 60000 } = {}) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('AZURE_SPEECH_KEY is not configured');
  if (typeof region !== 'string' || !/^[a-z0-9]+$/.test(region)) throw new Error('AZURE_SPEECH_REGION must be a region name like eastus');
  return Object.freeze({
    async synthesize(request) {
      if (request?.provider !== 'azure') throw new Error('request is not an Azure request');
      if (!VOICE_RE.test(request.voiceName ?? '')) throw new Error('voiceName must be an explicit Azure neural voice like es-AR-TomasNeural');
      if (!FORMAT_RE.test(request.outputFormat ?? '')) throw new Error('outputFormat must be an explicit Azure MP3 format');
      if (typeof request.text !== 'string' || !request.text.trim()) throw new Error('text is required');
      let r;
      try { r = await speak({ key, region, text: request.text, voiceName: request.voiceName, outputFormat: request.outputFormat, timeoutMs }); }
      catch (e) {
        const safe = String(e?.message ?? '').split(key).join('[redacted]');
        throw new Error(`Azure Speech request failed: ${/^(synthesis|timeout)/.test(safe) ? safe.slice(0, 120) : 'details withheld'}`);
      }
      const audio = assertMp3(r.audio);
      if (typeof r.resultId !== 'string' || !r.resultId) throw new Error('Azure returned no result ID');
      return { audio, alignment: alignmentFromBoundaries(request.text, r.boundaries), normalizedAlignment: null, requestId: r.resultId };
    },
  });
}
