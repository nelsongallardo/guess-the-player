import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const context=vm.createContext({});vm.runInContext(script('roster-data')+script('game-model'),context);
const {g,players}=vm.runInContext('({g:CareerGame,players:PLAYERS})',context);
const byName=new Map(players.map(p=>[p.name,p]));
const get=id=>players.find(p=>p.id===id);
const randomFor=seed=>()=>{seed=seed*16807%2147483647;return (seed-1)/2147483646;};
const plain=value=>JSON.parse(JSON.stringify(value));
const argentinaStarts=new Set(['Argentinos Juniors','Boca Juniors','Independiente','Newell\'s Old Boys','River Plate','Estudiantes','Racing Club','Talleres de Remedios de Escalada']);

test('Maradona in La Liga never gets rivals who began outside Argentine senior football',()=>{
  const p=get('diego-maradona'),seen=new Set();
  for(let seed=1;seed<=500;seed++){
    const options=g.optionsFor(p,'hard',randomFor(seed),'la-liga');
    for(const name of options.filter(n=>n!==p.name)){
      seen.add(name);assert.ok(argentinaStarts.has(byName.get(name).clubs[0].name),`${name} is an obvious wrong-origin giveaway`);
    }
  }
  assert.ok(seen.size>4,'Plausible alternatives still vary');
});

test('career origin comes from the first senior club, not nationality or selected competition',()=>{
  assert.equal(g.originFor(get('lionel-messi')).system,'spain');
  assert.equal(g.originFor(get('esteban-cambiasso')).system,'spain');
  assert.equal(g.originFor(get('robbie-keane')).system,'england');
  assert.equal(g.originFor(get('ryan-giggs')).system,'england');
  assert.equal(g.originFor(get('frank-lampard')).system,'england','Swansea belongs to the English league system');
  assert.equal(g.originFor(get('thierry-henry')).system,'france','Monaco belongs to the French league system');
  for(const p of players){assert.ok(g.originFor(p).system,p.id);assert.ok(['europe','south-america'].includes(g.originFor(p).region),p.id);}
});

test('all Hard pools preserve the strongest origin tier and use only ranked boundary rivals',()=>{
  for(const p of players)for(const competition of ['all',...g.COMPETITION_IDS]){
    const eligible=p.incorrectOptions.map(n=>byName.get(n));
    const same=eligible.filter(q=>g.originFor(q).system===g.originFor(p).system);
    for(let seed=1;seed<=30;seed++){
      const options=g.optionsFor(p,'hard',randomFor(seed),competition),wrong=options.filter(n=>n!==p.name).map(n=>byName.get(n));
      assert.equal(options.length,5);assert.equal(new Set(options).size,5);assert.equal(options.filter(n=>n===p.name).length,1);
      if(same.length>=4)assert.ok(wrong.every(q=>g.originFor(q).system===g.originFor(p).system),p.id+' / '+competition);
      else for(const q of same)assert.ok(options.includes(q.name),'Thin pools retain every closer-origin candidate: '+p.id);
      const boundary=Math.max(...wrong.map(q=>g.originTier(p,q)));
      const tighter=eligible.filter(q=>g.originTier(p,q)<boundary);
      for(const q of tighter)assert.ok(options.includes(q.name),'Do not sample away stronger origin matches');
      const ranked=eligible.filter(q=>g.originTier(p,q)===boundary).map(q=>g.rivalScore(p,q,competition)).sort((a,b)=>b-a);
      const cutoff=ranked[Math.min(8-tighter.length,ranked.length)-1];
      assert.ok(wrong.filter(q=>g.originTier(p,q)===boundary).every(q=>g.rivalScore(p,q,competition)>=cutoff));
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

test('new matcher never rewrites published saved choices or partial progress',()=>{
  for(const filename of ['legacy-save.json','legacy-save-40.json','legacy-save-50.json']){
    const s=JSON.parse(fs.readFileSync(new URL(filename,import.meta.url),'utf8')),before=plain(s);
    assert.equal(g.validate(s),true);g.stats(s);assert.deepEqual(plain(s),before);
    g.answer(s,g.playerAt(s).name);const played=plain(s.rounds);g.next(s);
    assert.deepEqual(plain(s.rounds.slice(0,-1)),played);assert.equal(g.validate(s),true);
  }
});
