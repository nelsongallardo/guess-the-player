// Spend reservations. Every attempt is reserved (and assumed billed) before the
// request; an unknown rate or a zero cap stops paid work. This is a local
// guard, not an invoice: reconcile against the vendor's usage after the fact.

import fs from 'node:fs';
import path from 'node:path';

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

export function createSpendLedger(file, config) {
  let state;
  if (fs.existsSync(file)) {
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(`spend ledger ${file} is unreadable; refusing paid work`); }
    if (state?.schemaVersion !== 1 || !Array.isArray(state.entries)) throw new Error(`spend ledger ${file} is malformed; refusing paid work`);
  } else state = { schemaVersion: 1, entries: [] };

  const totals = () => state.entries.reduce((t, e) => ({ reservedUsd: t.reservedUsd + e.usd, characters: t.characters + (e.characters ?? 0) }), { reservedUsd: 0, characters: 0 });

  function reserve(entry) {
    const t = totals();
    if (!(config.caps.variableUsd > 0)) throw new Error('variable spend cap is 0; paid work is not approved');
    if (t.reservedUsd + entry.usd > config.caps.variableUsd + 1e-9) throw new Error(`spend cap reached: ${t.reservedUsd.toFixed(4)} + ${entry.usd.toFixed(4)} > ${config.caps.variableUsd} USD`);
    if ((entry.characters ?? 0) && t.characters + entry.characters > config.caps.ttsCharacters) throw new Error(`TTS character cap reached (${config.caps.ttsCharacters})`);
    state.entries.push({ ...entry, at: new Date().toISOString() });
    writeJsonAtomic(file, state);
    return entry;
  }

  return {
    totals,
    attempts: key => state.entries.filter(e => e.kind === 'tts' && e.key === key).length,
    reserveTts({ key, characters }) {
      const rate = config.rates.ttsUsdPerCharacter;
      if (!(Number.isFinite(rate) && rate > 0)) throw new Error('TTS rate is unknown; record the current plan rate before paid work');
      return reserve({ kind: 'tts', key, characters, usd: characters * rate });
    },
    reserveOther({ kind, key, usd }) {
      if (!(Number.isFinite(usd) && usd >= 0)) throw new Error(`${kind} cost is unknown; refusing`);
      return reserve({ kind, key, usd });
    },
  };
}
