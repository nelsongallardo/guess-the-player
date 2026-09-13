import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),context=vm.createContext({});
for(const id of ['roster-data','game-model'])vm.runInContext(html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1],context);
const g=vm.runInContext('CareerGame',context);
const screenshot=['Zinedine Zidane','Paul Scholes','Thierry Henry','Eiður Guðjohnsen','Francesco Totti'];
const plain=x=>JSON.parse(JSON.stringify(x));
function savedHenry(){
 const s=g.create();s.deck=['thierry-henry',...s.deck.filter(id=>id!=='thierry-henry')];
 s.rounds=[{options:[...screenshot],guesses:[],hints:0,difficulty:'hard'}];
 assert.ok(g.validate(s));return s;
}
test('loading untouched Henry screenshot choices upgrades origin/era giveaways without losing progress',()=>{
 const s=savedHenry(),before=plain(s),stats=plain(g.stats(s));
 assert.equal(g.refreshUnstartedRivals(s),true);
 assert.deepEqual(plain(s.deck),before.deck);assert.deepEqual(plain(g.stats(s)),stats);
 assert.equal(s.roundIndex,before.roundIndex);assert.equal(s.competition,before.competition);
 // The legacy 5-name screenshot mismatch upgrades to today's 10-option
 // format (1 correct + 9 distractors). Henry has exactly four tight
 // same-timeline contemporaries and no origin-tier-1 candidates, so those
 // four are always present and the remaining five widen to the next tier -
 // not a fixed exact set, since near-boundary noise can vary which specific
 // names fill it.
 assert.equal(s.rounds[0].options.length,10);
 assert.ok(s.rounds[0].options.includes('Thierry Henry'));
 for(const name of ['Zinedine Zidane','Emmanuel Petit','Nicolas Anelka','Sylvain Wiltord'])assert.ok(s.rounds[0].options.includes(name),name);
 assert.deepEqual(plain(s.rounds[0].guesses),[]);assert.equal(s.rounds[0].hints,0);assert.ok(g.validate(s));
 const upgraded=plain(s);assert.equal(g.refreshUnstartedRivals(s),false);assert.deepEqual(plain(s),upgraded);
});
test('guessed, hinted and completed saved rounds remain byte-for-byte unchanged',()=>{
 for(const action of ['guess','hint','win','loss']){
  const s=savedHenry();
  if(action==='guess')g.answer(s,'Paul Scholes');
  if(action==='hint')g.hint(s);
  if(action==='win')g.answer(s,'Thierry Henry');
  if(action==='loss')for(const n of screenshot.filter(n=>n!=='Thierry Henry').slice(0,3))g.answer(s,n);
  const before=JSON.stringify(s);assert.equal(g.refreshUnstartedRivals(s),false,action);assert.equal(JSON.stringify(s),before,action);
 }
});
test('upgrading the current untouched round preserves earlier rounds and their earned points',()=>{
 const s=savedHenry();const prior=s.deck[1];s.deck=[prior,'thierry-henry',...s.deck.filter(id=>!['thierry-henry',prior].includes(id))];
 const p=g.playerAt(s);s.rounds=[{options:g.optionsFor(p),guesses:[p.name],hints:1,difficulty:'hard',points:73},s.rounds[0]];s.roundIndex=1;
 assert.ok(g.validate(s));const before=JSON.stringify(s.rounds[0]),stats=JSON.stringify(g.stats(s));
 assert.equal(g.refreshUnstartedRivals(s),true);assert.equal(JSON.stringify(s.rounds[0]),before);assert.equal(JSON.stringify(g.stats(s)),stats);
});
test('all fresh target rounds remain stable across repeated reload migration checks',()=>{
 for(const p of g.candidates.filter(p=>g.playersFor('all').some(q=>q.id===p.id))){
  const s=g.create();s.deck=[p.id,...s.deck.filter(id=>id!==p.id)];s.rounds=[{options:g.optionsFor(p),guesses:[],hints:0,difficulty:'hard'}];
  const before=JSON.stringify(s);assert.equal(g.refreshUnstartedRivals(s),false,p.name);assert.equal(JSON.stringify(s),before,p.name);
 }
});
