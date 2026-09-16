import './distractors.test.mjs';
import './distractor-bank.test.mjs';
import './saved-rivals.test.mjs';
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

test('exactly 210 explicit researched records: 105 Europe + 105 South America', () => {
  assert.equal(players.length,210);
  assert.equal(new Set(players.map(p=>p.name)).size,210);
  assert.equal(new Set(players.map(p=>p.id)).size,210);
  for (const continent of ['Europe','South America']) assert.equal(players.filter(p=>p.continent===continent).length,105);
  const frozen=JSON.parse(fs.readFileSync(new URL('../research/verified-players.json', import.meta.url),'utf8'));
  assert.deepEqual(plain(players.map(({clubCrests,incorrectOptions,...p})=>p)),frozen);
  const nationalNames=new Set(players.map(p=>p.country));
  for(const p of players){
    assert.ok(['2026-09-11','2026-09-12','2026-09-14','2026-09-15','2026-09-16'].includes(p.verifiedAt)); assert.ok(p.country && p.position && p.clubs.length);
    assert.ok(p.sources.length>=2); assert.equal(p.clubs.length,p.clubCrests.length);
    assert.ok(p.sources.every(s=>/^https?:\/\//.test(s.url)));
    assert.ok(p.clubs.every(c=>c.name && c.years && !nationalNames.has(c.name)));
    assert.ok(p.incorrectOptions.length>=4); assert.ok(!p.incorrectOptions.includes(p.name));
  }
});

test('every player carries only recognized competition tags; truthful all-only careers stay untagged', () => {
  const known=new Set(g.COMPETITION_IDS);
  for(const p of players){
    assert.ok(Array.isArray(p.competitions), p.name);
    assert.ok(p.competitions.every(c=>known.has(c)), p.name);
    assert.equal(new Set(p.competitions).size, p.competitions.length, p.name);
  }
  const allOnly=players.filter(p=>p.competitions.length===0);
  assert.deepEqual(plain(allOnly.map(p=>p.id)),['carlos-lobaton']);
  assert.ok(g.playersFor('all').some(p=>p.id==='carlos-lobaton'));
  for(const competition of g.COMPETITION_IDS) assert.ok(!g.playersFor(competition).some(p=>p.id==='carlos-lobaton'));
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

test('210,000 option samples always contain ten unique names and exactly one correct answer',()=>{
  for(const p of players){
    const orders=new Set();
    for(let i=0;i<1000;i++){
      const names=g.optionsFor(p);
      assert.equal(names.length,10); assert.equal(new Set(names).size,10);
      assert.equal(names.filter(n=>n===p.name).length,1);
      assert.ok(names.every(n=>n===p.name || g.eligibleRivals(p).includes(n)));
      // Identical badge paths (e.g. Scholes/Giggs) are never simultaneous answers.
      for(const n of names.filter(n=>n!==p.name)) assert.notEqual(JSON.stringify(g.candidates.find(o=>o.name===n).clubs.map(c=>c.name)),JSON.stringify(p.clubs.map(c=>c.name)));
      orders.add(names.join('|'));
    }
    assert.ok(orders.size>100);
  }
});

test('all 210 rounds: first/second/third-attempt wins, losses, score, streak and recap',()=>{
  const s=g.create(); let wins=0,streak=0,best=0;
  for(let i=0;i<210;i++){
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
  assert.equal(s.finished,true);assert.equal(new Set(s.deck).size,210);assert.equal(g.validate(s),true);
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

test('hints reveal country, position, then club years (3 max), cost no attempts',()=>{
  const s=g.create(),p=g.playerAt(s);
  assert.deepEqual(plain(g.hintValues(p)),[p.country,p.position]);
  for(let i=1;i<=3;i++){assert.equal(g.hint(s),true);assert.equal(g.roundAt(s).hints,i);}
  assert.equal(g.hint(s),false,'Capped at 3 - initials was removed, too obvious alongside 5 visible options');
  assert.equal(g.roundAt(s).guesses.length,0);assert.equal(g.stats(s).score,0);
  // initials() itself is still a correct, tested utility even though hints no longer use it.
  assert.equal(g.initials('Lionel Messi'),'L. M.');assert.equal(g.initials('Pelé'),'P.');assert.equal(g.initials('  Andrés   Iniesta '),'A. I.');
});

test('scoring rewards speed and no-hint answers, floors gracefully, and is stable across reload', () => {
  // Pure function: hints cap the ceiling (regardless of speed), elapsed time
  // decays a round's value between a 2s grace window and a 24s floor (25%) -
  // doubled from an original 12s once real players found that too tight to
  // actually read a 10-option career, while staying short enough that
  // looking an answer up elsewhere can't out-score a fast, honest guess.
  // See docs/adr/0001-local-results-history-and-speed-based-scoring.md.
  assert.equal(g.pointsFor(0, 0), 100); assert.equal(g.pointsFor(0, 1999), 100); assert.equal(g.pointsFor(0, 2000), 100);
  // 3 hints are offerable in the UI (country, position, years - see hint()'s
  // cap), and pointsFor clamps a stray/legacy hints=4 to the same value as 3,
  // rather than over-penalizing it.
  assert.equal(g.pointsFor(1, 0), 80); assert.equal(g.pointsFor(2, 0), 60); assert.equal(g.pointsFor(3, 0), 40); assert.equal(g.pointsFor(4, 0), 40);
  assert.equal(g.pointsFor(0, 24000), 25); assert.equal(g.pointsFor(0, 50000), 25); // floor reached by 24s and holds beyond
  assert.equal(g.pointsFor(0, 13000), 63); // interpolates halfway between the grace window and the floor
  assert.equal(g.pointsFor(3, 24000), 10); // hint cap and time floor combine, never reaching zero
  assert.equal(g.pointsFor(4, 24000), 10); // hints=4 clamps to the same value as 3
  assert.ok(g.pointsFor(0, -50) === 100, 'negative elapsed (clock skew) never breaks or exceeds the ceiling');
  // timeFactor is exported alongside pointsFor for the #speed-meter UI (game-ui), which
  // needs the raw 0..1 decay curve directly rather than a hint-priced point total.
  assert.equal(g.timeFactor(0), 1); assert.equal(g.timeFactor(2000), 1); assert.equal(g.timeFactor(24000), 0.25); assert.equal(g.timeFactor(99999), 0.25);
  assert.equal(g.pointsFor(0, 13000), Math.round(100 * g.timeFactor(13000)), 'pointsFor(0, x) is exactly 100 x timeFactor(x), rounded');
  // answer() takes elapsedMs from the caller (the UI owns the per-round
  // clock) so the model itself has no wall-clock dependency and stays
  // trivial to test; omitting it (as every other test in this file does)
  // defaults to 0 elapsed, i.e. full marks when no hints were used.
  const fast=g.create(); assert.equal(g.answer(fast,g.playerAt(fast).name,50),true); assert.equal(g.roundAt(fast).points,100);
  const slow=g.create(); assert.equal(g.answer(slow,g.playerAt(slow).name,30000),true); assert.equal(g.roundAt(slow).points,25); // already past the 24s floor, so it earns the floor, not zero
  const hinted=g.create(); g.hint(hinted); g.hint(hinted); assert.equal(g.answer(hinted,g.playerAt(hinted).name,0),true); assert.equal(g.roundAt(hinted).points,60);
  assert.equal(g.stats(hinted).score,60);
  // A wrong guess never sets points, and a stored points value survives a
  // save/reload round-trip (validate() bounds-checks it but never strips it).
  const missed=g.create(); g.answer(missed,wrong(missed)[0],99999); assert.equal(g.roundAt(missed).points,undefined);
  assert.equal(g.validate(clone(hinted)),true);
  const roundTripped=clone(hinted); assert.equal(roundTripped.rounds[0].points,60); assert.equal(g.stats(roundTripped).score,60);
  // Legacy rounds recorded before scoring existed have no points field at all
  // and must keep scoring as a flat 100 per win, unchanged from before.
  const legacyRound={options:hinted.rounds[0].options,guesses:hinted.rounds[0].guesses,hints:2,difficulty:'medium'};
  const legacyState={...clone(hinted),rounds:[legacyRound]};
  assert.equal(g.validate(legacyState),true); assert.equal(g.stats(legacyState).score,100);
  // Bounds are enforced: an out-of-range or non-integer points value is invalid.
  assert.equal(g.validate({...clone(hinted),rounds:[{...clone(hinted).rounds[0],points:101}]}),false);
  assert.equal(g.validate({...clone(hinted),rounds:[{...clone(hinted).rounds[0],points:-1}]}),false);
  assert.equal(g.validate({...clone(hinted),rounds:[{...clone(hinted).rounds[0],points:50.5}]}),false);
});

test('persistence accepts every legitimate state and rejects malformed or impossible saves',()=>{
  const good=g.create();assert.equal(g.validate(clone(good)),true);
  for(const bad of [null,{},42,'x',[],{...clone(good),finished:'true'},{...clone(good),version:2},{...clone(good),roundIndex:100},{...clone(good),roundIndex:-1},{...clone(good),roundIndex:.5},{...clone(good),finished:true}])assert.equal(g.validate(bad),false);
  const mutations=[s=>s.deck[1]=s.deck[0],s=>s.deck[0]='unknown',s=>s.rounds[0].options.pop(),s=>s.rounds[0].options[0]='unknown',s=>s.rounds[0].options.fill(g.playerAt(s).name),s=>s.rounds[0].hints=4,s=>s.rounds[0].hints=-1,s=>s.rounds[0].hints='1',s=>s.rounds[0].guesses=['unknown'],s=>s.rounds[0].guesses=[wrong(s)[0],wrong(s)[0]],s=>s.rounds[0].guesses=[g.playerAt(s).name,wrong(s)[0]],s=>s.rounds[0].guesses=wrong(s),s=>{s.roundIndex=1;s.rounds.push(clone(s.rounds[0]));},s=>{s.deck=[];s.rounds=[];}];
  for(const change of mutations){const s=clone(good);change(s);assert.equal(g.validate(s),false,String(change));}
  // A deck missing a player the "seen" ledger has already excluded is a
  // legitimate, smaller-than-full deck now, not corruption - see ADR 0005.
  const shrunk=clone(good);shrunk.deck.pop();shrunk.rounds=[shrunk.rounds[0]];
  assert.equal(g.validate(shrunk),true,'A deck missing an already-seen player validates fine');
  for(let i=0;i<100;i++){g.answer(good,g.playerAt(good).name);assert.equal(g.validate(clone(good)),true);g.next(good);assert.equal(g.validate(clone(good)),true);}
  assert.equal(g.stats(good).score,10000);assert.equal(g.stats(good).streak,100);
});

test('shuffle does not mutate inputs and decks never repeat a player',()=>{
  const original=[1,2,3,4,5];g.shuffle(original);assert.deepEqual(original,[1,2,3,4,5]);
  const starts=new Set();for(let i=0;i<200;i++){const s=g.create();assert.equal(new Set(s.deck).size,210);starts.add(s.deck[0]);assert.equal(g.validate(s),true);}
  assert.ok(starts.size>10);
});

test('re-audit corrections: Swansea calendar year, signing evidence and unchanged Zanetti clubs',()=>{
  const lampard=players.find(p=>p.id==='frank-lampard');
  assert.equal(lampard.clubs[0].years,'1995');
  const ronaldinho=players.find(p=>p.id==='ronaldinho');
  assert.equal(ronaldinho.status,'signing-announced');
  assert.equal(ronaldinho.clubs.at(-1).years,'2026');
  assert.ok(ronaldinho.clubs.at(-1).note.includes('Completed federation registration and competitive debut not established'));
  assert.deepEqual(plain(players.find(p=>p.id==='javier-zanetti').clubs.map(c=>c.name)),['Talleres de Remedios de Escalada','Banfield','Inter Milan']);
  assert.ok(players.find(p=>p.id==='neymar').clubs[3].note.includes('4 November 2024'));
});

test('legacy easy/medium helpers preserve five eligible, distinct, shuffled answers; live Hard shows ten',()=>{
  // easy/medium stay at their original 5 (1 + 4) as internal fixture/testing
  // helpers, not a live gameplay path; hard - the only mode the UI plays -
  // shows 10 (1 + 9), the live 2026 option-count product decision.
  for(const p of players)for(const level of ['easy','medium','hard']){
    const expected=level==='hard'?10:5;
    const orders=new Set();
    for(let seed=1;seed<=100;seed++){
      let x=seed;const random=()=>{x=x*16807%2147483647;return (x-1)/2147483646;};
      const options=g.optionsFor(p,level,random);orders.add(options.join('|'));
      assert.equal(options.length,expected);assert.equal(new Set(options).size,expected);assert.equal(options.filter(n=>n===p.name).length,1);
      assert.ok(options.every(n=>n===p.name||g.eligibleRivals(p).includes(n)));
    }
    assert.ok(orders.size>10,'Answer positions remain randomized');
  }
});

test('difficulty changes preserve progress and never reshuffle a started round',()=>{
  const s=g.create();assert.equal(s.difficulty,'hard');assert.equal(g.roundAt(s).difficulty,'hard');
  assert.equal(g.setDifficulty(s,'hard'),true);assert.equal(g.roundAt(s).difficulty,'hard');
  assert.equal(g.setDifficulty(s,'bogus'),false);
  const deck=plain(s.deck);g.hint(s);const started=plain(g.roundAt(s));
  g.setDifficulty(s,'easy');assert.deepEqual(plain(g.roundAt(s)),started);assert.deepEqual(plain(s.deck),deck);
  assert.equal(s.difficulty,'easy');g.answer(s,g.playerAt(s).name);g.next(s);
  assert.equal(g.roundAt(s).difficulty,'easy');assert.equal(g.stats(s).score,80);assert.equal(g.validate(clone(s)),true);
  const legacy=clone(s);delete legacy.difficulty;legacy.rounds.forEach(r=>delete r.difficulty);
  assert.equal(g.validate(legacy),true,'Existing progress remains loadable');
  assert.equal(g.validate({...clone(s),difficulty:'bogus'}),false);
  const invalid=clone(s);invalid.rounds[0].difficulty='bogus';assert.equal(g.validate(invalid),false);
  for(const level of ['easy','medium','hard']){
    const game=g.create(level);
    for(let i=0;i<210;i++){assert.equal(g.roundAt(game).difficulty,level);g.answer(game,g.playerAt(game).name);g.next(game);assert.equal(g.validate(clone(game)),true);}
    assert.equal(game.finished,true);assert.equal(g.stats(game).score,21000);
  }
});

test('published 30-player saves survive roster expansion and finish their original deck',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('./legacy-save.json',import.meta.url),'utf8'));
  const original=clone(saved);assert.equal(saved.deck.length,30);assert.equal(g.validate(saved),true);
  assert.equal(g.stats(saved).score,500);assert.deepEqual(saved,original);
  for(let i=saved.roundIndex;i<30;i++){g.answer(saved,g.playerAt(saved).name);g.next(saved);assert.equal(g.validate(saved),true);}
  // The in-progress round already carried 1 hint when saved, so its win is
  // scored at the reduced 80 (100 * 0.8 hint multiplier) instead of 100.
  assert.equal(saved.finished,true);assert.equal(g.stats(saved).score,2980);
  const fresh=g.create(saved.difficulty);assert.equal(fresh.deck.length,210);assert.equal(fresh.difficulty,'hard');
  assert.ok(fresh.deck.includes('fabricio-coloccini'));assert.ok(fresh.deck.includes('juan-pablo-sorin'));
});

test('published 40-player saves preserve guesses, hints and order through expansion',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('./legacy-save-40.json',import.meta.url),'utf8'));
  const original=clone(saved);
  assert.equal(saved.deck.length,40);assert.equal(g.validate(saved),true);
  assert.equal(g.stats(saved).score,500);assert.equal(g.roundAt(saved).hints,1);assert.equal(g.roundAt(saved).guesses.length,1);
  assert.deepEqual(saved,original);
  for(let i=saved.roundIndex;i<saved.deck.length;i++){g.answer(saved,g.playerAt(saved).name);g.next(saved);assert.equal(g.validate(saved),true);}
  // The in-progress round already carried 1 hint when saved, so its win is
  // scored at the reduced 80 (100 * 0.8 hint multiplier) instead of 100.
  assert.equal(saved.finished,true);assert.equal(g.stats(saved).score,3980);
  const fresh=g.create(saved.difficulty);assert.equal(fresh.deck.length,210);assert.equal(fresh.difficulty,'hard');
  const additions=players.filter(p=>!original.deck.includes(p.id));assert.equal(additions.length,170);
  assert.ok(additions.some(p=>p.id==='javier-saviola'));assert.ok(additions.some(p=>p.id==='claudio-pizarro'));
});

test('published 50-player saves finish their original deck after the third expansion',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('./legacy-save-50.json',import.meta.url),'utf8'));
  const original=clone(saved);
  assert.equal(saved.deck.length,50);assert.equal(g.validate(saved),true);
  assert.equal(g.stats(saved).score,500);assert.equal(g.roundAt(saved).hints,1);assert.equal(g.roundAt(saved).guesses.length,1);
  assert.deepEqual(saved,original);
  for(let i=saved.roundIndex;i<saved.deck.length;i++){g.answer(saved,g.playerAt(saved).name);g.next(saved);assert.equal(g.validate(saved),true);}
  // Same reduced first-round score as the 40-player case (1 hint already used).
  assert.equal(saved.finished,true);assert.equal(g.stats(saved).score,4980);
  const fresh=g.create(saved.difficulty);assert.equal(fresh.deck.length,210);assert.equal(fresh.difficulty,'hard');
  const additions=players.filter(p=>!original.deck.includes(p.id));assert.equal(additions.length,160);
  assert.ok(additions.some(p=>p.id==='rivaldo'));assert.ok(additions.some(p=>p.id==='diego-maradona'));
});

