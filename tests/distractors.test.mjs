import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const context=vm.createContext({});vm.runInContext(script('roster-data')+script('game-model'),context);
const {g,players}=vm.runInContext('({g:CareerGame,players:PLAYERS})',context);
const byName=new Map(g.candidates.map(p=>[p.name,p]));
const get=id=>players.find(p=>p.id===id);
const randomFor=seed=>()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646;};
const plain=value=>JSON.parse(JSON.stringify(value));

test('Maradona in La Liga never gets rivals who began outside Argentine senior football',()=>{
  const p=get('diego-maradona'),seen=new Set(),orders=new Set();
  for(let seed=1;seed<=500;seed++){
    const options=g.optionsFor(p,'hard',randomFor(seed),'la-liga');orders.add(options.join('|'));
    for(const name of options.filter(n=>n!==p.name)){
      seen.add(name);assert.equal(g.originFor(byName.get(name)).system,'argentina',`${name} is an obvious wrong-origin giveaway`);
    }
  }
  assert.ok(seen.size>=4,'Four distinct plausible alternatives');assert.ok(orders.size>20,'Answer order still varies');
});

test('career origin comes from the first senior club, not nationality or selected competition',()=>{
  assert.equal(g.originFor(get('lionel-messi')).system,'spain');
  assert.equal(g.originFor(get('esteban-cambiasso')).system,'spain');
  assert.equal(g.originFor(get('robbie-keane')).system,'england');
  assert.equal(g.originFor(get('ryan-giggs')).system,'england');
  assert.equal(g.originFor(get('frank-lampard')).system,'england','Swansea belongs to the English league system');
  assert.equal(g.originFor(get('thierry-henry')).system,'france','Monaco belongs to the French league system');
  for(const p of g.candidates){assert.ok(g.originFor(p).system,p.id);assert.ok(['europe','south-america'].includes(g.originFor(p).region),p.id);}
});

test('all Hard pools preserve the strongest origin tier and use only ranked boundary rivals',()=>{
  for(const p of players)for(const competition of ['all',...g.COMPETITION_IDS]){
    const eligible=g.eligibleRivals(p).map(n=>byName.get(n));
    const same=eligible.filter(q=>g.originFor(q).system===g.originFor(p).system);
    for(let seed=1;seed<=30;seed++){
      const options=g.optionsFor(p,'hard',randomFor(seed),competition),wrong=options.filter(n=>n!==p.name).map(n=>byName.get(n));
      assert.equal(options.length,10);assert.equal(new Set(options).size,10);assert.equal(options.filter(n=>n===p.name).length,1);
      if(same.length>=9)assert.ok(wrong.every(q=>g.originFor(q).system===g.originFor(p).system),p.id+' / '+competition);
      else for(const q of same)assert.ok(options.includes(q.name),'Thin pools retain every closer-origin candidate: '+p.id);
      const boundary=Math.max(...wrong.map(q=>g.matchTier(p,q)));
      const tighter=eligible.filter(q=>g.matchTier(p,q)<boundary);
      for(const q of tighter)assert.ok(options.includes(q.name),'Do not sample away stronger origin matches');
      for(const selected of wrong.filter(q=>g.matchTier(p,q)===boundary))
        for(const omitted of eligible.filter(q=>g.matchTier(p,q)===boundary&&!options.includes(q.name)))
          assert.ok(g.rivalScore(p,omitted,competition)-g.rivalScore(p,selected,competition)<=3+1e-9,'No large quality drop for variety: '+p.id);
    }
  }
});

test('competition membership cannot outweigh origin; era matters when club similarity is equal',()=>{
  const messi=get('lionel-messi');
  const choices=g.optionsFor(messi,'hard',randomFor(4),'brasileirao');
  assert.ok(choices.filter(n=>n!==messi.name).every(n=>g.originFor(byName.get(n)).system==='spain'));
  assert.ok(choices.some(n=>n!==messi.name&&!byName.get(n).competitions.includes('brasileirao')),'Widen rivals rather than supply obvious wrong-origin names');
  // Test the pure era contribution rather than fabricating roster members.
  assert.ok(g.eraSimilarity(1976,1997,1978,1998)>g.eraSimilarity(1976,1997,2000,2020));
});

test('Hard does not randomly discard clearly stronger rivals within the same plausibility tier',()=>{
  const p=get('lionel-messi');
  const candidates=g.candidates||players;
  const tier=q=>g.matchTier?g.matchTier(p,q):g.originTier(p,q);
  const eligible=candidates.filter(q=>q.name!==p.name && (g.eligibleRivals?g.eligibleRivals(p).includes(q.name):p.incorrectOptions.includes(q.name)));
  for(let seed=1;seed<=200;seed++){
    const options=g.optionsFor(p,'hard',randomFor(seed),'la-liga');
    for(const selected of eligible.filter(q=>options.includes(q.name)))
      for(const omitted of eligible.filter(q=>!options.includes(q.name)&&tier(q)===tier(selected)))
        assert.ok(g.rivalScore(p,omitted,'la-liga')-g.rivalScore(p,selected,'la-liga')<=3+1e-9,omitted.name+' should not lose its place to '+selected.name);
  }
});

test('Maradona gets four researched Argentine contemporaries, not 1990s debutants',()=>{
  const p=get('diego-maradona'),candidates=g.candidates||players;
  const peers=new Set(['Daniel Bertoni','Jorge Valdano','Ramón Díaz','Osvaldo Ardiles']);
  for(let seed=1;seed<=500;seed++){
    const wrong=g.optionsFor(p,'hard',randomFor(seed),'la-liga').filter(n=>n!==p.name);
    // The 10-option format needs 9 distractors, but this exact-tier bank of
    // researched contemporaries only has four - so all four are always
    // included (the original regression this test guards against), and the
    // remaining slots widen to the next tier rather than ever admitting a
    // wrong-origin or era-mismatched "1990s debutant" giveaway.
    for(const peer of peers)assert.ok(wrong.includes(peer),`${peer} missing: ${wrong.join(', ')}`);
    assert.ok(wrong.every(n=>g.originFor(g.candidates.find(q=>q.name===n)).system==='argentina'),wrong.join(', '));
  }
  for(const n of peers){
    const q=candidates.find(q=>q.name===n);assert.ok(q,n);
    assert.ok(q.sources.length>=2,n+' needs sources');
    assert.ok(!players.some(p=>p.id===q.id),'Distractor bank must not silently expand playable decks');
  }
});

test('new matcher never rewrites published saved choices or partial progress',()=>{
  for(const filename of ['legacy-save.json','legacy-save-40.json','legacy-save-50.json','legacy-save-60.json']){
    const s=JSON.parse(fs.readFileSync(new URL(filename,import.meta.url),'utf8')),before=plain(s);
    assert.equal(g.validate(s),true);g.stats(s);assert.deepEqual(plain(s),before);
    g.answer(s,g.playerAt(s).name);const played=plain(s.rounds);g.next(s);
    assert.deepEqual(plain(s.rounds.slice(0,-1)),played);assert.equal(g.validate(s),true);
  }
});
