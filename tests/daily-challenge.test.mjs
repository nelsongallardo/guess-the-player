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

function loadDaily(extra={}){
  const source=block('daily-challenge');
  assert.ok(source,'daily-challenge module exists');
  const context=vm.createContext({structuredClone,Date,JSON,Map,Set,URL,...extra});
  vm.runInContext(source+'\nglobalThis.daily=DailyChallenge;globalThis.schedule=DAILY_SCHEDULE_V1;globalThis.payloads=DAILY_PAYLOAD_V1;',context);
  return {api:context.daily,schedule:plain(context.schedule),payloads:plain(context.payloads),context};
}

test('frozen v1 schedule maps UTC epoch and repeats only after all 220 answers',()=>{
  const {api,schedule,payloads}=loadDaily();
  assert.equal(api.forDate('2026-09-16'),null);
  assert.equal(api.forDate('2026-09-17').challengeNumber,1);
  assert.equal(api.forDate('2026-09-18').challengeNumber,2);
  assert.equal(api.forDate('2027-04-24').challengeNumber,220);
  assert.equal(api.forDate('2027-04-25').challengeNumber,221);
  assert.equal(api.forDate('2027-04-25').playerId,api.forDate('2026-09-17').playerId);
  assert.equal(schedule.length,220);
  assert.equal(Object.keys(payloads).length,220);
  assert.equal(new Set(schedule.map(item=>item.playerId)).size,220);
  for(const descriptor of schedule){
    const payload=payloads[descriptor.payloadId];
    assert.ok(payload,descriptor.payloadId);
    assert.equal(payload.player.id,descriptor.playerId);
    assert.equal(payload.options.length,10);
    assert.equal(new Set(payload.options.map(option=>option.id)).size,10);
    assert.deepEqual(descriptor.optionIds,payload.options.map(option=>option.id));
    assert.ok(descriptor.optionIds.includes(descriptor.playerId));
    assert.equal(descriptor.payloadDigest,digest(payload));
  }
});

test('schedule digest, released fixtures, and rendered payload are immutable and roster-independent',()=>{
  const {api,context}=loadDaily();
  assert.equal(api.scheduleDigest,'sha256-0a26b1011e275301f9d77e7068afd1c3d234dc6f95c4ff6588b4bfff61c21bcc');
  const fixtures=[
    ['2026-09-17',1,'aron-winter','sha256-d65d4770c81dad38b0f55e44b510249deaaa16c6d013752157c60c904ce0fb6a'],
    ['2026-12-31',106,'carlos-valderrama','sha256-4b7e845c98bcf5df2fdd86aa470fecc0fb0d57a5bb08cbec5991be99c356541a'],
    ['2027-04-24',220,'sylvain-wiltord','sha256-e997a658dbc3bb08d8ee8f77e43b16d3da4fef2376eb28f075eb0a869bcba608'],
    ['2030-01-01',1203,'diego-ribas','sha256-42b5dec9e547d32f7acab5e04453a0e5e9d5858424036432b25eea1a4e21d2ba']
  ];
  for(const [date,challengeNumber,playerId,payloadDigest] of fixtures){
    const descriptor=api.forDate(date);
    assert.deepEqual([descriptor.challengeNumber,descriptor.playerId,descriptor.payloadDigest],[challengeNumber,playerId,payloadDigest]);
  }
  const first=api.forDate('2026-09-17');
  assert.ok(Object.isFrozen(first.payload));
  assert.ok(Object.isFrozen(first.payload.player));
  assert.ok(Object.isFrozen(first.payload.player.clubs));
  assert.ok(Object.isFrozen(first.payload.options));
  const originalName=first.payload.player.name;
  vm.runInContext(`DailyChallenge.forDate('2026-09-17').payload.player.name='changed'`,context);
  assert.equal(api.forDate('2026-09-17').payload.player.name,originalName);
  assert.doesNotMatch(block('daily-challenge'),/\b(?:PLAYERS|eligibleRivals|CareerGame)\b/);
});