test('published 160-player saves preserve their engaged round and finish before a 210-player replay',()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('./legacy-save-160.json',import.meta.url),'utf8'));
  const original=clone(saved);
  assert.equal(saved.deck.length,160);assert.equal(g.validate(saved),true);
  assert.equal(g.stats(saved).score,500);assert.equal(g.roundAt(saved).hints,1);assert.equal(g.roundAt(saved).guesses.length,1);
  assert.deepEqual(saved,original);
  for(let i=saved.roundIndex;i<saved.deck.length;i++){g.answer(saved,g.playerAt(saved).name);g.next(saved);assert.equal(g.validate(saved),true);}
  assert.equal(saved.finished,true);assert.equal(g.stats(saved).score,15980);
  const fresh=g.create(saved.difficulty);assert.equal(fresh.deck.length,210);assert.equal(fresh.difficulty,'hard');
  const additions=players.filter(p=>!original.deck.includes(p.id));assert.equal(additions.length,50);
  assert.ok(additions.some(p=>p.id==='gheorghe-hagi'));assert.ok(additions.some(p=>p.id==='alex'));
});

test('create(difficulty, competitionId) restricts the deck to that competition, with a safe fallback for unknown ids',()=>{
  for(const id of g.COMPETITION_IDS){
    const pool=g.playersFor(id);
    assert.ok(pool.length>=4,id);
    const s=g.create('medium',id);
    assert.equal(s.competition,id);assert.equal(s.deck.length,pool.length);
    assert.equal(new Set(s.deck).size,pool.length);
    assert.ok(s.deck.every(pid=>players.find(p=>p.id===pid).competitions.includes(id)));
    assert.equal(g.validate(s),true);
  }
  const all=g.create('medium','all');assert.equal(all.competition,'all');assert.equal(all.deck.length,210);
  const bogus=g.create('medium','not-a-real-competition');assert.equal(bogus.competition,'all');assert.equal(bogus.deck.length,210);
  const omitted=g.create('medium');assert.equal(omitted.competition,'all');assert.equal(omitted.deck.length,210);
});

