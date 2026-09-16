// Generate the reviewed forward roster migration without rewriting frozen history.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const block = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))?.[1] ?? (() => { throw Error(`Missing ${id}`); })();
const context = vm.createContext({});
vm.runInContext(block('roster-data') + block('game-model'), context);
const {players, game} = vm.runInContext('({players: PLAYERS, game: CareerGame})', context);
const byName = new Map(game.candidates.map(candidate => [candidate.name, candidate]));
const candidates = game.candidates.map(candidate => ({id: candidate.id, label: candidate.name}));
const roster = players.map(player => ({id: player.id, country: player.country, position: player.position}));
const memberships = players.flatMap(player => ['all', ...player.competitions].map(competition => ({player_id: player.id, competition})));
const rivals = players.flatMap(player => game.eligibleRivals(player).map(name => {
  const candidate = byName.get(name);
  assert(candidate && candidate.id !== player.id);
  assert.notDeepEqual(player.clubs.map(club => club.name), candidate.clubs.map(club => club.name));
  return {
    player_id: player.id,
    candidate_id: candidate.id,
    tier: game.matchTier(player, candidate),
    similarity: game.similarity(player, candidate),
    competitions: candidate.competitions,
  };
}));
for (const player of players) assert(rivals.filter(rival => rival.player_id === player.id && rival.tier === 0).length >= 4, player.id);
assert.equal(new Set(candidates.map(candidate => candidate.id)).size, candidates.length);

const quoted = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const records = (value, columns) => `select * from jsonb_to_recordset(${quoted(value)}) as x(${columns})`;
const sql = `-- Generated forward roster migration from the reviewed 160-player model.\n` +
`-- Adds candidates/players/memberships, refreshes future rival pools, and never rewrites results or active rounds.\n` +
`begin;\n` +
`insert into ranked_private.candidates ${records(candidates, 'id text, label text')} on conflict (id) do update set label=excluded.label;\n` +
`insert into ranked_private.players ${records(roster, 'id text, country text, position text')} on conflict (id) do update set country=excluded.country, position=excluded.position;\n` +
`insert into ranked_private.memberships ${records(memberships, 'player_id text, competition text')} on conflict (player_id, competition) do nothing;\n` +
`delete from ranked_private.rivals where player_id in (select id from jsonb_to_recordset(${quoted(roster)}) as x(id text, country text, position text));\n` +
`insert into ranked_private.rivals ${records(rivals, 'player_id text, candidate_id text, tier integer, similarity double precision, competitions text[]')};\n` +
`commit;\n`;

const migration = new URL('supabase/migrations/202609160002_expand_ranked_roster_120_to_160.sql', root);
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(migration, 'utf8'), sql, 'Forward ranked roster migration is stale; regenerate and review');
} else {
  fs.writeFileSync(migration, sql);
}
console.log(JSON.stringify({players: roster.length, candidates: candidates.length, rivals: rivals.length, memberships: memberships.length, check: process.argv.includes('--check')}));
