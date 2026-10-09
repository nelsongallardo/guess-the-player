// Email reminder HTTP/vendor contract with injected mock Auth, mock RPCs and
// a mock EmailOctopus. NOT hosted, vendor or delivered-mail verification.
import {
  preferencesHandler, validatePreference, emailOctopus, syncContact, runWorker, workerHandler, webhookHandler,
  signature, destinationKey, vendorContactKey, CONSENT_VERSION,
  type PreferenceDependencies, type Vendor, type VendorResult, type Contact, type SyncJob, type ReminderConfig,
} from '../supabase/functions/_shared/email-reminders.ts';
const uid = '11111111-1111-4111-8111-111111111111';
const rid = '22222222-2222-4222-8222-222222222222';
function equal(a: unknown, b: unknown, message = "") { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${message} ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function ok(value: unknown, message = 'expected truthy') { if (!value) throw Error(message); }

// ------------------------------------------------------- preference endpoint
function prefFixture(overrides: Partial<PreferenceDependencies> = {}) {
  const calls: unknown[] = [];
  const deps: PreferenceDependencies = {
    getUser: async t => { calls.push(['auth', t]); return t === 'valid' ? { id: uid } : null; },
    preferencesRpc: async (id, body) => { calls.push(['rpc', id, body]); return { data: { preference: { enabled: false, version: 0 } }, error: null }; },
    ...overrides,
  };
  return { calls, run: preferencesHandler(deps) };
}
function request(body: unknown, auth: string | null = 'Bearer valid', origin = 'https://derabona.club') {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin }; if (auth) headers.authorization = auth;
  return new Request('http://localhost/functions/v1/email-preferences', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
const set = { action: 'set', enabled: true, language: 'es', consentVersion: CONSENT_VERSION, expectedVersion: 0, requestId: rid };

Deno.test('preferences need a verified non-anonymous user; forged or missing JWTs never reach the RPC', async () => {
  for (const auth of [null, 'Bearer forged', 'Basic valid', 'Bearer']) {
    const f = prefFixture(); equal((await f.run(request({ action: 'get' }, auth))).status, 401);
    equal(f.calls.filter((c: any) => c[0] === 'rpc'), []);
  }
  const anon = prefFixture({ getUser: async () => ({ id: uid, is_anonymous: true }) });
  equal((await anon.run(request({ action: 'get' }))).status, 401);
  const thrown = prefFixture({ getUser: async () => { throw Error('auth down'); } });
  equal((await thrown.run(request({ action: 'get' }))).status, 401);
  const f = prefFixture(); const res = await f.run(request(set));
  equal(res.status, 200); equal(res.headers.get('cache-control'), 'no-store'); equal(res.headers.get('access-control-allow-origin'), 'https://derabona.club');
  equal(f.calls, [['auth', 'valid'], ['rpc', uid, set]]);
});

Deno.test('the preference body never carries an address, identity, vendor state, time or source', () => {
  equal(validatePreference({ action: 'get' }), true);
  equal(validatePreference(set), true);
  equal(validatePreference({ action: 'set', enabled: false, expectedVersion: 1, requestId: rid }), true);
  for (const field of ['email', 'userId', 'user_id', 'verified_user_id', 'contactId', 'status', 'deliveryStatus', 'source', 'consentedAt', 'timestamp'])
    equal([field, validatePreference({ ...set, [field]: 'x' })], [field, false]);
  for (const body of [
    { action: 'get', extra: 1 }, { action: 'subscribe' }, { ...set, consentVersion: undefined }, { ...set, consentVersion: 'daily-v0' },
    { ...set, language: 'fr' }, { ...set, enabled: 'true' }, { ...set, expectedVersion: -1 }, { ...set, expectedVersion: 1.5 },
    { ...set, requestId: 'x' }, { action: 'set', enabled: false, language: 'es', expectedVersion: 0, requestId: rid },
    { action: 'set', enabled: false, expectedVersion: 0 },
  ]) equal([JSON.stringify(body), validatePreference(JSON.parse(JSON.stringify(body)))], [JSON.stringify(body), false]);
});

Deno.test('preference requests are bounded, typed, same-origin and POST-only', async () => {
  const f = prefFixture();
  equal((await f.run(request({ ...set, pad: 'x'.repeat(4000) }))).status, 400);
  equal((await f.run(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer valid' }, body: '{"action":"get"}' }))).status, 400);
  equal((await f.run(request('[1]'))).status, 400);
  equal((await f.run(request({ action: 'get' }, 'Bearer valid', 'https://evil.test'))).status, 403);
  equal((await f.run(new Request('http://localhost', { method: 'GET' }))).status, 405);
  equal(f.calls, []);
});

Deno.test('preference RPC errors map to bounded public codes', async () => {
  for (const [code, status] of [['VERSION_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['EMAIL_UNAVAILABLE', 409], ['REMINDERS_SUPPRESSED', 409],
    ['DESTINATION_IN_USE', 409], ['RATE_LIMITED', 429], ['INVALID_REQUEST', 400], ['relation reminder_private.preferences secret', 500]] as const) {
    for (const preferencesRpc of [async () => ({ data: null, error: { message: code } }), async () => ({ data: { error: { code } }, error: null })]) {
      const res = await prefFixture({ preferencesRpc }).run(request({ action: 'get' }));
      equal(res.status, status); const body = await res.json();
      equal(body.error.code, status === 500 ? 'INTERNAL_ERROR' : code);
      ok(!JSON.stringify(body).includes('secret'), 'internal detail leaked');
    }
  }
});

// --------------------------------------------------------------- vendor API
function mockFetch(routes: (method: string, url: string, body: any) => Response | Promise<Response> | 'hang') {
  const calls: [string, string, any][] = [];
  const impl = ((input: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push([init.method!, input, body]);
    const r = routes(init.method!, input, body);
    if (r === 'hang') return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return Promise.resolve(r);
  }) as typeof fetch;
  return { calls, impl };
}
const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

Deno.test('EmailOctopus adapter: v2 paths, MD5 contact IDs, and definite versus uncertain outcomes', async () => {
  equal(vendorContactKey(' ABC '), '900150983cd24fb0d6963f7d28e17f72');
  equal(destinationKey(' A@B.co '), destinationKey('a@b.co'));
  const m = mockFetch((method, url) =>
    url.endsWith('/queue') ? new Response(null, { status: 204 })
    : method === 'GET' ? jsonResponse({ id: 'c1', status: 'subscribed', email_address: 'a@b.co' })
    : new Response(null, { status: 204 }));
  const v = emailOctopus({ apiKey: 'k', listId: 'list-1', fetchImpl: m.impl });
  equal(await v.getContact(vendorContactKey('a@b.co')), { kind: 'ok', value: { id: 'c1', status: 'subscribed' } });
  equal(await v.queue('auto-es', 'c1'), { kind: 'ok', value: null });
  equal(m.calls.map(c => [c[0], c[1].replace('https://api.emailoctopus.com', '')]), [
    ['GET', `/lists/list-1/contacts/${vendorContactKey('a@b.co')}`], ['POST', '/automations/auto-es/queue']]);
  equal(m.calls[1][2], { contact_id: 'c1' });
  for (const [status, kind] of [[404, 'not_found'], [409, 'definite'], [422, 'definite'], [429, 'uncertain'], [500, 'uncertain'], [503, 'uncertain']] as const) {
    const r = await emailOctopus({ apiKey: 'k', listId: 'l', fetchImpl: mockFetch(() => new Response('{}', { status })).impl }).queue('a', 'c');
    equal([status, r.kind], [status, kind]);
  }
  const hang = await emailOctopus({ apiKey: 'k', listId: 'l', fetchImpl: mockFetch(() => 'hang').impl, timeoutMs: 20 }).queue('a', 'c');
  equal(hang.kind, 'uncertain');
  const network = await emailOctopus({ apiKey: 'k', listId: 'l', fetchImpl: (() => Promise.reject(Error('dns'))) as typeof fetch }).queue('a', 'c');
  equal(network.kind, 'uncertain');
});

// ------------------------------------------------------------- contact sync
function fakeVendor(initial: Record<string, Contact> = {}, fault?: (op: string) => VendorResult<never> | null) {
  const contacts = { ...initial }; const ops: unknown[] = [];
  const v: Vendor = {
    async getContact(id) { ops.push(['get', id]); const f = fault?.('get'); if (f) return f; const c = contacts[id] ?? Object.values(contacts).find(x => x.id === id); return c ? { kind: 'ok', value: { ...c } } : { kind: 'not_found' }; },
    async createContact(email, status, fields) { ops.push(['create', status, fields]); const f = fault?.('create'); if (f) return f; const c = { id: 'new-' + vendorContactKey(email).slice(0, 6), status }; contacts[vendorContactKey(email)] = c; return { kind: 'ok', value: { ...c } }; },
    async updateContact(id, patch) { ops.push(['update', id, patch]); const f = fault?.('update'); if (f) return f; const c = Object.values(contacts).find(x => x.id === id)!; if (patch.status) c.status = patch.status; return { kind: 'ok', value: { ...c } }; },
    async deleteContact(id) { ops.push(['delete', id]); const f = fault?.('delete'); if (f) return f; return { kind: 'ok', value: null }; },
    async queue(a, c) { ops.push(['queue', a, c]); const f = fault?.('queue'); if (f) return f; return { kind: 'ok', value: null }; },
  };
  return { v, ops, contacts };
}
const job = (over: Partial<SyncJob>): SyncJob => ({ jobId: 1, leaseToken: rid, kind: 'subscribe', source: 'user_opt_in', language: 'es', email: 'a@b.co', destinationKey: destinationKey('a@b.co'), contactId: null, ...over });

Deno.test('a new explicit opt-in is created pending; the owner cohort subscribed; existing state is read first', async () => {
  const optIn = fakeVendor(); equal(await syncContact(job({}), optIn.v, 'Language'), { outcome: 'done', vendorStatus: 'pending', contactId: optIn.contacts[vendorContactKey('a@b.co')].id });
  equal(optIn.ops, [['get', vendorContactKey('a@b.co')], ['create', 'pending', { Language: 'es' }]]);
  const owner = fakeVendor(); equal((await syncContact(job({ source: 'owner_requested_existing_friends' }), owner.v, 'Language')).vendorStatus, 'subscribed');
  equal(owner.ops[1], ['create', 'subscribed', { Language: 'es' }]);
  // Existing subscribed contact: fields only, never a status write.
  const existing = fakeVendor({ [vendorContactKey('a@b.co')]: { id: 'c1', status: 'subscribed' } });
  await syncContact(job({ language: 'en' }), existing.v, 'Language');
  equal(existing.ops[1], ['update', 'c1', { fields: { Language: 'en' } }]);
});

Deno.test('sync never overrides a vendor unsubscribe for the owner cohort; an explicit re-opt-in asks to reconfirm', async () => {
  const held = { [vendorContactKey('a@b.co')]: { id: 'c1', status: 'unsubscribed' as const } };
  const owner = fakeVendor(held);
  equal(await syncContact(job({ source: 'owner_requested_existing_friends' }), owner.v, 'Language'), { outcome: 'done', detail: 'vendor_unsubscribed', vendorStatus: 'unsubscribed', contactId: 'c1' });
  equal(owner.ops.length, 1, 'read only');
  const optIn = fakeVendor({ [vendorContactKey('a@b.co')]: { id: 'c1', status: 'unsubscribed' } });
  equal((await syncContact(job({}), optIn.v, 'Language')).vendorStatus, 'pending');
  equal(optIn.ops[1], ['update', 'c1', { status: 'pending', fields: { Language: 'es' } }]);
});

Deno.test('unsubscribe before sync, retire, delete, and vendor outages', async () => {
  const none = fakeVendor();
  equal(await syncContact(job({ kind: 'unsubscribe', source: null, language: null }), none.v, 'Language'), { outcome: 'done', detail: 'absent', vendorStatus: 'none' });
  equal(none.ops.length, 1, 'nothing to unsubscribe: no write');
  const sub = fakeVendor({ [vendorContactKey('a@b.co')]: { id: 'c1', status: 'subscribed' } });
  equal((await syncContact(job({ kind: 'retire', source: null, language: null }), sub.v, 'Language')).vendorStatus, 'unsubscribed');
  const del = fakeVendor({ [vendorContactKey('a@b.co')]: { id: 'c1', status: 'subscribed' } });
  equal(await syncContact(job({ kind: 'delete', source: null, language: null, contactId: 'c1' }), del.v, 'Language'), { outcome: 'done' });
  equal(del.ops, [['get', 'c1'], ['delete', 'c1']]);
  const down = fakeVendor({}, () => ({ kind: 'uncertain' }));
  equal(await syncContact(job({}), down.v, 'Language'), { outcome: 'retry', detail: 'vendor_unavailable' });
  const refused = fakeVendor({}, op => op === 'create' ? { kind: 'definite', status: 422 } : null);
  equal(await syncContact(job({}), refused.v, 'Language'), { outcome: 'failed', detail: 'vendor_422' });
});

// ------------------------------------------------------------------- worker
const config: ReminderConfig = { workerSecret: 's'.repeat(40), automations: { es: 'auto-es', en: 'auto-en' }, languageField: 'Language', batch: 25 };
function workerRpc(script: Record<string, (body: any) => unknown>) {
  const calls: any[] = [];
  return { calls, rpc: async (body: Record<string, unknown>) => { calls.push(body); return { data: (script[body.action as string] ?? (() => ({})))(body), error: null }; } };
}
const quiet = { reconcileAddresses: () => ({ retired: 0 }), claimSync: () => ({ jobs: [] }), reconcileTargets: () => ({ contacts: [] }), completeSync: () => ({ accepted: true }), observe: () => ({}) };

Deno.test('worker endpoint requires its own secret; a user JWT or a weak/missing secret never reaches the RPC', async () => {
  for (const [secret, header] of <[string, string | null][]>[[config.workerSecret, null], [config.workerSecret, 'wrong'], [config.workerSecret, `Bearer ${config.workerSecret}`], ['short', 'short'], ['', '']]) {
    const w = workerRpc(quiet);
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: 'Bearer user-jwt' };
    if (header !== null) headers['x-reminder-worker-secret'] = header;
    const res = await workerHandler({ workerRpc: w.rpc, vendor: null, config: { ...config, workerSecret: secret } })(new Request('http://x', { method: 'POST', headers, body: '{}' }));
    equal([header, res.status], [header, 401]); equal(w.calls, []);
  }
  const w = workerRpc(quiet);
  const bad = await workerHandler({ workerRpc: w.rpc, vendor: null, config })(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-reminder-worker-secret': config.workerSecret }, body: '{"task":"import"}' }));
  equal(bad.status, 400);
  const res = await workerHandler({ workerRpc: w.rpc, vendor: null, config })(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-reminder-worker-secret': config.workerSecret }, body: '{}' }));
  equal(res.status, 200); equal((await res.json()).vendor, 'not_configured');
  equal(w.calls.map(c => c.action), ['reconcileAddresses'], 'no vendor configured: local reconciliation only');
});

Deno.test('dispatch: accepted, refused and timeout-after-acceptance outcomes; skips never reach the vendor', async () => {
  const outcomes: any[] = [];
  const w = workerRpc({ ...quiet,
    claimDispatch: () => ({ dispatchEnabled: true, inWindow: true, items: [{ token: 't1' }, { token: 't2' }, { token: 't3' }, { token: 't4' }] }),
    startDispatch: b => b.token === 't4' ? { send: false, reason: 'daily_complete' } : { send: true, contactId: 'c-' + b.token, language: b.token === 't2' ? 'en' : 'es' },
    finishDispatch: b => { outcomes.push([b.token, b.outcome, b.detail]); return { accepted: true }; },
  });
  const vendor = fakeVendor({}, op => null);
  let n = 0;
  vendor.v.queue = async (a, c) => { vendor.ops.push(['queue', a, c]); n++; return n === 1 ? { kind: 'ok', value: null } : n === 2 ? { kind: 'definite', status: 409 } : { kind: 'uncertain' }; };
  const report = await runWorker({ workerRpc: w.rpc, vendor: vendor.v, config }, 'dispatch');
  equal(vendor.ops, [['queue', 'auto-es', 'c-t1'], ['queue', 'auto-en', 'c-t2'], ['queue', 'auto-es', 'c-t3']]);
  equal(outcomes, [['t1', 'accepted', undefined], ['t2', 'failed', 'vendor_409'], ['t3', 'uncertain', undefined]]);
  equal([report.dispatched, report.refused, report.uncertain, report.skipped], [1, 1, 1, 1]);
  // The worker itself never retries a queue call.
  equal(w.calls.filter(c => c.action === 'claimDispatch').length, 1);
});

Deno.test('sync pass reports vendor outcomes back with the lease token, and periodic reads feed suppression', async () => {
  const w = workerRpc({ ...quiet,
    claimSync: () => ({ jobs: [job({ jobId: 7, leaseToken: rid })] }),
    reconcileTargets: () => ({ contacts: [{ destinationKey: destinationKey('x@y.z'), contactId: 'cx', email: 'x@y.z' }] }),
  });
  const vendor = fakeVendor({ cx: { id: 'cx', status: 'unsubscribed' } });
  await runWorker({ workerRpc: w.rpc, vendor: vendor.v, config }, 'sync');
  const complete = w.calls.find(c => c.action === 'completeSync');
  equal([complete.jobId, complete.leaseToken, complete.outcome, complete.vendorStatus], [7, rid, 'done', 'pending']);
  equal(w.calls.find(c => c.action === 'observe'), { action: 'observe', destinationKey: destinationKey('x@y.z'), contactId: 'cx', status: 'unsubscribed' });
  ok(!w.calls.some(c => c.action === 'claimDispatch'), 'sync task does not dispatch');
});

// ------------------------------------------------------------------ webhook
const secret = 'whsec-test';
const event = (over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), type: 'contact.unsubscribed', list_id: 'list-1', contact_id: '8f5a8d3e-0000-4000-8000-000000000001', occurred_at: '2026-10-09T12:00:00+00:00', contact_email_address: 'Friend@Example.com', ...over });
async function signed(body: string, sig?: string) {
  const bytes = new TextEncoder().encode(body);
  return new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'emailoctopus-signature': sig ?? await signature(secret, bytes) }, body: bytes });
}

Deno.test('webhook verifies HMAC-SHA256 over the raw bytes before any processing', async () => {
  const body = JSON.stringify([event()]) + '\n';
  for (const sig of ['', 'sha256=' + '0'.repeat(64), await signature('other', new TextEncoder().encode(body)), await signature(secret, new TextEncoder().encode(body.trim()))]) {
    const w = workerRpc({});
    equal((await webhookHandler({ workerRpc: w.rpc, secret, listId: 'list-1' })(await signed(body, sig))).status, 401);
    equal(w.calls, []);
  }
  const w = workerRpc({ vendorEvents: b => ({ processed: b.events.length }) });
  const res = await webhookHandler({ workerRpc: w.rpc, secret, listId: 'list-1' })(await signed(body));
  equal(res.status, 200); equal(await res.json(), { processed: 1 });
  equal((await webhookHandler({ workerRpc: w.rpc, secret: '', listId: 'list-1' })(await signed(body))).status, 503);
});

Deno.test('webhook forwards only hashed addresses for this list and well-formed events', async () => {
  const w = workerRpc({ vendorEvents: b => ({ processed: b.events.length }) });
  const good = event({ type: 'contact.updated', contact_status: 'SUBSCRIBED' });
  const body = JSON.stringify([good, event({ list_id: 'another-list' }), event({ id: 'not-a-uuid' }), event({ occurred_at: 'yesterday' }), event({ contact_email_address: undefined })]);
  await webhookHandler({ workerRpc: w.rpc, secret, listId: 'list-1' })(await signed(body));
  equal(w.calls, [{ action: 'vendorEvents', events: [{ id: good.id, type: 'contact.updated', occurredAt: '2026-10-09T12:00:00.000Z',
    destinationKey: destinationKey('friend@example.com'), contactId: good.contact_id, status: 'SUBSCRIBED' }] }]);
  ok(!JSON.stringify(w.calls).includes('@'), 'no raw address reaches the database');
  const failing = await webhookHandler({ workerRpc: async () => ({ data: null, error: { message: 'down' } }), secret, listId: 'list-1' })(await signed(JSON.stringify([event()])));
  equal(failing.status, 500, 'non-2xx makes the vendor retry; processing is idempotent by event id');
});
