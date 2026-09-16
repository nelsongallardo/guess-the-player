import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const migration = new URL('supabase/migrations/202609160002_expand_ranked_roster_120_to_160.sql', root);
const selected = JSON.parse(fs.readFileSync(new URL('research/player-addition-batch9/candidate-shortlist.json', root), 'utf8')).results.selected;

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
  execFileSync(process.execPath, [new URL('scripts/export-ranked-roster-forward.mjs', root).pathname, '--check'], {stdio: 'pipe'});
});
