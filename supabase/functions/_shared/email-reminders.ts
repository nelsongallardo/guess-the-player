// Daily email reminders (ADR 0030): browser preference endpoint, server
// worker and EmailOctopus webhook. Every external effect is injected, so the
// tests run with mock Auth, mock RPCs and a mock vendor; nothing here is
// reachable from gameplay handlers in http.ts.
import { createHash } from 'node:crypto';
import { allowedOrigin, type User } from './http.ts';

type Rpc = (body: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
export type PreferenceDependencies = {
  getUser: (token: string) => Promise<User | null>;
  preferencesRpc: (userId: string, body: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
export type WorkerDependencies = { workerRpc: Rpc; vendor: Vendor | null; config: ReminderConfig; now?: () => number };
export type WebhookDependencies = { workerRpc: Rpc; secret: string; listId: string };
export type ReminderConfig = {
  workerSecret: string;
  automations: { es: string; en: string };
  languageField: string;
  batch: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CONSENT_VERSION = 'daily-v1-20261009';
export const preferenceStatuses: Record<string, number> = {
  UNAUTHORIZED: 401, INVALID_REQUEST: 400, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  EMAIL_UNAVAILABLE: 409, REMINDERS_SUPPRESSED: 409, DESTINATION_IN_USE: 409, RATE_LIMITED: 429,
};

export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function destinationKey(email: string): string { return createHash('sha256').update(normalizeEmail(email)).digest('hex'); }
// EmailOctopus accepts the MD5 of the lowercase address as a contact ID.
export function vendorContactKey(email: string): string { return createHash('md5').update(normalizeEmail(email)).digest('hex'); }

// Strict per-action allowlist. The client never sends an address, account
// ID, vendor ID, timestamp, source or delivery status.
export function validatePreference(body: Record<string, unknown>): boolean {
  if (body.action === 'get') return Object.keys(body).length === 1;
  if (body.action !== 'set') return false;
  const enable = body.enabled === true;
  const fields = enable ? ['action','enabled','language','consentVersion','expectedVersion','requestId'] : ['action','enabled','expectedVersion','requestId'];
  if (Object.keys(body).some(k => !fields.includes(k)) || !fields.every(k => k in body)) return false;
  if (typeof body.enabled !== 'boolean') return false;
  if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || Number(body.expectedVersion) > 999999999) return false;
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) return false;
  if (enable && (!['es','en'].includes(body.language as string) || body.consentVersion !== CONSENT_VERSION)) return false;
  return true;
}

async function readBytes(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = req.body?.getReader();
  if (!reader) throw Error('INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Error('INVALID_REQUEST'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function readObject(req: Request, limit: number): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw Error('INVALID_REQUEST');
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(req, limit)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('INVALID_REQUEST');
  return parsed;
}
function json(data: unknown, status = 200, headers = new Headers()): Response {
  headers.set('Content-Type', 'application/json'); headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}
function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function preferencesHandler(deps: PreferenceDependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers = new Headers({ Vary: 'Origin' });
    const error = (code: string, status = preferenceStatuses[code] || 500) => {
      if (status === 429) headers.set('Retry-After', '60');
      return json({ error: { code, message: code === 'INTERNAL_ERROR' ? 'The server could not complete this request.' : code } }, status, headers);
    };
    if (origin && !allowedOrigin(origin)) return error('ORIGIN_NOT_ALLOWED', 403);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return error('METHOD_NOT_ALLOWED', 405); }
    let body: Record<string, unknown>;
    try { body = await readObject(req, 2048); } catch { return error('INVALID_REQUEST'); }
    if (!validatePreference(body)) return error('INVALID_REQUEST');
    // getUser verifies the bearer with Supabase Auth; JWT claims are never trusted directly.
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') || '');
    if (!match) return error('UNAUTHORIZED');
    let user: User | null = null;
    try { user = await deps.getUser(match[1]); } catch { return error('UNAUTHORIZED'); }
    if (!user || !UUID.test(user.id) || user.is_anonymous) return error('UNAUTHORIZED');
    try {
      const result = await deps.preferencesRpc(user.id, body);
      if (result.error) return error(Object.hasOwn(preferenceStatuses, result.error.message || '') ? result.error.message! : 'INTERNAL_ERROR');
      if (result.data && typeof result.data === 'object' && 'error' in result.data) {
        const code = (result.data as { error: { code: string } }).error.code;
        return error(Object.hasOwn(preferenceStatuses, code) ? code : 'INTERNAL_ERROR');
      }
      return json(result.data, 200, headers);
    } catch { return error('INTERNAL_ERROR'); }
  };
}

// ---------------------------------------------------------------- vendor --
export type VendorStatus = 'pending' | 'subscribed' | 'unsubscribed';
export type VendorResult<T> = { kind: 'ok'; value: T } | { kind: 'not_found' } | { kind: 'definite'; status: number } | { kind: 'uncertain' };
export type Contact = { id: string; status: VendorStatus };
export type Vendor = {
  getContact(idOrHash: string): Promise<VendorResult<Contact>>;
  createContact(email: string, status: VendorStatus, fields: Record<string, string>): Promise<VendorResult<Contact>>;
  updateContact(idOrHash: string, patch: { status?: VendorStatus; fields?: Record<string, string> }): Promise<VendorResult<Contact>>;
  deleteContact(idOrHash: string): Promise<VendorResult<null>>;
  queue(automationId: string, contactId: string): Promise<VendorResult<null>>;
};

// EmailOctopus API v2 (https://emailoctopus.com/api-documentation/v2).
// Timeouts, network failures, 429 and 5xx are "uncertain": the request may
// or may not have been applied. Other 4xx responses are definite refusals.
export function emailOctopus(options: { apiKey: string; listId: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Vendor {
  const base = 'https://api.emailoctopus.com';
  const doFetch = options.fetchImpl ?? fetch;
  async function call<T>(method: string, path: string, body?: unknown, parse?: (data: any) => T): Promise<VendorResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
    try {
      const response = await doFetch(base + path, {
        method, signal: controller.signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 404) { await response.body?.cancel(); return { kind: 'not_found' }; }
      if (response.status === 429 || response.status >= 500) { await response.body?.cancel(); return { kind: 'uncertain' }; }
      if (!response.ok) { await response.body?.cancel(); return { kind: 'definite', status: response.status }; }
      if (!parse) { await response.body?.cancel(); return { kind: 'ok', value: null as T }; }
      return { kind: 'ok', value: parse(await response.json()) };
    } catch { return { kind: 'uncertain' }; }
    finally { clearTimeout(timer); }
  }
  const contact = (data: any): Contact => {
    if (!data || typeof data.id !== 'string' || !['pending','subscribed','unsubscribed'].includes(data.status)) throw Error('UNEXPECTED_VENDOR_RESPONSE');
    return { id: data.id, status: data.status };
  };
  const list = `/lists/${encodeURIComponent(options.listId)}/contacts`;
  return {
    getContact: id => call('GET', `${list}/${encodeURIComponent(id)}`, undefined, contact),
    createContact: (email, status, fields) => call('POST', list, { email_address: email, fields, status }, contact),
    updateContact: (id, patch) => call('PUT', `${list}/${encodeURIComponent(id)}`, patch, contact),
    deleteContact: id => call('DELETE', `${list}/${encodeURIComponent(id)}`),
    queue: (automationId, contactId) => call('POST', `/automations/${encodeURIComponent(automationId)}/queue`, { contact_id: contactId }),
  };
}

// -------------------------------------------------------------- contact sync --
export type SyncJob = {
  jobId: number; leaseToken: string; kind: 'subscribe' | 'unsubscribe' | 'retire' | 'delete';
  source: 'user_opt_in' | 'owner_requested_existing_friends' | null; language: 'es' | 'en' | null;
  email: string | null; destinationKey: string; contactId: string | null;
};
export type SyncOutcome = { outcome: 'done' | 'retry' | 'failed'; detail?: string; vendorStatus?: VendorStatus | 'none'; contactId?: string };

const fail = (r: VendorResult<unknown>): SyncOutcome =>
  r.kind === 'uncertain' ? { outcome: 'retry', detail: 'vendor_unavailable' } : { outcome: 'failed', detail: `vendor_${r.kind === 'definite' ? r.status : 'error'}` };

// Always read the contact before writing; never upsert blindly to subscribed.
export async function syncContact(job: SyncJob, vendor: Vendor, languageField: string): Promise<SyncOutcome> {
  const id = job.contactId ?? (job.email ? vendorContactKey(job.email) : null);
  if (!id) return { outcome: 'done', detail: 'no_contact' };
  const current = await vendor.getContact(id);
  if (current.kind !== 'ok' && current.kind !== 'not_found') return fail(current);
  if (job.kind === 'delete') {
    if (current.kind === 'not_found') return { outcome: 'done', detail: 'absent' };
    const removed = await vendor.deleteContact(current.value.id);
    return removed.kind === 'ok' || removed.kind === 'not_found' ? { outcome: 'done' } : fail(removed);
  }
  if (job.kind === 'unsubscribe' || job.kind === 'retire') {
    if (current.kind === 'not_found') return { outcome: 'done', detail: 'absent', vendorStatus: job.kind === 'unsubscribe' ? 'none' : undefined };
    if (current.value.status === 'unsubscribed') return { outcome: 'done', vendorStatus: 'unsubscribed', contactId: current.value.id };
    const updated = await vendor.updateContact(current.value.id, { status: 'unsubscribed' });
    return updated.kind === 'ok' ? { outcome: 'done', vendorStatus: 'unsubscribed', contactId: updated.value.id } : fail(updated);
  }
  // subscribe
  if (!job.email || !job.language || !job.source) return { outcome: 'failed', detail: 'incomplete_job' };
  const fields = { [languageField]: job.language };
  if (current.kind === 'not_found') {
    // Single opt-in: the address is Auth-verified and the account ticked the
    // box itself (the list has double opt-in off, so "pending" would never
    // receive anything). The owner cohort is likewise created subscribed.
    const created = await vendor.createContact(job.email, 'subscribed', fields);
    return created.kind === 'ok' ? { outcome: 'done', vendorStatus: created.value.status, contactId: created.value.id } : fail(created);
  }
  const existing = current.value;
  if (existing.status === 'unsubscribed') {
    // Never override a vendor unsubscribe for the owner cohort. Only a new,
    // explicit opt-in by the account itself resubscribes.
    if (job.source !== 'user_opt_in') return { outcome: 'done', detail: 'vendor_unsubscribed', vendorStatus: 'unsubscribed', contactId: existing.id };
  }
  if (existing.status !== 'subscribed' && job.source === 'user_opt_in') {
    const resubscribed = await vendor.updateContact(existing.id, { status: 'subscribed', fields });
    return resubscribed.kind === 'ok' ? { outcome: 'done', vendorStatus: resubscribed.value.status, contactId: resubscribed.value.id } : fail(resubscribed);
  }
  const updated = await vendor.updateContact(existing.id, { fields });
  return updated.kind === 'ok' ? { outcome: 'done', vendorStatus: updated.value.status, contactId: updated.value.id } : fail(updated);
}

// ------------------------------------------------------------------ worker --
async function rpcData(rpc: Rpc, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await rpc(body);
  if (error) throw Error(`RPC_${body.action}`);
  return data;
}

export async function runWorker(deps: WorkerDependencies, task: 'tick' | 'sync' | 'dispatch' = 'tick') {
  const { workerRpc: rpc, vendor, config } = deps;
  const report = { retired: 0, synced: 0, retried: 0, failed: 0, observed: 0, dispatched: 0, skipped: 0, uncertain: 0, refused: 0 };
  report.retired = (await rpcData(rpc, { action: 'reconcileAddresses' })).retired;
  if (!vendor) return { ...report, vendor: 'not_configured' };
  if (task !== 'dispatch') {
    for (const job of (await rpcData(rpc, { action: 'claimSync', limit: config.batch })).jobs as SyncJob[]) {
      const result = await syncContact(job, vendor, config.languageField);
      await rpcData(rpc, { action: 'completeSync', jobId: job.jobId, leaseToken: job.leaseToken, ...result });
      report[result.outcome === 'done' ? 'synced' : result.outcome === 'retry' ? 'retried' : 'failed']++;
    }
    // Periodic reads catch unsubscribes whose webhook was lost or delayed.
    for (const target of (await rpcData(rpc, { action: 'reconcileTargets', limit: config.batch })).contacts as { destinationKey: string; contactId: string | null; email: string }[]) {
      const read = await vendor.getContact(target.contactId ?? vendorContactKey(target.email));
      if (read.kind === 'ok') await rpcData(rpc, { action: 'observe', destinationKey: target.destinationKey, contactId: read.value.id, status: read.value.status });
      else if (read.kind === 'not_found') await rpcData(rpc, { action: 'observe', destinationKey: target.destinationKey, status: 'deleted' });
      if (read.kind === 'ok' || read.kind === 'not_found') report.observed++;
    }
  }
  if (task === 'sync') return report;
  const claim = await rpcData(rpc, { action: 'claimDispatch', limit: config.batch, leaseSeconds: 120 });
  for (const { token } of claim.items as { token: string }[]) {
    // Re-checks every eligibility condition immediately before the call.
    const start = await rpcData(rpc, { action: 'startDispatch', token });
    if (!start.send) { report.skipped++; continue; }
    const automation = config.automations[start.language as 'es' | 'en'];
    const queued = await vendor.queue(automation, start.contactId);
    // 204 is acceptance, not inbox delivery. An unknown result is recorded as
    // uncertain and never re-sent that date.
    const outcome = queued.kind === 'ok' ? 'accepted' : queued.kind === 'uncertain' ? 'uncertain' : 'failed';
    await rpcData(rpc, { action: 'finishDispatch', token, outcome, ...(outcome === 'failed' ? { detail: queued.kind === 'definite' ? `vendor_${queued.status}` : 'vendor_not_found' } : {}) });
    report[outcome === 'accepted' ? 'dispatched' : outcome === 'uncertain' ? 'uncertain' : 'refused']++;
  }
  return { ...report, dispatchEnabled: claim.dispatchEnabled, inWindow: claim.inWindow ?? null };
}

// The scheduler authenticates with its own secret, never a user's JWT; a
// browser user can neither trigger a dispatch nor an import.
export function workerHandler(deps: WorkerDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    const secret = req.headers.get('x-reminder-worker-secret') || '';
    if (!deps.config.workerSecret || deps.config.workerSecret.length < 32 || !constantTimeEqual(secret, deps.config.workerSecret)) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    let body: Record<string, unknown>;
    try { body = await readObject(req, 256); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
    const task = body.task ?? 'tick';
    if (Object.keys(body).some(k => k !== 'task') || !['tick','sync','dispatch'].includes(task as string)) return json({ error: { code: 'INVALID_REQUEST' } }, 400);
    try { return json(await runWorker(deps, task as 'tick')); }
    catch { return json({ error: { code: 'INTERNAL_ERROR' } }, 500); }
  };
}

// ----------------------------------------------------------------- webhook --
export async function signature(secret: string, body: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
  return 'sha256=' + [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
}

// EmailOctopus webhook: HMAC-SHA256 over the raw request bytes, header
// "EmailOctopus-Signature: sha256=<hex>". Events for another list are ignored.
// Only a hash of the address reaches the database.
export function webhookHandler(deps: WebhookDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    if (!deps.secret || !deps.listId) return json({ error: { code: 'NOT_CONFIGURED' } }, 503);
    let raw: Uint8Array<ArrayBuffer>;
    try { raw = await readBytes(req, 2 * 1024 * 1024); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
    const supplied = req.headers.get('emailoctopus-signature') || '';
    if (!constantTimeEqual(supplied, await signature(deps.secret, raw))) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    let events: unknown;
    try { events = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
    if (!Array.isArray(events) || events.length > 1000) return json({ error: { code: 'INVALID_REQUEST' } }, 400);
    const accepted = [];
    for (const e of events as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object' || e.list_id !== deps.listId) continue;
      if (typeof e.id !== 'string' || !UUID.test(e.id) || typeof e.type !== 'string' || typeof e.occurred_at !== 'string' || Number.isNaN(Date.parse(e.occurred_at))) continue;
      if (typeof e.contact_email_address !== 'string' || !e.contact_email_address.includes('@')) continue;
      accepted.push({
        id: e.id, type: e.type, occurredAt: new Date(e.occurred_at).toISOString(),
        destinationKey: destinationKey(e.contact_email_address),
        contactId: typeof e.contact_id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(e.contact_id) ? e.contact_id : null,
        ...(typeof e.contact_status === 'string' ? { status: e.contact_status } : {}),
      });
    }
    if (!accepted.length) return json({ processed: 0 });
    const { data, error } = await deps.workerRpc({ action: 'vendorEvents', events: accepted });
    // A non-2xx makes the vendor retry later; processing is idempotent by event id.
    if (error) return json({ error: { code: 'INTERNAL_ERROR' } }, 500);
    return json(data);
  };
}