test('empty daily storage creates only today with strict isolated schema',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  const persistence=api.createPersistence(storage,{now:()=>Date.parse('2026-09-17T12:00:00Z')});
  const attempt=persistence.today(),document=persistence.read();
  assert.equal(persistence.persistent,true);
  assert.deepEqual([...storage.values.keys()],['derabona.daily.v1']);
  assert.deepEqual(Object.keys(document),['schemaVersion','scheduleVersion','attempts','completionHistory','stats']);
  assert.equal(document.schemaVersion,1);
  assert.equal(document.scheduleVersion,1);
  assert.deepEqual(document.stats,{currentStreak:0,bestStreak:0,lastCompletedDate:null});
  assert.deepEqual(document.completionHistory,[]);
  assert.deepEqual(Object.keys(document.attempts),['2026-09-17']);
  const descriptor=api.forDate('2026-09-17');
  assert.equal(attempt.date,'2026-09-17');
  assert.equal(attempt.challengeNumber,1);
  assert.equal(attempt.descriptorDigest,descriptor.descriptorDigest);
  assert.equal(attempt.payloadDigest,descriptor.payloadDigest);
  assert.equal(attempt.playerSnapshotId,descriptor.playerId);
  assert.deepEqual(attempt.options,plain(descriptor.payload.options));
  assert.deepEqual(attempt.game,plain({version:1,deck:[descriptor.playerId],roundIndex:0,rounds:[{options:descriptor.optionIds,guesses:[],hints:0,status:'playing',points:null}],finished:false}));
  assert.equal(attempt.startedAt,null);
  assert.equal(attempt.revision,0);
  assert.equal(attempt.updatedAt,Date.parse('2026-09-17T12:00:00Z'));
  assert.equal(attempt.completion,null);
});

test('same-date reload preserves frozen options, progress, and the original daily clock',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  const first=api.createPersistence(storage,{now:()=>time});
  const created=first.today(),wrong=created.game.rounds[0].options.find(id=>id!==created.playerSnapshotId);
  time+=1000;assert.equal(first.start(),true);
  time+=1000;assert.equal(first.hint(),true);
  time+=1000;assert.equal(first.guess(wrong),true);
  const saved=first.read().attempts['2026-09-17'];
  time+=60_000;
  const reloaded=api.createPersistence(storage,{now:()=>time});
  assert.deepEqual(reloaded.today(),saved);
  assert.equal(reloaded.today().startedAt,Date.parse('2026-09-17T12:00:01Z'));
  assert.deepEqual(reloaded.today().options,created.options);
  assert.deepEqual(reloaded.today().game.rounds[0].guesses,[wrong]);
  assert.equal(reloaded.today().game.rounds[0].hints,1);
});

