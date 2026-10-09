#!/usr/bin/env node
// Owner-requested legacy reminder cohort and delivery settings (ADR 0030).
//
//   node scripts/email-reminders-cohort.mjs freeze  --cohort existing-friends-20261009 --cutoff 2026-10-09T18:00:00Z
//   node scripts/email-reminders-cohort.mjs preview --cohort existing-friends-20261009
//   node scripts/email-reminders-cohort.mjs apply   --cohort existing-friends-20261009 --manifest <digest>            (dry run)
//   node scripts/email-reminders-cohort.mjs apply   --cohort existing-friends-20261009 --manifest <digest> --execute
//   node scripts/email-reminders-cohort.mjs settings
//   node scripts/email-reminders-cohort.mjs dispatch-preview
//
// Every command is a dry run unless it is `apply ... --execute`. `freeze`
// stores the frozen account list privately in the database (it never leaves
// it) and prints only aggregate counts plus the manifest digest that `apply`
// must quote back. Nothing here prints an address or account identifier, and
// nothing here contacts EmailOctopus: applied rows are queued for the worker.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (server credentials: never commit them, never paste them into the browser).
import { pathToFileURL } from 'node:url';

const COHORT = /^[a-z0-9-]{3,64}$/;
const DIGEST = /^[0-9a-f]{64}$/;

function option(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export async function run(argv, { rpc, log = console.log }) {
  const [command] = argv;
  const cohortId = option(argv, '--cohort');
  const needCohort = () => { if (!cohortId || !COHORT.test(cohortId)) throw Error('--cohort <id> is required (a-z, 0-9, -)'); };
  const call = async (fn, body) => {
    const result = await rpc(fn, body);
    if (result?.error) throw Error(`${body.action} failed: ${result.error.code}`);
    return result;
  };
  let result;
  if (command === 'freeze') {
    needCohort();
    const cutoff = option(argv, '--cutoff');
    if (!cutoff || Number.isNaN(Date.parse(cutoff))) throw Error('--cutoff <ISO 8601 server-time instant> is required');
    result = await call('email_reminders_admin', { action: 'freezeCohort', cohortId, cutoff: new Date(cutoff).toISOString() });
  } else if (command === 'preview') {
    needCohort();
    result = await call('email_reminders_admin', { action: 'previewCohort', cohortId });
  } else if (command === 'apply') {
    needCohort();
    const manifestDigest = option(argv, '--manifest');
    if (!manifestDigest || !DIGEST.test(manifestDigest)) throw Error('--manifest <digest printed by freeze/preview> is required');
    if (!argv.includes('--execute')) {
      result = { dryRun: true, ...await call('email_reminders_admin', { action: 'previewCohort', cohortId }) };
      if (result.manifestDigest !== manifestDigest) throw Error('The manifest digest does not match the frozen cohort');
    } else {
      result = await call('email_reminders_admin', { action: 'applyCohort', cohortId, manifestDigest });
    }
  } else if (command === 'settings') {
    result = await call('email_reminders_admin', { action: 'getSettings' });
  } else if (command === 'dispatch-preview') {
    result = await call('email_reminders_worker', { action: 'previewDispatch' });
  } else {
    throw Error('Usage: freeze | preview | apply | settings | dispatch-preview (see the header of this file)');
  }
  log(JSON.stringify(result, null, 2));
  return result;
}

export function restRpc({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch } = {}) {
  if (!url || !/^https:\/\//.test(url) || !key) throw Error('SUPABASE_URL (https) and SUPABASE_SERVICE_ROLE_KEY are required');
  return async (fn, body) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ request: body }),
    });
    const text = await response.text();
    if (!response.ok) throw Error(`${fn} HTTP ${response.status}`);
    return JSON.parse(text);
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  run(process.argv.slice(2), { rpc: restRpc() }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
