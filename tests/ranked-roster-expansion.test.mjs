import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const migration = new URL('supabase/migrations/202609160002_expand_ranked_roster_120_to_160.sql', root);
const ninthMigration = new URL('supabase/migrations/202609160001_ninth_roster_expansion.sql', root);
const selected = JSON.parse(fs.readFileSync(new URL('research/player-addition-batch9/candidate-shortlist.json', root), 'utf8')).results.selected;
const recordsets = sql => [...sql.matchAll(/jsonb_to_recordset\('((?:''|[^'])*)'::jsonb\)/gs)]
  .map(match => JSON.parse(match[1].replaceAll("''", "'")));

test('forward ranked-roster migration is generated from the 160-player model', () => {
  assert.ok(fs.existsSync(migration), 'forward migration must exist');
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /^-- Generated forward roster migration/m);
  assert.match(sql, /begin;/);
  assert.match(sql, /commit;/);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /delete from ranked_private\.rivals/);
  assert.doesNotMatch(sql, /delete from ranked_private\.(players|candidates|memberships|results|rounds)/);
  for (const id of selected) assert.ok(sql.includes(`\\"id\\":\\"${id}\\"`) || sql.includes(`"id":"${id}"`), id);
});

test('the pending 120-player migration declares every candidate foreign-key prerequisite', () => {
  const sets = recordsets(fs.readFileSync(ninthMigration, 'utf8'));
  const insertedCandidates = new Set(sets.find(rows => rows[0]?.label)?.map(row => row.id));
  const players = sets.find(rows => rows[0]?.country);
  const memberships = sets.find(rows => rows[0]?.competition);
  const rivals = sets.find(rows => rows[0]?.candidate_id);
  const insertedPlayers = new Set(players.map(row => row.id));
  assert.equal(insertedCandidates.size, 179, 'reviewed 120-player candidate set');
  assert.equal(insertedPlayers.size, 120, 'reviewed 120-player roster');
  assert.equal(memberships.length, 412, 'reviewed 120-player memberships');
  for (const id of [...players.map(row => row.id), ...rivals.map(row => row.candidate_id)]) {
    assert.ok(insertedCandidates.has(id), `missing candidate prerequisite: ${id}`);
  }
  for (const id of [...memberships.map(row => row.player_id), ...rivals.map(row => row.player_id)]) {
    assert.ok(insertedPlayers.has(id), `missing player prerequisite: ${id}`);
  }
});
