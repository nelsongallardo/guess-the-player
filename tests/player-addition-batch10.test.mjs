import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))?.[1] ?? (() => { throw Error(`Missing ${id}`); })();
const modelContext = vm.createContext({});
vm.runInContext(script('roster-data') + script('crest-data') + script('game-model'), modelContext);
const model = vm.runInContext('({players: PLAYERS, assets: CREST_ASSETS, game: CareerGame})', modelContext);
model.bank = model.game.candidates.filter(candidate => !model.players.some(player => player.id === candidate.id));
const localeContext = vm.createContext({});
vm.runInContext(script('locale-data'), localeContext);
const spanishNotes = vm.runInContext('SPANISH_NOTES', localeContext);
const records = readJson('research/player-addition-batch10/records.json');
const shortlist = readJson('research/player-addition-batch10/candidate-shortlist.json');
const selection = readJson('research/player-addition-batch10/selected-ids.json');
const crestSources = readJson('research/player-addition-batch10/crest-sources-reviewed.json');
const batchCrestAssets = readJson('research/player-addition-batch10/crest-assets.json');
const verifiedPlayers = readJson('research/verified-players.json');
const verifiedDistractors = readJson('research/verified-distractors.json');
const newEvidence = [
  ...readJson('research/player-addition-batch10/europe-new-evidence.json'),
  ...readJson('research/player-addition-batch10/south-america-new-evidence.json'),
];
const promotionEvidence = readJson('research/player-addition-batch10/bank-promotion-evidence.json');
const peerBank = readJson('research/player-addition-batch10/peer-bank-records.json');
const peerEvidence = fs.readFileSync(new URL('research/player-addition-batch10/PEER_BANK_SOURCES.md', root), 'utf8');
const selected = new Set(Object.values(selection.continents).flat());
const plain = value => JSON.parse(JSON.stringify(value));

test('batch 10 shortlist retains the three-times discovery audit', () => {
  assert.equal(shortlist.baseline.commit, '431cd6ad4cb49503b4a7c84835622ff5b33816b6');
  assert.ok(shortlist.candidates.length >= 150);
  assert.equal(shortlist.candidates.filter(candidate => candidate.decision === 'selected').length, 50);
  assert.deepEqual(new Set(shortlist.candidates.filter(candidate => candidate.decision === 'selected').map(candidate => candidate.id)), selected);
});

test('batch 10 adds exactly fifty reviewed players with a 25/25 continental split', () => {
  assert.equal(records.length, 50);
  assert.deepEqual(new Set(records.map(record => record.id)), selected);
  assert.equal(records.filter(record => record.continent === 'Europe').length, 25);
  assert.equal(records.filter(record => record.continent === 'South America').length, 25);
  // The roster only grows with later batches, so this stays a lower bound
  // rather than an exact count frozen at batch 10's own point in time.
  assert.ok(model.players.length >= 210);
  assert.ok(verifiedPlayers.length >= 210);
  for (const id of selected) assert.ok(model.players.some(player => player.id === id), id);
  assert.deepEqual(new Set(model.players.map(player => player.id)), new Set(verifiedPlayers.map(player => player.id)));
});

test('all eighteen newly researched careers retain two independent domains with literal evidence', () => {
  assert.equal(newEvidence.length, 18);
  assert.equal(new Set(newEvidence.map(entry => entry.id)).size, 18);
  for (const entry of newEvidence) {
    const record = records.find(candidate => candidate.id === entry.id);
    assert.ok(record, entry.id);
    const evidenceByUrl = new Map(entry.sources.map(source => [source.url, source]));
    for (const source of record.sources) {
      assert.ok(evidenceByUrl.has(source.url), `${entry.id}: ${source.url}`);
      assert.ok(evidenceByUrl.get(source.url).excerpts?.length > 0, `${entry.id}: ${source.url}`);
    }
    assert.ok(new Set(record.sources.map(source => new URL(source.url).hostname.replace(/^www\./, ''))).size >= 2, entry.id);
    for (const source of entry.sources) {
      assert.ok(source.excerpts?.length > 0, `${entry.id}: ${source.url}`);
      assert.ok(source.excerpts.every(excerpt => typeof excerpt === 'string' && excerpt.trim().length > 0), `${entry.id}: ${source.url}`);
    }
  }
  const gilberto = records.find(candidate => candidate.id === 'gilberto-silva');
  assert.match(gilberto.notes, /1997.*1998|1998.*1997/s);
  assert.match(gilberto.esNotes, /1997.*1998|1998.*1997/s);
});

