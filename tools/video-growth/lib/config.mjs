// Private lane config. Ships disabled: no channels, zero caps, TTS unauthorized.
// A Buffer key can reach every organization on the account, so the channel
// allowlist here — not the key's scope — is the boundary.

import fs from 'node:fs';
import path from 'node:path';
import { PLATFORMS } from './manifest.mjs';

export function defaultConfig() {
  return {
    schemaVersion: 1,
    enabled: false,
    buffer: { organizationId: null, channels: [] },
    caps: { variableUsd: 0, ttsCharacters: 0 },
    rates: { ttsUsdPerCharacter: null },
    hosting: { allowedHosts: [] },
    tts: { authorized: false },
  };
}

const SHAPE = {
  schemaVersion: null, enabled: null,
  buffer: ['organizationId', 'channels'],
  caps: ['variableUsd', 'ttsCharacters'],
  rates: ['ttsUsdPerCharacter'],
  hosting: ['allowedHosts'],
  tts: ['authorized'],
};

export function validateConfig(c) {
  const errors = [];
  const err = m => errors.push(m);
  if (!c || typeof c !== 'object') return ['config must be an object'];
  for (const k of Object.keys(c)) if (!(k in SHAPE)) err(`unknown config key: ${k}`);
  for (const [k, sub] of Object.entries(SHAPE)) {
    if (!sub) continue;
    if (!c[k] || typeof c[k] !== 'object') { err(`config.${k} is required`); continue; }
    for (const s of Object.keys(c[k])) if (!sub.includes(s)) err(`unknown config key: ${k}.${s}`);
  }
  if (errors.length) return errors;
  if (c.schemaVersion !== 1) err('config.schemaVersion must be 1');
  if (typeof c.enabled !== 'boolean') err('config.enabled must be a boolean');
  if (c.buffer.organizationId !== null && typeof c.buffer.organizationId !== 'string') err('buffer.organizationId must be a string or null');
  if (!Array.isArray(c.buffer.channels)) err('buffer.channels must be an array');
  else c.buffer.channels.forEach((ch, i) => {
    if (!PLATFORMS.includes(ch?.platform)) err(`buffer.channels[${i}].platform must be one of ${PLATFORMS.join(', ')}`);
    for (const k of ['channelId', 'nativeAccount']) if (typeof ch?.[k] !== 'string' || !ch[k]) err(`buffer.channels[${i}].${k} is required`);
    for (const k of Object.keys(ch ?? {})) if (!['platform', 'channelId', 'nativeAccount'].includes(k)) err(`unknown config key: buffer.channels[${i}].${k}`);
  });
  for (const k of ['variableUsd', 'ttsCharacters']) if (!Number.isFinite(c.caps[k]) || c.caps[k] < 0) err(`caps.${k} must be a non-negative number`);
  const rate = c.rates.ttsUsdPerCharacter;
  if (rate !== null && !(Number.isFinite(rate) && rate > 0)) err('rates.ttsUsdPerCharacter must be a positive number or null (unknown)');
  if (!Array.isArray(c.hosting.allowedHosts) || c.hosting.allowedHosts.some(h => typeof h !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h))) err('hosting.allowedHosts must be DNS hostnames');
  if (typeof c.tts.authorized !== 'boolean') err('tts.authorized must be a boolean');
  return errors;
}

// Missing file = disabled default. Present-but-broken = fail closed.
export function loadConfig(file) {
  if (!fs.existsSync(file)) return defaultConfig();
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`config at ${file} is not valid JSON; refusing to run`); }
  const errors = validateConfig(parsed);
  if (errors.length) throw new Error(`invalid config at ${file}:\n- ${errors.join('\n- ')}`);
  return parsed;
}

export function isPaused(stateDir) {
  return fs.existsSync(path.join(stateDir, 'PAUSE'));
}

// Called immediately before every paid or network write.
export function writeGate(config, { stateDir, target }) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(`invalid config: ${errors[0]}`);
  if (config.enabled !== true) throw new Error('video lane is disabled (config.enabled is false)');
  if (isPaused(stateDir)) throw new Error('video lane is paused (PAUSE file present)');
  if (target) {
    const ok = config.buffer.channels.some(ch => ch.platform === target.platform
      && ch.channelId === target.channelId && ch.nativeAccount === target.nativeAccount);
    if (!ok) throw new Error(`target ${target.platform}/${target.channelId} is not on the channel allowlist`);
  }
  return true;
}
