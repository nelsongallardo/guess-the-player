import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const context=vm.createContext({});
vm.runInContext(script('roster-data')+script('game-model'),context);
const {g,players}=vm.runInContext('({g:CareerGame,players:PLAYERS})',context);
const plain=x=>JSON.parse(JSON.stringify(x));
const bank=JSON.parse(fs.readFileSync(new URL('../research/verified-distractors.json',import.meta.url),'utf8'));

test('researched wrong-answer bank is embedded exactly, sourced and separate from playable careers',()=>{
  const embedded=JSON.parse(html.match(/const DISTRACTOR_PROFILES = ([\s\S]*?);\n  \/\/ END DISTRACTOR BANK/)[1]);
  assert.deepEqual(embedded,bank);
  assert.ok(bank.length>=31,'Promotions must retain the reviewed bank-only coverage cohort');
  assert.equal(g.candidates.length,players.length+bank.length);
  for(const key of ['id','name']) assert.equal(new Set(g.candidates.map(p=>p[key])).size,g.candidates.length,key);
  const roles=new Set(['Defender','Midfielder','Forward','Goalkeeper']);
  for(const p of bank){
    assert.match(p.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.start<=p.end,p.name);
    assert.ok(p.clubs.length>0&&p.clubs.every(c=>typeof c==='string'&&c.trim()),p.name);
    assert.ok(p.position.split(' / ').every(role=>roles.has(role)),p.name);
    assert.ok(p.sources.length>=2,p.name+' has corroborating sources');
    assert.ok(new Set(p.sources.map(s=>new URL(s.url).hostname.replace(/^www\./,''))).size>=2,p.name+' has independent domains');
    assert.ok(p.sources.every(s=>/^https?:\/\//.test(s.url)&&s.excerpt.length>20),p.name+' has retrieved excerpts');
    assert.ok(!players.some(q=>q.id===p.id||q.name===p.name));
  }
  for(const competition of ['all',...g.COMPETITION_IDS]){
    const s=g.create('hard',competition);
    assert.ok(s.deck.every(id=>players.some(p=>p.id===id)));
    assert.equal(s.deck.length,g.playersFor(competition).length);
    assert.equal(g.validate(s),true);
  }
});

test('every target has four same-system contemporaries; tight era tiers cannot be sampled away',()=>{
  const byName=new Map(g.candidates.map(p=>[p.name,p]));
  for(const p of players){
    const eligible=g.eligibleRivals(p).map(n=>byName.get(n));
    assert.ok(eligible.filter(q=>g.matchTier(p,q)===0).length>=4,p.name+' needs four researched same-system contemporaries');
    // The 10-option format needs 9 distractors: only when a player has that
    // many same-origin-system candidates is every wrong answer guaranteed
    // to stay in-system; thinner pools legitimately widen (checked below via
    // the tighter-tier-inclusion guarantee, still enforced at any pool size).
    const sameSystem=eligible.filter(q=>g.originTier(p,q)===0).length;
    for(let seed=1;seed<=40;seed++){
      let x=seed;const random=()=>{x=x*16807%2147483647;return(x-1)/2147483646;};
      const options=g.optionsFor(p,'hard',random);
      const selected=options.filter(n=>n!==p.name).map(n=>byName.get(n));
      if(sameSystem>=9)assert.ok(selected.every(q=>g.originTier(p,q)===0),p.name);
      const boundary=Math.max(...selected.map(q=>g.matchTier(p,q)));
      assert.ok(eligible.filter(q=>g.matchTier(p,q)<boundary).every(q=>options.includes(q.name)),p.name);
    }
  }
});

test('bank answers remain valid after guesses, hints, save reload and Next',()=>{
  const s=g.create('hard','all'),p=players.find(p=>p.id==='fernando-couto');
  s.deck=[p.id,...s.deck.filter(id=>id!==p.id)];
  s.rounds=[{options:g.optionsFor(p),guesses:[],hints:0,difficulty:'hard'}];
  // With 9 distractors now offered, pick specifically a bank-sourced wrong
  // answer (guaranteed present) rather than whichever happens to shuffle
  // first, since the remaining slots may legitimately include real players.
  const wrong=s.rounds[0].options.find(n=>n!==p.name&&bank.some(q=>q.name===n));
  assert.ok(bank.some(q=>q.name===wrong));
  assert.equal(g.answer(s,wrong),true);assert.equal(g.hint(s),true);
  const saved=plain(s);assert.equal(g.validate(saved),true);assert.deepEqual(saved,plain(s));
  assert.equal(g.answer(saved,p.name),true);assert.equal(g.stats(saved).score,80);
  const played=plain(saved.rounds[0]);assert.equal(g.next(saved),true);
  assert.deepEqual(plain(saved.rounds[0]),played);assert.equal(g.validate(saved),true);
  const forged=plain(saved);forged.rounds[0].options[0]='Invented Wikipedia Player';
  assert.equal(g.validate(forged),false);
  const fakeDeck=plain(saved);fakeDeck.deck[0]=bank[0].id;assert.equal(g.validate(fakeDeck),false);
});