test('legacy Easy helper scopes rivals by competition and falls back when the pool is too thin',()=>{
  const messi=players.find(p=>p.id==='lionel-messi');
  for(let i=0;i<200;i++){
    const options=g.optionsFor(messi,'easy',Math.random,'brasileirao');
    const wrongOnes=options.filter(n=>n!==messi.name);
    assert.equal(wrongOnes.length,4);
    assert.ok(wrongOnes.every(n=>players.find(p=>p.name===n).competitions.includes('brasileirao')),'Brasileirão pool is large enough to stay scoped');
  }
  // A round whose scoped candidates would number fewer than four must fall back to the full pool rather than break.
  // (No real 60-player competition is this thin, so exercise the fallback directly with a synthetic candidate pool.)
  const fourNonBrasil=players.filter(p=>!p.competitions.includes('brasileirao')).slice(0,4).map(p=>p.name);
  const synthetic={name:'Synthetic Player',incorrectOptions:fourNonBrasil};
  const fallback=g.optionsFor(synthetic,'easy',Math.random,'brasileirao');
  assert.equal(fallback.length,5);assert.equal(new Set(fallback).size,5);
  assert.deepEqual(new Set(fallback.filter(n=>n!==synthetic.name)),new Set(fourNonBrasil),'Fewer than four scoped candidates falls back to the full pool');
  // No competition (or 'all') keeps today's unrestricted pool.
  const unrestricted=g.optionsFor(messi,'medium',Math.random,'all');
  assert.equal(unrestricted.filter(n=>n!==messi.name).length,4);
});

