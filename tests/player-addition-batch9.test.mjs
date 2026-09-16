import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const modelContext = vm.createContext({});
vm.runInContext(script('roster-data') + script('crest-data') + script('game-model'), modelContext);
const model = vm.runInContext('({players:PLAYERS, assets:CREST_ASSETS, game:CareerGame})', modelContext);
model.bank = model.game.candidates.filter(candidate => !model.players.some(player => player.id === candidate.id));
const localeContext = vm.createContext({});
vm.runInContext(script('locale-data'), localeContext);
const spanishNotes = vm.runInContext('SPANISH_NOTES', localeContext);

const records = readJson('research/player-addition-batch9/records.json');
const shortlist = readJson('research/player-addition-batch9/candidate-shortlist.json');
const verifiedPlayers = readJson('research/verified-players.json');
const verifiedDistractors = readJson('research/verified-distractors.json');
const batchCrests = readJson('research/player-addition-batch9/crest-assets.json');
const batchCrestUrls = new Set(Object.values(batchCrests).map(asset => asset.sourceURL));
const selected = new Set(shortlist.results.selected);
// These ten were published by the upstream 120-player batch while this larger
// batch was in progress. Preserve those canonical routes rather than replacing
// them with this branch's independently researched representation.
const publishedUpstream = new Set(['fernando-couto','paulo-sousa','diego-ribas','lucas-moura','daniel-bertoni','cristian-rodriguez','daniel-fonseca','robin-van-persie','roberto-mancini','emmanuel-petit']);

const plain = value => JSON.parse(JSON.stringify(value));

test('batch 9 adds exactly fifty reviewed players with a 25/25 continental split', () => {
  assert.equal(records.length, 50);
  assert.deepEqual(new Set(records.map(record => record.id)), selected);
  assert.equal(records.filter(record => record.continent === 'Europe').length, 25);
  assert.equal(records.filter(record => record.continent === 'South America').length, 25);
  assert.equal(model.players.length, 160);
  assert.equal(verifiedPlayers.length, 160);
  assert.deepEqual(new Set(model.players.map(player => player.id)), new Set(verifiedPlayers.map(player => player.id)));
  for (const id of selected) assert.ok(model.players.some(player => player.id === id), id);
});

test('promotions leave thirty-three bank-only profiles with reviewed regional coverage support', () => {
  assert.equal(verifiedDistractors.length, 33);
  assert.equal(model.bank.length, 33);
  for (const id of selected) {
    assert.ok(!verifiedDistractors.some(profile => profile.id === id), id);
    assert.ok(!model.bank.some(profile => profile.id === id), id);
  }
  const names = [...model.players, ...model.bank].map(profile => profile.name);
  assert.equal(names.length, 193);
  assert.equal(new Set(names).size, 193);
  assert.ok(model.bank.some(profile => profile.id === 'joao-pinto'));
  for (const id of ['tomas-brolin','martin-dahlin','sebastian-larsson','patricio-yanez','ivo-basay','mark-gonzalez','matias-fernandez','alvaro-recoba','roberto-palacios','flavio-maestri','paolo-guerrero','carlos-lobaton','luis-advincula']) {
    assert.ok(model.bank.some(profile => profile.id === id), id);
  }
});

test('all fifty promoted routes have ordered embedded crests and aligned Spanish notes', () => {
  for (const record of records) {
    const player = model.players.find(candidate => candidate.id === record.id);
    assert.ok(player, record.id);
    if (!publishedUpstream.has(record.id)) assert.deepEqual(plain(player.clubs), record.clubs, record.id);
    assert.equal(player.clubCrests.length, player.clubs.length, record.id);
    for (const sourceUrl of player.clubCrests) {
      assert.match(sourceUrl, /^https:\/\//);
      assert.ok(model.assets[sourceUrl], `${record.id}: ${sourceUrl}`);
      if (batchCrestUrls.has(sourceUrl)) assert.match(model.assets[sourceUrl].sourcePage, /^https:\/\//);
      const bytes = Buffer.from(model.assets[sourceUrl].dataUrl.split(',')[1], 'base64');
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
    if (!publishedUpstream.has(record.id)) assert.equal(spanishNotes[record.id].notes, record.esNotes, record.id);
    else assert.ok(spanishNotes[record.id].notes.length > 0, record.id);
    assert.equal(spanishNotes[record.id].clubNotes.length, player.clubs.length, record.id);
    if (!publishedUpstream.has(record.id)) for (const [index, text] of Object.entries(record.esClubNotes)) {
      assert.equal(spanishNotes[record.id].clubNotes[Number(index)], text, record.id);
    }
  }
});

test('all newly playable first clubs have an explicit domestic origin-system mapping', () => {
  for (const record of records) {
    assert.ok(model.game.originFor({clubs: [{name: record.clubs[0].name}]}), `${record.id}: ${record.clubs[0].name}`);
  }
});

test('promoted playable signatures do not collide with another playable answer', () => {
  for (const record of records) {
    const signature = JSON.stringify(record.clubs.map(club => club.name));
    const duplicates = model.players.filter(player => player.id !== record.id && JSON.stringify(player.clubs.map(club => club.name)) === signature);
    assert.deepEqual(plain(duplicates.map(player => player.id)), [], record.id);
  }
});
