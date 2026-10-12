// reserve → intent → one write → ID → poll. Buffer has no idempotency key, so
// the local ledger is the only fence against duplicates: an intent without a
// proven outcome blocks every further create for that target.

import path from 'node:path';
import { digest } from './manifest.mjs';
import { writeGate } from './config.mjs';
import { approvalPayload, findReceipt, verifyReceipt } from './approval.mjs';
import { buildCreatePostInput, classifyReadback } from './buffer.mjs';
import { openLedger, targetKey } from './ledger.mjs';
import { acquireLock } from './lock.mjs';

const TERMINAL_PROVIDER = new Set(['public_verification_pending', 'error', 'not_scheduled']);

function findTarget(job, channelId) {
  const target = job.targets.find(t => t.channelId === channelId);
  if (!target) throw new Error(`job has no target for channel ${channelId}`);
  return target;
}

async function gatesFor(deps, { job, target, nowUtc, ledger, dryRun }) {
  const gates = [];
  const gate = async (name, fn) => {
    try { const v = await fn(); gates.push({ name, ok: true }); return v; }
    catch (e) { gates.push({ name, ok: false, error: e.message }); if (!dryRun) throw e; return undefined; }
  };
  const payload = await gate('payload', () => approvalPayload({ job, target, derivative: deps.derivative }));
  const key = targetKey({ job, target });
  const d = payload && digest(payload);
  await gate('ledger state', () => {
    const st = ledger.state(key);
    if (st.state === 'rejected' && st.digest === d) throw new Error('this payload was rejected; a changed payload with a new approval is required');
    if (st.state !== 'none' && st.state !== 'rejected') throw new Error(`target already ${st.state} (unresolved or done); reconcile, never resend`);
  });
  await gate('lane enabled/allowlisted', () => writeGate(deps.config, { stateDir: deps.stateDir, target }));
  await gate('approval receipt', () => {
    if (!payload) throw new Error('no payload to approve');
    const errors = verifyReceipt(findReceipt(path.join(deps.stateDir, 'approvals.jsonl'), d), payload, { nowUtc });
    if (errors.length) throw new Error(`approval: ${errors.join('; ')}`);
  });
  await gate('source and Daily schedule', async () => {
    const errors = await deps.checkSource(job, nowUtc);
    if (errors.length) throw new Error(errors.join('; '));
  });
  await gate('hosted bytes', () => deps.verifyHost(deps.assetUrl, { expected: deps.derivative }));
  const input = await gate('Buffer input', () => {
    if (!payload) throw new Error('no valid payload to map');
    return buildCreatePostInput({ payload, assetUrl: deps.assetUrl });
  });
  return { gates, key, digest: d, input };
}

export async function publishTarget(deps, { job, channelId, nowUtc, dryRun = false }) {
  const target = findTarget(job, channelId);
  if (dryRun) {
    const ledger = openLedger(deps.stateDir); // read-only
    const { gates } = await gatesFor(deps, { job, target, nowUtc, ledger, dryRun: true });
    return { dryRun: true, ok: gates.every(g => g.ok), gates };
  }
  const release = acquireLock(deps.stateDir);
  try {
    const ledger = openLedger(deps.stateDir);
    const { key, digest: d, input } = await gatesFor(deps, { job, target, nowUtc, ledger, dryRun: false });
    writeGate(deps.config, { stateDir: deps.stateDir, target }); // PAUSE re-checked at the boundary
    ledger.append({ type: 'intent', key, digest: d, inputDigest: digest(input), derivativeSha256: deps.derivative.sha256, at: nowUtc });
    let result;
    try { result = await deps.buffer.createPost(input); }
    catch (e) {
      ledger.append({ type: 'uncertain', key, reason: `exception during create: ${String(e.message).slice(0, 200)}`, at: nowUtc });
      throw e;
    }
    if (result.kind === 'created') ledger.append({ type: 'created', key, postId: result.postId, providerStatus: result.status ?? null, at: nowUtc });
    else if (result.kind === 'rejected') ledger.append({ type: 'rejected', key, reason: result.reason, retryable: !!result.retryable, at: nowUtc });
    else ledger.append({ type: 'uncertain', key, reason: result.reason, at: nowUtc });
    return { state: result.kind === 'created' ? 'created' : result.kind, postId: result.postId ?? null, key };
  } finally { release(); }
}

const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function reconcileTarget(deps, { job, channelId, nowUtc, sleep = ms => new Promise(r => setTimeout(r, ms)), maxReads = 10, intervalMs = 90000, maxPages = 20 }) {
  const target = findTarget(job, channelId);
  const payload = approvalPayload({ job, target, derivative: deps.derivative });
  const input = buildCreatePostInput({ payload, assetUrl: deps.assetUrl });
  const release = acquireLock(deps.stateDir);
  try {
    const ledger = openLedger(deps.stateDir);
    const key = targetKey({ job, target });
    const st = ledger.state(key);
    if (st.state === 'none') return { state: 'none', note: 'nothing submitted' };
    if (st.state === 'rejected') return { state: 'rejected' };

    if (['intent', 'uncertain'].includes(st.state)) {
      const start = iso(Date.parse(st.intentAt ?? nowUtc) - 3600000);
      const end = iso(Date.parse(target.publishAtUtc) + 3600000);
      const matches = [];
      let after = null;
      for (let page = 0; page < maxPages; page++) {
        const res = await deps.buffer.listPosts({ organizationId: deps.config.buffer.organizationId, channelId: target.channelId, start, end, after });
        for (const { node: n } of res?.edges ?? []) {
          if (n.channelId === input.channelId && n.text === input.text && Date.parse(n.dueAt) === Date.parse(input.dueAt)
            && n.assets?.length === 1 && n.assets[0].source === input.assets[0].video.url) matches.push(n.id);
        }
        if (!res?.pageInfo?.hasNextPage) break;
        after = res.pageInfo.endCursor;
      }
      if (matches.length !== 1) {
        ledger.append({ type: 'incident', key, reason: `${matches.length} exact matches after an ambiguous write; operator decision required, no retry`, at: nowUtc });
        return { incident: true, matches: matches.length };
      }
      ledger.append({ type: 'attached', key, postId: matches[0], at: nowUtc });
      return { attached: matches[0], state: 'created' };
    }

    if (!st.postId) return { state: st.state };
    // Before the slot one read confirms it is queued; the polling budget is for after the send time.
    const reads = Date.parse(nowUtc) < Date.parse(target.publishAtUtc) ? 1 : maxReads;
    let last = st.state, cls = null;
    for (let i = 0; i < reads; i++) {
      cls = classifyReadback(await deps.buffer.readPost(st.postId), { postId: st.postId, input, platform: target.platform });
      if (cls.state !== last) {
        ledger.append({ type: 'status', key, state: cls.state, externalLink: cls.externalLink ?? null, sentAt: cls.sentAt ?? null, error: cls.error ?? null, at: nowUtc });
        last = cls.state;
      }
      if (TERMINAL_PROVIDER.has(cls.state) || i === reads - 1) break;
      await sleep(Math.min(intervalMs * 2 ** i, 15 * 60000));
    }
    return { state: last, externalLink: cls?.externalLink ?? null };
  } finally { release(); }
}
