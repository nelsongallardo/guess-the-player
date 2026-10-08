#!/usr/bin/env node
// Local end-to-end bridge for browser checks: the REAL Edge HTTP handler
// (supabase/functions/_shared/http.ts, type-stripped by Node >= 23) backed by
// a REAL isolated PostgreSQL cluster with every migration applied. Supabase
// Auth is SIMULATED: bearer "test-<uuid>" is that user; there is no OAuth and
// no hosted service. A loopback-only /__test/sql endpoint seeds fixtures.
//
// PG_BIN=... PG_MODULE=... node tests/leagues-bridge.mjs   (listens on 127.0.0.1:54330)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { handler } from '../supabase/functions/_shared/http.ts';
const { default: pg } = await import(process.env.PG_MODULE ? pathToFileURL(process.env.PG_MODULE).href : 'pg');
const root = new URL('../', import.meta.url);
const pgBin = process.env.PG_BIN || '';
const bin = cmd => pgBin ? path.join(pgBin, cmd) : cmd;
const PORT = Number(process.env.BRIDGE_PORT || 54330), PG_PORT = 55443;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leagues-bridge-'));
execFileSync(bin('initdb'), ['-D', path.join(dir, 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
execFileSync(bin('pg_ctl'), ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'postgres.log'), '-w', '-o', `-k ${dir} -p ${PG_PORT} -c listen_addresses='' -c fsync=off`, 'start'], { stdio: 'pipe' });
const stop = () => { try { execFileSync(bin('pg_ctl'), ['-D', path.join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' }); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
const connect = async () => { const c = new pg.Client({ host: dir, port: PG_PORT, user: 'postgres', database: 'postgres' }); await c.connect(); return c; };
const admin = await connect();
await admin.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon,authenticated,service_role;`);
for (const f of fs.readdirSync(new URL('supabase/migrations/', root)).filter(f => f.endsWith('.sql')).sort())
  await admin.query(fs.readFileSync(new URL(`supabase/migrations/${f}`, root), 'utf8'));
await admin.query(`create table public.test_clock(now timestamptz);
  create or replace function ranked_private.utc_now() returns timestamptz language sql volatile set search_path = '' as
  $$ select coalesce((select now from public.test_clock limit 1), clock_timestamp()) $$;`);
const service = await connect();
await service.query('set role service_role');
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));
const rpc = fn => async (userId, request) => serial(async () => {
  try { const { rows } = await service.query(`select public.${fn}($1::uuid,$2::jsonb) as r`, [userId, JSON.stringify(request)]); return { data: rows[0].r, error: null }; }
  catch (error) { return { data: null, error: { message: error.message } }; }
});
const deps = {
  async getUser(token) {
    const match = /^test-([0-9a-f-]{36})$/.exec(token); if (!match) return null;
    await admin.query('insert into auth.users(id) values($1) on conflict do nothing', [match[1]]);
    return { id: match[1] };
  },
  rpc: rpc('ranked_game'), leagueRpc: rpc('private_leagues'),
  async deleteUser(id) { await admin.query('delete from auth.users where id=$1', [id]); return true; },
};
const handlers = { 'ranked-game': handler(deps), 'private-leagues': handler(deps, 'private-leagues'), 'account-delete': handler(deps, 'account-delete') };
http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  try {
    if (req.url === '/__test/sql' && req.method === 'POST') {
      const result = await admin.query(JSON.parse(body.toString()).sql);
      const rows = (Array.isArray(result) ? result.at(-1) : result).rows ?? [];
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(rows)); return;
    }
    const name = /^\/functions\/v1\/([a-z-]+)$/.exec(req.url || '')?.[1];
    if (!name || !handlers[name]) { res.writeHead(404); res.end(); return; }
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const response = await handlers[name](new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ bridgeError: String(error.message) })); }
}).listen(PORT, '127.0.0.1', () => console.log(`leagues bridge ready on 127.0.0.1:${PORT} (real handler + real PostgreSQL; Auth SIMULATED)`));
