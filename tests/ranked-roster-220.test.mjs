import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const migration = new URL('supabase/migrations/202609170001_expand_ranked_roster_210_to_220.sql', root);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const context = vm.createContext({});
vm.runInContext(script('roster-data') + script('game-model'), context);
const model = vm.runInContext('({players: PLAYERS, candidates: CareerGame.candidates, game: CareerGame})', context);
const plain = value => JSON.parse(JSON.stringify(value));
const batch11 = JSON.parse(fs.readFileSync(new URL('research/player-addition-batch11/records.json', root), 'utf8')).map(r => r.id);
const recordsets = sql => [...sql.matchAll(/jsonb_to_recordset\('((?:''|[^'])*)'::jsonb\)/gs)]
  .map(match => JSON.parse(match[1].replaceAll("''", "'")));

test('the 210-to-220 migration matches the expanded runtime export', () => {
  assert.ok(fs.existsSync(migration));
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /^-- Generated forward roster migration from the reviewed 220-player runtime model/m);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /delete from ranked_private\.rivals/);
  assert.doesNotMatch(sql, /delete from ranked_private\.(players|candidates|memberships|results|rounds|receipts)/);
  const sets = recordsets(sql);
  const candidates = sets.find(rows => rows[0]?.label);
  const players = sets.find(rows => rows[0]?.country);
  const memberships = sets.find(rows => rows[0]?.competition);
  const rivals = sets.find(rows => rows[0]?.candidate_id);
  // This migration is a frozen historical snapshot of the roster as it stood
  // right after batch 11 (220 players) - later batches grow the live model
  // further, so from here on this only checks that the migration's own
  // candidates/players/memberships/rivals are still all present in the live
  // model (nothing it captured was later removed), not that the two sets
  // are identical in size.
  assert.equal(players.length, 220);
  const liveCandidateIds = new Set(plain(model.candidates).map(row => row.id));
  const livePlayerIds = new Set(plain(model.players).map(row => row.id));
  for (const row of candidates) assert.ok(liveCandidateIds.has(row.id), row.id);
  for (const row of players) assert.ok(livePlayerIds.has(row.id), row.id);
  for (const row of memberships) assert.ok(livePlayerIds.has(row.player_id), JSON.stringify(row));
  for (const row of rivals) {
    assert.ok(livePlayerIds.has(row.player_id), JSON.stringify(row));
    assert.ok(liveCandidateIds.has(row.candidate_id), JSON.stringify(row));
  }
  for (const id of batch11) assert.ok(players.some(row => row.id === id), id);
  // scripts/export-ranked-roster-220-forward.mjs asserts the LIVE roster is
  // exactly 220 players (it exists solely to have generated this one frozen
  // migration) - the same "frozen export trap" AGENTS.md documents for the
  // general exporter. It is correspondingly not re-run here as a perpetual
  // CI gate; it would fail by design after every later roster-growing batch,
  // same as this test itself did until the subset checks above replaced its
  // old frozen-vs-live equality assertions.
});