test('daily validation is descriptor-bound and repairs one corrupt date without erasing valid dates',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  let persistence=api.createPersistence(storage,{now:()=>time});
  persistence.today();persistence.start();persistence.hint();
  const validFirst=persistence.read().attempts['2026-09-17'];
  time=Date.parse('2026-09-18T12:00:00Z');
  persistence=api.createPersistence(storage,{now:()=>time});
  const validSecond=persistence.today();
  assert.equal(persistence.guess(validSecond.playerSnapshotId),true);
  const validTerminal=persistence.read().attempts['2026-09-18'];
  assert.equal(api.validateAttempt(validFirst),true);
  for(const corrupt of [
    attempt=>attempt.descriptorDigest='sha256-corrupt',
    attempt=>attempt.options.reverse(),
    attempt=>attempt.options[0].label='Mutable roster label',
    attempt=>attempt.game.deck.push(attempt.playerSnapshotId),
    attempt=>attempt.game.rounds[0].options.pop(),
    attempt=>attempt.game.rounds[0].hints=4,
    attempt=>attempt.updatedAt=Infinity
  ]){const candidate=clone(validSecond);corrupt(candidate);assert.equal(api.validateAttempt(candidate),false);}
  for(const corrupt of [
    attempt=>{attempt.game.rounds[0].points=99;attempt.completion.points=99;},
    attempt=>attempt.startedAt=null,
    attempt=>attempt.completion.completedAt=attempt.updatedAt+1
  ]){const candidate=clone(validTerminal);corrupt(candidate);assert.equal(api.validateAttempt(candidate),false);}
  const document=persistence.read();document.attempts['2026-09-18'].game.rounds[0].options.reverse();
  storage.setItem('derabona.daily.v1',JSON.stringify(document));
  const recovered=api.createPersistence(storage,{now:()=>time});
  const recreated=recovered.today();
  assert.deepEqual(recovered.read().attempts['2026-09-17'],validFirst);
  assert.deepEqual(recreated.options,validSecond.options);
  assert.deepEqual(recreated.game.rounds[0].options,validSecond.game.rounds[0].options);
  assert.equal(recreated.game.rounds[0].guesses.length,0);
});

test('rollover keeps yesterday unresolved and read-only while creating a fresh current attempt',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T23:59:00Z');
  let persistence=api.createPersistence(storage,{now:()=>time});
  const yesterday=persistence.today(),miss=yesterday.game.rounds[0].options.find(id=>id!==yesterday.playerSnapshotId);
  persistence.start();persistence.guess(miss);
  const frozenYesterday=persistence.read().attempts['2026-09-17'];
  time=Date.parse('2026-09-18T00:01:00Z');
  persistence=api.createPersistence(storage,{now:()=>time});
  const today=persistence.today();
  assert.equal(today.date,'2026-09-18');
  assert.equal(today.challengeNumber,2);
  assert.deepEqual(persistence.read().attempts['2026-09-17'],frozenYesterday);
  assert.equal(persistence.guess(today.playerSnapshotId,'2026-09-17'),false);
  assert.deepEqual(persistence.read().attempts['2026-09-17'],frozenYesterday);
});

test('win and loss completions update the UTC completion streak exactly once and gaps reset it',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  const persistence=api.createPersistence(storage,{now:()=>time});
  let attempt=persistence.today();
  assert.equal(persistence.guess(attempt.playerSnapshotId),true);
  assert.equal(persistence.guess(attempt.playerSnapshotId),false);
  assert.deepEqual(persistence.read().stats,{currentStreak:1,bestStreak:1,lastCompletedDate:'2026-09-17'});
  assert.equal(persistence.read().completionHistory.length,1);
  time=Date.parse('2026-09-18T12:00:00Z');attempt=persistence.today();
  for(const wrong of attempt.game.rounds[0].options.filter(id=>id!==attempt.playerSnapshotId).slice(0,3))assert.equal(persistence.guess(wrong),true);
  assert.equal(persistence.read().attempts['2026-09-18'].completion.result,'lost');
  assert.deepEqual(persistence.read().stats,{currentStreak:2,bestStreak:2,lastCompletedDate:'2026-09-18'});
  assert.equal(persistence.read().completionHistory.length,2);
  time=Date.parse('2026-09-20T12:00:00Z');attempt=persistence.today();
  assert.equal(persistence.guess(attempt.playerSnapshotId),true);
  assert.deepEqual(persistence.read().stats,{currentStreak:1,bestStreak:2,lastCompletedDate:'2026-09-20'});
  assert.deepEqual(persistence.read().completionHistory.map(item=>item.date),['2026-09-17','2026-09-18','2026-09-20']);
});

