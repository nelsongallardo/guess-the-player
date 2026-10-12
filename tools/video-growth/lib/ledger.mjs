// Append-only, fsynced intent ledger. One line per event. A missing or
// unparseable ledger is an incident: the publisher refuses rather than
// treating it as an empty queue.

import fs from 'node:fs';
import path from 'node:path';

export const LEDGER_FILE = 'intents.jsonl';
const TYPES = new Set(['intent', 'created', 'rejected', 'uncertain', 'attached', 'status', 'incident', 'public']);

export function targetKey({ job, target }) {
  return `${job.campaignId}|${job.assetId}|${target.channelId}|${target.publishAtUtc}`;
}

function fsyncDir(dir) {
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// Explicit, one-time creation. Never called implicitly by the publisher.
export function initLedger(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  let fd;
  try { fd = fs.openSync(path.join(stateDir, LEDGER_FILE), 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('intent ledger already exists; refusing to re-initialize'); throw e; }
  fs.fsyncSync(fd); fs.closeSync(fd);
  fsyncDir(stateDir);
}

export function reduceState(entries, key) {
  const s = { state: 'none', digest: null, derivativeSha256: null, postId: null, intentAt: null, incidents: 0, externalLink: null, sentAt: null, publicVerifiedAt: null };
  for (const e of entries.filter(x => x.key === key)) {
    switch (e.type) {
      case 'intent': Object.assign(s, { state: 'intent', digest: e.digest, derivativeSha256: e.derivativeSha256 ?? null, postId: null, intentAt: e.at }); break;
      case 'created': case 'attached': Object.assign(s, { state: 'created', postId: e.postId }); break;
      case 'rejected': s.state = 'rejected'; break;
      case 'uncertain': s.state = 'uncertain'; break;
      case 'status': Object.assign(s, { state: e.state, externalLink: e.externalLink ?? s.externalLink, sentAt: e.sentAt ?? s.sentAt }); break;
      case 'incident': s.incidents++; break;
      case 'public': s.state = e.verdict; s.publicVerifiedAt = e.verdict === 'public_verified' ? e.at : null; break;
    }
  }
  return s;
}

export function openLedger(stateDir) {
  const file = path.join(stateDir, LEDGER_FILE);
  if (!fs.existsSync(file)) throw new Error(`intent ledger ${file} is missing; if any remote work may exist this is a reconciliation incident`);
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
    let e;
    try { e = JSON.parse(line); } catch { throw new Error(`intent ledger line ${i + 1} is malformed; refusing`); }
    if (!TYPES.has(e?.type) || typeof e.key !== 'string') throw new Error(`intent ledger line ${i + 1} is not a known event; refusing`);
    return e;
  });

  const state = key => reduceState(entries, key);

  function append(entry) {
    if (!TYPES.has(entry.type) || typeof entry.key !== 'string') throw new Error('refusing to append an unknown ledger event');
    const fd = fs.openSync(file, 'a', 0o600);
    try { fs.writeSync(fd, `${JSON.stringify(entry)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    entries.push(entry);
  }

  return { entries, state, append, keys: () => [...new Set(entries.map(e => e.key))] };
}
