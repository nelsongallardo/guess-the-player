import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = id => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const ctx = vm.createContext({});
vm.runInContext(script('roster-data') + script('crest-data') + script('game-model'), ctx);
const {game:g, players, assets} = vm.runInContext('({game:CareerGame,players:PLAYERS,assets:CREST_ASSETS})', ctx);
const clone = o => JSON.parse(JSON.stringify(o));
const plain = o => JSON.parse(JSON.stringify(o));
const wrong = s => g.roundAt(s).options.filter(n => n !== g.playerAt(s).name);

test('exactly 30 explicit researched records: 15 Europe + 15 South America', () => {
  assert.equal(players.length,30);
  assert.equal(new Set(players.map(p=>p.name)).size,30);
  assert.equal(new Set(players.map(p=>p.id)).size,30);
  for (const continent of ['Europe','South America']) assert.equal(players.filter(p=>p.continent===continent).length,15);
  const frozen=JSON.parse(fs.readFileSync(new URL('../research/verified-players.json', import.meta.url),'utf8'));
  assert.deepEqual(plain(players.map(({clubCrests,incorrectOptions,...p})=>p)),frozen);
  const nationalNames=new Set(players.map(p=>p.country));
  for(const p of players){
    assert.equal(p.verifiedAt,'2026-09-11'); assert.ok(p.country && p.position && p.clubs.length);
    assert.ok(p.sources.length>=2); assert.equal(p.clubs.length,p.clubCrests.length);
    assert.ok(p.sources.every(s=>/^https?:\/\//.test(s.url)));
    assert.ok(p.clubs.every(c=>c.name && c.years && !nationalNames.has(c.name)));
    assert.ok(p.incorrectOptions.length>=4); assert.ok(!p.incorrectOptions.includes(p.name));
  }
});

test('every ordered public crest URL has a valid embedded PNG; no external dependencies',()=>{
  const used=new Set();
  for(const p of players) for(const u of p.clubCrests){
    assert.ok(/^https:\/\//.test(u)); assert.ok(assets[u]); used.add(u);
    const bytes=Buffer.from(assets[u].dataUrl.split(',')[1],'base64');
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0);
  }
  assert.equal(used.size,Object.keys(assets).length);
  assert.ok(!/<script[^>]+src=|<link[^>]+rel=["']stylesheet|@import\b/.test(html));
  assert.ok(!html.includes('__PLAYER_DATABASE__') && !html.includes('__CREST_ASSETS__'));
});

test('30,000 option samples always contain five unique names and exactly one correct answer',()=>{
  for(const p of players){
    const orders=new Set();
    for(let i=0;i<1000;i++){
      const names=g.optionsFor(p);
      assert.equal(names.length,5); assert.equal(new Set(names).size,5);
      assert.equal(names.filter(n=>n===p.name).length,1);
      assert.ok(names.every(n=>n===p.name || p.incorrectOptions.includes(n)));
      // Identical badge paths (e.g. Scholes/Giggs) are never simultaneous answers.
      for(const n of names.filter(n=>n!==p.name)) assert.notEqual(JSON.stringify(players.find(o=>o.name===n).clubs.map(c=>c.name)),JSON.stringify(p.clubs.map(c=>c.name)));
      orders.add(names.join('|'));
    }
    assert.ok(orders.size>100);
  }
});

test('all 30 rounds: first/second/third-attempt wins, losses, score, streak and recap',()=>{
  const s=g.create(); let wins=0,streak=0,best=0;
  for(let i=0;i<30;i++){
    assert.equal(s.roundIndex,i); assert.equal(g.validate(s),true); assert.equal(g.outcome(s),'playing');
    assert.equal(g.next(s),false); const incorrect=wrong(s);
    const missCount=i%4;
    for(let j=0;j<missCount;j++) assert.equal(g.answer(s,incorrect[j]),true);
    if(missCount<3){assert.equal(g.answer(s,g.playerAt(s).name),true);wins++;streak++;best=Math.max(best,streak);assert.equal(g.outcome(s),'won');}
    else {streak=0;assert.equal(g.outcome(s),'lost');}
    assert.deepEqual(plain(g.stats(s)),{score:wins*100,wins,streak,best,completed:i+1});
    assert.equal(g.answer(s,g.playerAt(s).name),false);assert.equal(g.hint(s),false);
    assert.equal(g.validate(s),true);assert.equal(g.next(s),true);
  }
  assert.equal(s.finished,true);assert.equal(new Set(s.deck).size,30);assert.equal(g.validate(s),true);
  assert.equal(g.next(s),false);assert.equal(g.answer(s,'not an option'),false);assert.equal(g.hint(s),false);
  assert.equal(g.create().rounds.length,1);
});

test('invalid/repeated guesses cannot spend attempts or award points twice',()=>{
  const s=g.create(), first=wrong(s)[0];
  assert.equal(g.answer(s,'unknown'),false);assert.equal(g.roundAt(s).guesses.length,0);
  assert.equal(g.answer(s,first),true);assert.equal(g.answer(s,first),false);assert.equal(g.roundAt(s).guesses.length,1);
  assert.equal(g.answer(s,g.playerAt(s).name),true);assert.equal(g.answer(s,g.playerAt(s).name),false);
  assert.equal(g.stats(s).score,100);assert.equal(g.next(s),true);assert.equal(g.next(s),false);assert.equal(s.roundIndex,1);
});

test('hints reveal exactly country, position, displayed-name initials and cost no attempts',()=>{
  const s=g.create(),p=g.playerAt(s);
  assert.deepEqual(plain(g.hintValues(p)),[p.country,p.position,g.initials(p.name)]);
  for(let i=1;i<=3;i++){assert.equal(g.hint(s),true);assert.equal(g.roundAt(s).hints,i);}
  assert.equal(g.hint(s),false);assert.equal(g.roundAt(s).guesses.length,0);assert.equal(g.stats(s).score,0);
  assert.equal(g.initials('Lionel Messi'),'L. M.');assert.equal(g.initials('Pelé'),'P.');assert.equal(g.initials('  Andrés   Iniesta '),'A. I.');
});

test('persistence accepts every legitimate state and rejects malformed or impossible saves',()=>{
  const good=g.create();assert.equal(g.validate(clone(good)),true);
  for(const bad of [null,{},42,'x',[],{...clone(good),finished:'true'},{...clone(good),version:2},{...clone(good),roundIndex:30},{...clone(good),roundIndex:-1},{...clone(good),roundIndex:.5},{...clone(good),finished:true}])assert.equal(g.validate(bad),false);
  const mutations=[s=>s.deck.pop(),s=>s.deck[1]=s.deck[0],s=>s.deck[0]='unknown',s=>s.rounds[0].options.pop(),s=>s.rounds[0].options[0]='unknown',s=>s.rounds[0].options.fill(g.playerAt(s).name),s=>s.rounds[0].hints=4,s=>s.rounds[0].hints=-1,s=>s.rounds[0].hints='1',s=>s.rounds[0].guesses=['unknown'],s=>s.rounds[0].guesses=[wrong(s)[0],wrong(s)[0]],s=>s.rounds[0].guesses=[g.playerAt(s).name,wrong(s)[0]],s=>s.rounds[0].guesses=wrong(s),s=>{s.roundIndex=1;s.rounds.push(clone(s.rounds[0]));}];
  for(const change of mutations){const s=clone(good);change(s);assert.equal(g.validate(s),false,String(change));}
  for(let i=0;i<30;i++){g.answer(good,g.playerAt(good).name);assert.equal(g.validate(clone(good)),true);g.next(good);assert.equal(g.validate(clone(good)),true);}
  assert.equal(g.stats(good).score,3000);assert.equal(g.stats(good).streak,30);
});

test('shuffle does not mutate inputs and decks never repeat a player',()=>{
  const original=[1,2,3,4,5];g.shuffle(original);assert.deepEqual(original,[1,2,3,4,5]);
  const starts=new Set();for(let i=0;i<200;i++){const s=g.create();assert.equal(new Set(s.deck).size,30);starts.add(s.deck[0]);assert.equal(g.validate(s),true);}
  assert.ok(starts.size>10);
});