test('validate() treats a missing competition as \'all\' and rejects an impossible competition/deck combination',()=>{
  const legacy=g.create();delete legacy.competition;
  assert.equal(g.validate(legacy),true,'Missing competition field defaults to all');
  const scoped=g.create('medium','argentine-primera');
  assert.equal(g.validate(scoped),true);
  // The "seen" ledger legitimately shrinks a competition-scoped deck too
  // (ADR 0005); the old exact-length requirement is gone, only the upper
  // bound (can never exceed the competition's total pool) still applies.
  const shrunkScoped=clone(scoped);shrunkScoped.deck.pop();shrunkScoped.rounds=[shrunkScoped.rounds[0]];
  assert.equal(g.validate(shrunkScoped),true,'A smaller-than-full competition deck is valid');
  const emptyScoped=clone(scoped);emptyScoped.deck=[];emptyScoped.rounds=[];
  assert.equal(g.validate(emptyScoped),false,'An empty deck is still impossible');
  const created=g.create('medium','argentine-primera',new Set([g.playersFor('argentine-primera')[0].id]));
  assert.equal(created.deck.length,g.playersFor('argentine-primera').length-1,'create() with excludeIds removes exactly the excluded player');
  assert.equal(g.validate(created),true);
  assert.throws(()=>g.create('medium','argentine-primera',new Set(g.playersFor('argentine-primera').map(p=>p.id))),/No unseen players left/,'create() refuses to build an empty deck');
  const foreignPlayer=clone(scoped);
  const outsider=players.find(p=>!p.competitions.includes('argentine-primera'));
  foreignPlayer.deck[foreignPlayer.deck.length-1]=outsider.id;
  assert.equal(new Set(foreignPlayer.deck).size,foreignPlayer.deck.length,'test fixture must keep unique ids');
  assert.equal(g.validate(foreignPlayer),false,'Every deck id must carry the stated competition tag');
  const unknownCompetition={...clone(scoped),competition:'not-a-real-competition'};
  assert.equal(g.validate(unknownCompetition),false);
});