test('corrected Nelson Cuevas promotion retains exact two-domain playable-route evidence', () => {
  assert.equal(promotionEvidence.length, 1);
  const evidence = promotionEvidence[0];
  assert.equal(evidence.id, 'nelson-cuevas');
  const record = records.find(candidate => candidate.id === evidence.id);
  assert.ok(record);
  const evidenceByUrl = new Map(evidence.sources.map(source => [source.url, source]));
  for (const source of record.sources) {
    assert.ok(evidenceByUrl.has(source.url), source.url);
    assert.ok(evidenceByUrl.get(source.url).excerpts?.length > 0, source.url);
  }
  assert.ok(new Set(record.sources.map(source => new URL(source.url).hostname.replace(/^www\./, ''))).size >= 2);
  assert.deepEqual(record.clubs.slice(0, 4).map(club => club.name), ['River Plate','Shanghai COSCO Sanlin','River Plate','Pachuca']);
  assert.match(record.clubs[3].note, /Loan from Club América/);
});

test('promotions retain Franco Baresi plus the researched sparse-system peer bank', () => {
  assert.equal(peerBank.length, 36);
  for (const profile of peerBank) {
    assert.equal(profile.evidenceFile, 'research/player-addition-batch10/PEER_BANK_SOURCES.md');
    assert.match(peerEvidence, new RegExp(`^## ${profile.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'), profile.id);
  }
  assert.deepEqual(verifiedDistractors.map(profile => profile.id), ['franco-baresi', ...peerBank.map(profile => profile.id)]);
  assert.deepEqual(plain(model.bank.map(profile => profile.id)), verifiedDistractors.map(profile => profile.id));
  const names = [...model.players, ...model.bank].map(profile => profile.name);
  // 247 was the exact combined total at batch 10's own point in time; later
  // batches only add playable names (the bank shrinks or holds steady), so
  // this stays a lower bound plus a permanent uniqueness check.
  assert.ok(names.length >= 247);
  assert.equal(new Set(names).size, names.length);
  for (const id of selected) assert.ok(!model.bank.some(profile => profile.id === id), id);
});

test('reviewed crest inputs do not substitute known successor or legally distinct club identities', () => {
  assert.equal(Object.keys(crestSources).length, 151);
  assert.deepEqual(Object.keys(batchCrestAssets).sort(), Object.keys(crestSources).sort());
  const forbidden = {
    'UMFS Dalvík': /Dalv%C3%ADk-Reynir|Dalv[ií]k\/Reynir/i,
    Morelia: /Atl%C3%A9tico_Morelia|Atl[eé]tico Morelia/i,
    'Steaua București': /Fcsb-logo|\bFCSB\b/i,
    'FC Constanța': /FC_Farul_Constanta|FCV Farul/i,
  };
  for (const [club, pattern] of Object.entries(forbidden)) {
    const source = crestSources[club];
    assert.ok(source, club);
    assert.doesNotMatch(`${source.sourceURL} ${source.sourcePage} ${source.sourceTitle}`, pattern, club);
  }
});

test('all fifty new playable routes have embedded crests and aligned Spanish notes', () => {
  for (const [country, translation] of Object.entries({Croatia:'Croacia',Denmark:'Dinamarca',Finland:'Finlandia',Romania:'Rumanía',Turkey:'Turquía',Ukraine:'Ucrania','Yugoslavia / Serbia and Montenegro':'Yugoslavia / Serbia y Montenegro'})) {
    assert.ok(html.includes(`${JSON.stringify(country)}:${JSON.stringify(translation)}`), country);
  }
  for (const record of records) {
    const player = model.players.find(candidate => candidate.id === record.id);
    assert.ok(player, record.id);
    assert.deepEqual(plain(player.clubs), record.clubs, record.id);
    assert.equal(player.clubCrests.length, player.clubs.length, record.id);
    for (const sourceUrl of player.clubCrests) {
      const asset = model.assets[sourceUrl];
      assert.ok(asset, `${record.id}: ${sourceUrl}`);
      const bytes = Buffer.from(asset.dataUrl.split(',')[1], 'base64');
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    assert.equal(spanishNotes[record.id].notes, record.esNotes, record.id);
    assert.equal(spanishNotes[record.id].clubNotes.length, player.clubs.length, record.id);
    for (const [index, text] of Object.entries(record.esClubNotes)) {
      assert.equal(spanishNotes[record.id].clubNotes[Number(index)], text, record.id);
    }
  }
});

test('every new first club has an explicit origin and every route is answer-distinct', () => {
  const suker = model.players.find(player => player.id === 'davor-suker');
  assert.equal(model.game.originFor(suker).system, 'yugoslavia');
  for (const record of records) {
    assert.ok(model.game.originFor({id: record.id, clubs: [{name: record.clubs[0].name}]}), `${record.id}: ${record.clubs[0].name}`);
    const signature = JSON.stringify(record.clubs.map(club => club.name));
    const duplicates = model.players.filter(player => player.id !== record.id && JSON.stringify(player.clubs.map(club => club.name)) === signature);
    assert.deepEqual(plain(duplicates.map(player => player.id)), [], record.id);
  }
});
