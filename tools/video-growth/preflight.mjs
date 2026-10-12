#!/usr/bin/env node
// Read-only gate report. Never writes to any vendor, host or ledger.
//
//   node preflight.mjs --mode offline --state DIR
//   BUFFER_API_KEY=… node preflight.mjs --mode readonly --target youtube --state DIR
//
// Exit 0 only when every checked gate is open.

import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, validateConfig, isPaused } from './lib/config.mjs';
import { createBufferClient, assertChannelMatches, TIKTOK_DRAFT_ONLY } from './lib/buffer.mjs';

const { values: a } = parseArgs({ options: { mode: { type: 'string' }, target: { type: 'string' }, state: { type: 'string' } } });
if (!['offline', 'readonly'].includes(a.mode) || !a.state || (a.mode === 'readonly' && !['youtube', 'tiktok'].includes(a.target))) {
  console.error('usage: preflight.mjs --mode offline --state DIR | --mode readonly --target youtube|tiktok --state DIR');
  process.exit(2);
}

let config;
try { config = loadConfig(path.join(a.state, 'config.json')); } catch (e) { console.error(e.message); process.exit(1); }
const gates = {
  'config valid': validateConfig(config).length === 0,
  enabled: config.enabled === true,
  'not paused': !isPaused(a.state),
  'channel allowlist': config.buffer.channels.length > 0 && !!config.buffer.organizationId,
  'tts authorized': config.tts.authorized === true,
  'tts rate known': config.rates.ttsUsdPerCharacter !== null,
  'hosting rates known': config.rates.storageUsdPerGbMonth !== null && config.rates.egressUsdPerGb !== null,
  'variable cap > 0': config.caps.variableUsd > 0,
  'media host allowlisted': config.hosting.allowedHosts.length > 0,
};
console.log(`enabled: ${config.enabled}`);
for (const [k, v] of Object.entries(gates)) console.log(`${v ? 'OPEN  ' : 'CLOSED'} ${k}`);
console.log('youtube: mapping implemented; delivery unverified until G6 smoke readback');
console.log(`tiktok: draft-only — ${TIKTOK_DRAFT_ONLY}`);

if (a.mode === 'readonly') {
  if (!process.env.BUFFER_API_KEY) { console.error('BUFFER_API_KEY is not set; owner-approved engineering secret required for read-only discovery'); process.exit(1); }
  try {
    const client = createBufferClient({ apiKey: process.env.BUFFER_API_KEY });
    const orgs = await client.organizations();
    if (!orgs.some(o => o.id === config.buffer.organizationId)) throw new Error('approved organization not visible to this key');
    const channels = await client.channels(config.buffer.organizationId);
    for (const allow of config.buffer.channels.filter(c => c.platform === a.target)) {
      const ch = channels.find(c => c.id === allow.channelId);
      assertChannelMatches(ch, allow, config.buffer.organizationId);
      console.log(`OPEN   ${a.target} channel ${allow.channelId} matches ${allow.nativeAccount}`);
    }
  } catch (e) { console.error(`read-only discovery failed: ${e.message}`); process.exit(1); }
}
process.exit(Object.values(gates).every(Boolean) ? 0 : 1);