const localeContext=vm.createContext({});
vm.runInContext(script('locale-data')+script('game-ui').split('function detectLanguage()')[0],localeContext);
const localization=vm.runInContext('({COPY,COUNTRIES_ES,POSITIONS_ES,SPANISH_NOTES})',localeContext);

test('Spanish copy, all 210 career notes and every country/position are translated',()=>{
  const {COPY,COUNTRIES_ES,POSITIONS_ES,SPANISH_NOTES}=localization;
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.es).sort());
  for(const key of Object.keys(COPY.en))assert.equal(typeof COPY.en[key],typeof COPY.es[key],key);
  assert.equal(Object.keys(SPANISH_NOTES).length,210);
  for(const p of players){
    assert.ok(COUNTRIES_ES[p.country]&&POSITIONS_ES[p.position],p.name);
    const note=SPANISH_NOTES[p.id];assert.ok(note.notes&&note.notes!==p.notes);
    assert.equal(note.clubNotes.length,p.clubs.length);
    p.clubs.forEach((c,i)=>{assert.equal(Boolean(note.clubNotes[i]),Boolean(c.note));if(c.note)assert.notEqual(note.clubNotes[i],c.note);});
  }
  assert.ok(COPY.en.rules.includes('youth teams, national teams and coaching jobs are excluded'));
  assert.ok(COPY.es.rules.includes('se excluyen juveniles, selecciones y etapas como entrenador'));
  // The rules dialog and footer both describe the current 210-player roster.
  for(const lang of ['en','es']){assert.ok(COPY[lang].footer.includes('210 '));assert.ok(COPY[lang].footer.includes('105 '));assert.ok(COPY[lang].rules.includes('210 '));}
  assert.equal(COPY.es.question,'¿Quién es este jugador?');
  assert.equal(COPY.es.attempts(1),'Queda 1 intento');
  assert.equal(COPY.es.hints.join('|'),'País|Posición|Años');
  for(const lang of ['en','es']){
    for(const id of ['all',...g.COMPETITION_IDS])assert.ok(COPY[lang].competitions[id],`${lang}.competitions.${id}`);
  }
});

