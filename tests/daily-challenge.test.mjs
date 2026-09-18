import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];
const plain=value=>JSON.parse(JSON.stringify(value));
const digest=value=>'sha256-'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
function memoryStorage(seed={},denied=false){
  const values=new Map(Object.entries(seed));
  return {values,getItem:key=>values.get(key)??null,setItem(key,value){if(denied)throw new Error('denied');values.set(key,String(value));},removeItem:key=>values.delete(key)};
}
function loadDaily(){
  const source=block('daily-challenge');
  assert.ok(source,'daily-challenge module exists');
  const context=vm.createContext({structuredClone,Date,JSON,Map,Set,URL});
  vm.runInContext(source+'\nglobalThis.daily=DailyChallenge;globalThis.schedule=DAILY_SCHEDULE_V1;globalThis.payloads=DAILY_PAYLOAD_V1;',context);
  return {api:context.daily,schedule:plain(context.schedule),payloads:plain(context.payloads)};
}

function finishRound(persistence,attempt,won=true){
  const round=attempt.game.rounds[attempt.game.roundIndex];
  const answer=attempt.game.deck[attempt.game.roundIndex];
  if(won)assert.equal(persistence.guess(answer),true);
  else for(const wrong of round.options.filter(id=>id!==answer).slice(0,3))assert.equal(persistence.guess(wrong),true);
}

test('v2 challenge deterministically groups three consecutive frozen v1 descriptors',()=>{
  const {api,schedule,payloads}=loadDaily();
  assert.equal(api.forDate('2026-09-16'),null);
  assert.equal(api.forDate('2026-09-17').challengeNumber,1);
  assert.equal(api.forDate('2026-09-18').challengeNumber,2);
  assert.equal(schedule.length,220);
  assert.equal(Object.keys(payloads).length,220);
  assert.equal(new Set(schedule.map(item=>item.playerId)).size,220);
  const cases=[['2026-09-17',0],['2026-09-18',3],['2026-11-29',219],['2026-11-30',2]];
  for(const [date,start] of cases){
    const challenge=api.forDate(date);
    const expected=[0,1,2].map(offset=>schedule[(start+offset)%220]);
    assert.deepEqual(plain(challenge.playerIds),expected.map(item=>item.playerId));
    assert.deepEqual(plain(challenge.payloadDigests),expected.map(item=>item.payloadDigest));
    assert.deepEqual(plain(challenge.optionIds),expected.map(item=>item.optionIds));
    assert.deepEqual(plain(challenge.payloads),expected.map(item=>payloads[item.payloadId]));
    assert.ok(Object.isFrozen(challenge));
    assert.ok(Object.isFrozen(challenge.playerIds));
    assert.ok(Object.isFrozen(challenge.payloads));
  }
  for(const descriptor of schedule){
    const payload=payloads[descriptor.payloadId];
    assert.equal(descriptor.payloadDigest,digest(payload));
    assert.deepEqual(descriptor.optionIds,payload.options.map(option=>option.id));
  }
  assert.equal(api.scheduleDigest,'sha256-0a26b1011e275301f9d77e7068afd1c3d234dc6f95c4ff6588b4bfff61c21bcc');
  assert.doesNotMatch(block('daily-challenge'),/\b(?:PLAYERS|eligibleRivals|CareerGame)\b/);
});

test('empty storage creates a strict three-round v2 attempt and cleanly resets shipped v1 documents',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  const persistence=api.createPersistence(storage,{now:()=>Date.parse('2026-09-17T12:00:00Z')});
  const attempt=persistence.today(),document=persistence.read(),descriptor=api.forDate('2026-09-17');
  assert.deepEqual([...storage.values.keys()],['derabona.daily.v1']);
  assert.equal(document.schemaVersion,2);
  assert.equal(document.scheduleVersion,2);
  assert.deepEqual(attempt.playerSnapshotIds,plain(descriptor.playerIds));
  assert.deepEqual(attempt.options,plain(descriptor.payloads.map(payload=>payload.options)));
  assert.deepEqual(attempt.game.deck,plain(descriptor.playerIds));
  assert.equal(attempt.game.version,2);
  assert.equal(attempt.game.roundIndex,0);
  assert.equal(attempt.game.rounds.length,3);
  assert.equal(attempt.game.finished,false);
  for(let index=0;index<3;index++)assert.deepEqual(attempt.game.rounds[index],plain({options:descriptor.optionIds[index],guesses:[],hints:0,status:'playing',points:null,startedAt:null,completedAt:null}));
  assert.equal(attempt.completion,null);

  const v1={schemaVersion:1,scheduleVersion:1,attempts:{legacy:{anything:true}},completionHistory:[{date:'2026-09-16'}],stats:{currentStreak:99,bestStreak:99,lastCompletedDate:'2026-09-16'}};
  const resetStorage=memoryStorage({'derabona.daily.v1':JSON.stringify(v1)});
  const reset=api.createPersistence(resetStorage,{now:()=>Date.parse('2026-09-17T12:00:00Z')});
  assert.equal(reset.read().schemaVersion,2);
  assert.deepEqual(Object.keys(reset.read().attempts),[],'v1 is deliberately reset rather than guessed at or partially migrated');
  assert.deepEqual(reset.read().completionHistory,[]);
  assert.equal(reset.today().game.rounds.length,3);
});