test('daily persistence keeps only 32 recent attempts and 400 terminal summaries',()=>{
  const {api}=loadDaily(),storage=memoryStorage();
  let time=Date.parse('2026-09-17T12:00:00Z');
  const persistence=api.createPersistence(storage,{now:()=>time});
  for(let offset=0;offset<401;offset++){
    time=Date.parse('2026-09-17T12:00:00Z')+offset*86_400_000;
    const attempt=persistence.today();
    assert.equal(persistence.guess(attempt.playerSnapshotId),true);
  }
  const document=persistence.read(),attemptDates=Object.keys(document.attempts),summaryDates=document.completionHistory.map(item=>item.date);
  assert.equal(attemptDates.length,32);
  assert.equal(summaryDates.length,400);
  assert.equal(attemptDates[0],'2027-09-21');
  assert.equal(attemptDates.at(-1),'2027-10-22');
  assert.equal(summaryDates[0],'2026-09-18');
  assert.equal(summaryDates.at(-1),'2027-10-22');
});

test('denied localStorage falls back to isolated nonpersistent memory',()=>{
  const {api}=loadDaily(),storage=memoryStorage({},true);
  let time=Date.parse('2026-09-17T12:00:00Z');
  const persistence=api.createPersistence(storage,{now:()=>time});
  const attempt=persistence.today(),wrong=attempt.game.rounds[0].options.find(id=>id!==attempt.playerSnapshotId);
  assert.equal(persistence.persistent,false);
  time+=1000;assert.equal(persistence.hint(),true);
  time+=1000;assert.equal(persistence.guess(wrong),true);
  assert.equal(persistence.today().game.rounds[0].hints,1);
  assert.deepEqual(persistence.today().game.rounds[0].guesses,[wrong]);
  assert.equal(storage.values.size,0);
});

test('divergent terminal tabs converge by state digest with one history and streak entry',()=>{
  const {api}=loadDaily();
  const time=Date.parse('2026-09-17T12:00:00Z'),baseStorage=memoryStorage();
  const base=api.createPersistence(baseStorage,{now:()=>time});base.today();
  const seed=baseStorage.values.get('derabona.daily.v1');
  const winStorage=memoryStorage({'derabona.daily.v1':seed}),lossStorage=memoryStorage({'derabona.daily.v1':seed});
  const win=api.createPersistence(winStorage,{now:()=>time}),loss=api.createPersistence(lossStorage,{now:()=>time});
  assert.equal(win.guess(win.today().playerSnapshotId),true);
  const lossAttempt=loss.today();
  for(const wrong of lossAttempt.game.rounds[0].options.filter(id=>id!==lossAttempt.playerSnapshotId).slice(0,3))assert.equal(loss.guess(wrong),true);
  const winRaw=winStorage.values.get('derabona.daily.v1'),lossRaw=lossStorage.values.get('derabona.daily.v1');
  const winAttempt=win.read().attempts['2026-09-17'],lossTerminal=loss.read().attempts['2026-09-17'];
  const expected=api.stateDigest(winAttempt)>api.stateDigest(lossTerminal)?winAttempt:lossTerminal;
  const results=[];
  for(const order of [[winRaw,lossRaw],[lossRaw,winRaw]]){
    const storage=memoryStorage({'derabona.daily.v1':seed}),tab=api.createPersistence(storage,{now:()=>time});
    for(const raw of order)assert.equal(typeof tab.handleStorageEvent({key:'derabona.daily.v1',newValue:raw}),'boolean');
    assert.equal(tab.handleStorageEvent({key:'touchline.career.v1',newValue:winRaw}),false);
    assert.equal(tab.reconcile(seed),false);
    const reloaded=api.createPersistence(storage,{now:()=>time}),document=reloaded.read();
    assert.deepEqual(document.attempts['2026-09-17'],expected);
    assert.equal(document.completionHistory.length,1);
    assert.equal(document.completionHistory[0].attemptDigest,api.stateDigest(expected));
    assert.deepEqual(document.stats,{currentStreak:1,bestStreak:1,lastCompletedDate:'2026-09-17'});
    results.push(document);
  }
  assert.deepEqual(results[0],results[1]);
});
