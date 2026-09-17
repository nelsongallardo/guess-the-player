import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// This file originally cross-checked the frozen 160→210 migration against the
// *live* runtime model (candidate/rival/membership counts, exact id sets).
// That equality is expected to go stale the moment a later batch legitimately
// grows the roster past 210 - eligibleRivals() for these same 210 players can
// now also match the newer batches' candidates, and the live PLAYERS array no
// longer has exactly 210 entries. Per the forward-migration policy (see
// AGENTS.md's "Career-data changes" and research/player-addition-batch11/),
// this is not a bug to fix by editing the frozen migration; it is a
// point-in-time historical artifact. The equivalent live-model check for the
// *current* latest migration lives in the newest `ranked-roster-*.test.mjs`
// file (currently `ranked-roster-220.test.mjs`); this file now only checks
// the frozen 160→210 file's own unchanging structural shape and byte
// preservation, not equality with an ever-growing roster.
const root = new URL('../', import.meta.url);
const migration = new URL('supabase/migrations/202609160003_expand_ranked_roster_160_to_210.sql', root);
const recordsets = sql => [...sql.matchAll(/jsonb_to_recordset\('((?:''|[^'])*)'::jsonb\)/gs)]
  .map(match => JSON.parse(match[1].replaceAll("''", "'")));

test('the frozen 160-to-210 migration keeps its reviewed shape and batch-10 players', () => {
  assert.ok(fs.existsSync(migration));
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /^-- Generated forward roster migration from the reviewed 210-player runtime model/m);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /delete from ranked_private\.rivals/);
  assert.doesNotMatch(sql, /delete from ranked_private\.(players|candidates|memberships|results|rounds|receipts)/);
  const sets = recordsets(sql);
  const candidates = sets.find(rows => rows[0]?.label);
  const players = sets.find(rows => rows[0]?.country);
  const memberships = sets.find(rows => rows[0]?.competition);
  const rivals = sets.find(rows => rows[0]?.candidate_id);
  assert.equal(players.length, 210);
  assert.ok(candidates.length >= 210);
  assert.ok(memberships.length > 0);
  assert.ok(rivals.length > 0);
  assert.equal(new Set(players.map(row => row.id)).size, 210);
  const selected = new Set(Object.values(JSON.parse(fs.readFileSync(new URL('research/player-addition-batch10/selected-ids.json', root), 'utf8')).continents).flat());
  for (const id of selected) assert.ok(players.some(row => row.id === id), id);
});