test('rounds play sequentially and complete the UTC attempt only after player three',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  const persistence=api.createPersistence(storage,{now:()=>time});
  let attempt=persistence.today();
  time+=1000;assert.equal(persistence.start(),true);
  time+=1000;assert.equal(persistence.hint(),true);
  time+=1000;finishRound(persistence,attempt,true);
  attempt=persistence.today();
  assert.equal(attempt.game.roundIndex,0);
  assert.equal(attempt.game.rounds[0].points,80);
  assert.equal(attempt.completion,null);
  assert.deepEqual(persistence.read().stats,{currentStreak:0,bestStreak:0,lastCompletedDate:null});
  assert.equal(persistence.next(),true);

  attempt=persistence.today();
  assert.equal(attempt.game.roundIndex,1);
  assert.equal(attempt.game.rounds[1].startedAt,null);
  time+=1000;finishRound(persistence,attempt,false);
  assert.equal(persistence.today().completion,null);
  assert.equal(persistence.next(),true);

  attempt=persistence.today();
  assert.equal(attempt.game.roundIndex,2);
  time+=1000;finishRound(persistence,attempt,true);
  attempt=persistence.today();
  assert.equal(attempt.game.finished,true);
  assert.equal(attempt.completion.result,'complete');
  assert.deepEqual(plain(attempt.completion),plain({result:'complete',completedAt:time,correctCount:2,totalGuesses:5,totalHints:1,totalPoints:180}));
  assert.equal(persistence.next(),false);
  assert.deepEqual(persistence.read().stats,{currentStreak:1,bestStreak:1,lastCompletedDate:'2026-09-17'});
  assert.equal(persistence.read().completionHistory.length,1);
});

test('reload preserves all frozen round snapshots, progress, and each round clock',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  let persistence=api.createPersistence(storage,{now:()=>time});
  let attempt=persistence.today();
  time+=1000;persistence.start();time+=1000;finishRound(persistence,attempt,true);persistence.next();
  time+=60_000;persistence=api.createPersistence(storage,{now:()=>time});
  attempt=persistence.today();
  assert.equal(attempt.game.roundIndex,1);
  assert.equal(attempt.game.rounds[0].startedAt,Date.parse('2026-09-17T12:00:01Z'));
  assert.equal(attempt.game.rounds[0].completedAt,Date.parse('2026-09-17T12:00:02Z'));
  assert.equal(attempt.game.rounds[1].startedAt,null);
  assert.deepEqual(attempt.options,plain(api.forDate('2026-09-17').payloads.map(payload=>payload.options)));
});

test('v2 validation is descriptor-bound and rejects malformed or out-of-sequence attempts',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  const persistence=api.createPersistence(storage,{now:()=>Date.parse('2026-09-17T12:00:00Z')});
  const valid=persistence.today();
  assert.equal(api.validateAttempt(valid),true);
  for(const corrupt of [
    attempt=>attempt.playerSnapshotIds.reverse(),
    attempt=>attempt.options[1].reverse(),
    attempt=>attempt.game.deck.push(attempt.game.deck[0]),
    attempt=>attempt.game.rounds.pop(),
    attempt=>attempt.game.rounds[0].hints=4,
    attempt=>attempt.game.roundIndex=2,
    attempt=>attempt.game.rounds[1].guesses.push(attempt.game.rounds[1].options[0]),
    attempt=>attempt.game.rounds[0].startedAt=attempt.updatedAt+1,
    attempt=>attempt.updatedAt=Infinity
  ]){const candidate=clone(valid);corrupt(candidate);assert.equal(api.validateAttempt(candidate),false);}
});

