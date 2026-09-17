import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const migration = new URL('supabase/migrations/202609170001_expand_ranked_roster_210_to_220.sql', root);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const context = vm.createContext({});
vm.runInContext(script('roster-data') + script('game-model'), context);
const model = vm.runInContext('({players: PLAYERS, candidates: CareerGame.candidates, game: CareerGame})', context);
const plain = value => JSON.parse(JSON.stringify(value));
const expectedMemberships = plain(model.players).flatMap(player => ['all', ...player.competitions].map(competition => ({player_id: player.id, competition})));
const expectedRivals = plain(model.players).flatMap(player => model.game.eligibleRivals(player).map(candidate => ({player_id: player.id, candidate_id: model.candidates.find(item => item.name === candidate).id})));
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
  assert.equal(candidates.length, model.candidates.length);
  assert.equal(players.length, 220);
  assert.equal(memberships.length, expectedMemberships.length);
  assert.equal(rivals.length, expectedRivals.length);
  assert.deepEqual(new Set(candidates.map(row => row.id)), new Set(plain(model.candidates).map(row => row.id)));
  assert.deepEqual(new Set(players.map(row => row.id)), new Set(plain(model.players).map(row => row.id)));
  for (const id of batch11) assert.ok(players.some(row => row.id === id), id);
  execFileSync(process.execPath, [new URL('scripts/export-ranked-roster-220-forward.mjs', root).pathname, '--check'], {stdio: 'pipe'});
});