test('loan labels describe the actual spell, not incidental or negated loan mentions',()=>{
  vm.runInContext('const copy=()=>COPY.en;'+script('game-ui').match(/function tagFor\(club\)\{[\s\S]*?\n\}/)[0],localeContext);
  const tag=vm.runInContext('tagFor',localeContext);
  const negative=[
    ['juan-sebastian-veron','Chelsea'],['frank-lampard','Manchester City'],
    ['frank-lampard','West Ham United'],['juan-roman-riquelme','Barcelona'],
    ['zlatan-ibrahimovic','Barcelona'],['kaka','Orlando City'],
  ];
  for(const [id,name] of negative)assert.notEqual(tag(players.find(p=>p.id===id).clubs.find(c=>c.name===name)),'Loan spell',id+' '+name);
  const neymar=players.find(p=>p.id==='neymar');assert.equal(tag(neymar.clubs.at(-1)),'Return');
  assert.equal(tag(players.find(p=>p.id==='juan-sebastian-veron').clubs.find(c=>c.name==='Inter Milan')),'Loan spell');
  assert.equal(tag(players.find(p=>p.id==='roberto-carlos').clubs.find(c=>c.name==='Atlético Mineiro')),'Tour loan');
  assert.equal(tag(players.find(p=>p.id==='ronaldinho').clubs.at(-1)),'Signing*');
});