test('UTC rollover preserves yesterday read-only and completion streaks update once per three-player day',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T23:59:00Z');
  const persistence=api.createPersistence(storage,{now:()=>time});
  persistence.today();
  assert.equal(persistence.hint(),true);
  const yesterday=persistence.read().attempts['2026-09-17'];

  time=Date.parse('2026-09-18T00:01:00Z');
  assert.equal(persistence.today().date,'2026-09-18');
  assert.equal(persistence.guess(yesterday.game.deck[0],'2026-09-17'),false);
  assert.deepEqual(persistence.read().attempts['2026-09-17'],yesterday);

  for(let round=0;round<3;round++){
    const attempt=persistence.today();
    finishRound(persistence,attempt,true);
    if(round<2)assert.equal(persistence.next(),true);
  }
  assert.deepEqual(persistence.read().stats,{currentStreak:1,bestStreak:1,lastCompletedDate:'2026-09-18'});
  assert.equal(persistence.guess(persistence.today().game.deck[2]),false,'duplicate completion is inert');
  assert.equal(persistence.read().completionHistory.length,1);

  time=Date.parse('2026-09-19T12:00:00Z');
  for(let round=0;round<3;round++){
    const attempt=persistence.today();
    finishRound(persistence,attempt,round!==1);
    if(round<2)assert.equal(persistence.next(),true);
  }
  assert.deepEqual(persistence.read().stats,{currentStreak:2,bestStreak:2,lastCompletedDate:'2026-09-19'});

  time=Date.parse('2026-09-21T12:00:00Z');
  for(let round=0;round<3;round++){
    const attempt=persistence.today();
    finishRound(persistence,attempt,true);
    if(round<2)assert.equal(persistence.next(),true);
  }
  assert.deepEqual(persistence.read().stats,{currentStreak:1,bestStreak:2,lastCompletedDate:'2026-09-21'});
});

test('cross-tab reconciliation never lets an in-progress fork replace a resolved current player',()=>{
  const {api}=loadDaily(),time=Date.parse('2026-09-17T12:00:00Z'),baseStorage=memoryStorage();
  const base=api.createPersistence(baseStorage,{now:()=>time});base.today();
  const seed=baseStorage.values.get('derabona.daily.v1');
  const solvedStorage=memoryStorage({'derabona.daily.v1':seed}),playingStorage=memoryStorage({'derabona.daily.v1':seed});
  const solved=api.createPersistence(solvedStorage,{now:()=>time}),playing=api.createPersistence(playingStorage,{now:()=>time});
  const attempt=solved.today(),answer=attempt.game.deck[0];
  assert.equal(solved.guess(answer),true);
  const playingAttempt=playing.today();
  for(const wrong of playingAttempt.game.rounds[0].options.filter(id=>id!==answer).slice(0,2))assert.equal(playing.guess(wrong),true);
  const solvedRaw=solvedStorage.values.get('derabona.daily.v1'),playingRaw=playingStorage.values.get('derabona.daily.v1');
  for(const order of [[solvedRaw,playingRaw],[playingRaw,solvedRaw]]){
    const storage=memoryStorage({'derabona.daily.v1':seed}),tab=api.createPersistence(storage,{now:()=>time});
    for(const raw of order)tab.handleStorageEvent({key:'derabona.daily.v1',newValue:raw});
    const round=tab.today().game.rounds[0];
    assert.equal(round.status,'won');
    assert.deepEqual(round.guesses,[answer]);
  }
});

test('three-player persistence keeps only 32 recent attempts and 400 terminal summaries',()=>{
  const {api}=loadDaily();
  let time=Date.parse('2026-09-17T12:00:00Z');
  const attempts=api.createPersistence(memoryStorage(),{now:()=>time});
  for(let day=0;day<33;day++){assert.ok(attempts.today());time+=86_400_000;}
  assert.equal(Object.keys(attempts.read().attempts).length,32);

  const start=Date.parse('2026-09-17T00:00:00Z');
  const completionHistory=Array.from({length:401},(_,day)=>{
    const completedAt=start+day*86_400_000,date=new Date(completedAt).toISOString().slice(0,10),descriptor=api.forDate(date);
    return {date,challengeNumber:descriptor.challengeNumber,descriptorDigest:descriptor.descriptorDigest,result:'complete',completedAt,correctCount:3,totalGuesses:3,totalHints:0,totalPoints:300,attemptDigest:`state-${day}`};
  });
  const storage=memoryStorage({'derabona.daily.v1':JSON.stringify({schemaVersion:2,scheduleVersion:2,attempts:{},completionHistory,stats:{currentStreak:0,bestStreak:0,lastCompletedDate:null}})});
  const summaries=api.createPersistence(storage,{now:()=>start});
  assert.equal(summaries.read().completionHistory.length,400);
  assert.equal(summaries.read().completionHistory.at(0).date,'2026-09-18');
  assert.equal(summaries.read().completionHistory.at(-1).date,'2027-10-22');
});

test('denied localStorage keeps the three-player challenge usable in isolated memory',()=>{
  const {api}=loadDaily(),storage=memoryStorage({},true);
  const persistence=api.createPersistence(storage,{now:()=>Date.parse('2026-09-17T12:00:00Z')});
  const attempt=persistence.today();
  assert.equal(persistence.persistent,false);
  finishRound(persistence,attempt,true);
  assert.equal(persistence.next(),true);
  assert.equal(persistence.today().game.roundIndex,1);
  assert.equal(storage.values.size,0);
});
