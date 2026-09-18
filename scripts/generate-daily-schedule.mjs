#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';

const indexUrl=new URL('../index.html',import.meta.url);
const html=readFileSync(indexUrl,'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];
const source=id=>{const value=block(id);if(!value)throw new Error(`Missing ${id} script`);return value;};
const context=vm.createContext({});
vm.runInContext(source('roster-data')+source('game-model')+source('locale-data'),context);
const {players,game,spanish}=vm.runInContext('({players:PLAYERS,game:CareerGame,spanish:SPANISH_NOTES})',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const hash=value=>'sha256-'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const randomFor=initial=>{let seed=initial%2147483647;if(seed<=0)seed+=2147483646;return()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};};
const scheduleRandom=randomFor(20260917);
const shuffled=game.shuffle(plain(players),scheduleRandom);
const candidatesByName=new Map(plain(game.candidates).map(player=>[player.name,player]));
const tagKey=club=>{
  const note=club.note||'';
  if(/friendly-only/i.test(note))return'tour';
  if(/registration included|player signing/i.test(note))return'signing';
  if(/ [BC]$/.test(club.name))return'reserve';
  if(/^(?:Loan\b|First loan\b|Second, separate loan\b|Six-month loan\b|Two-year loan\b|Initially a .* loan\b|One uninterrupted playing spell: loan\b)/i.test(note))return'loan';
  if(/return/i.test(note))return'return';
  return null;
};
const yearRange=player=>{
  const years=player.clubs.flatMap(club=>(club.years||'').match(/\d{4}/g)||[]).map(Number);
  return {start:Math.min(...years),end:player.clubs.some(club=>(club.years||'').includes('present'))?Number(player.verifiedAt.slice(0,4)):Math.max(...years)};
};
const payloads={};
const descriptors=[];
shuffled.forEach((player,index)=>{
  const random=randomFor(20260917+index+1);
  const optionLabels=plain(game.optionsFor(player,'hard',random,'all'));
  const options=optionLabels.map(label=>{const candidate=candidatesByName.get(label);if(!candidate)throw new Error(`Missing candidate ${label}`);return{id:candidate.id,label};});
  const localized=spanish[player.id];
  const payload={
    player:{
      id:player.id,name:player.name,country:player.country,position:player.position,
      activeYears:yearRange(player),status:player.status||null,verifiedAt:player.verifiedAt,
      clubs:player.clubs.map((club,clubIndex)=>({name:club.name,years:club.years,note:club.note||'',tagKey:tagKey(club),crestKey:player.clubCrests[clubIndex]})),
      hints:{country:player.country,position:player.position},notes:player.notes,
      localized:{es:{notes:localized.notes,clubNotes:localized.clubNotes}},
      sources:player.sources.map(({url,title})=>({url,title}))
    },
    options
  };
  payloads[player.id]=payload;
  descriptors.push({payloadId:player.id,payloadDigest:hash(payload),playerId:player.id,optionIds:options.map(option=>option.id)});
});
const scheduleDigest=hash(descriptors);
const runtime=`'use strict';
// Generated once by scripts/generate-daily-schedule.mjs with seed 20260917.
// Runtime daily play reads only these frozen v1 literals; v2 groups three consecutive descriptors without changing them.
const dailyDeepFreeze=value=>{Object.freeze(value);Object.values(value).forEach(child=>{if(child&&typeof child==='object'&&!Object.isFrozen(child))dailyDeepFreeze(child);});return value;};
const DAILY_PAYLOAD_V1=dailyDeepFreeze(${JSON.stringify(payloads)});
const DAILY_SCHEDULE_V1=dailyDeepFreeze(${JSON.stringify(descriptors)});
const DAILY_SCHEDULE_V1_DIGEST=${JSON.stringify(scheduleDigest)};
const DailyChallenge=(()=>{
  const EPOCH_DAY=Date.UTC(2026,8,17)/86400000;
  const datePattern=/^(\\d{4})-(\\d{2})-(\\d{2})$/;
  const parseDate=date=>{
    const match=typeof date==='string'&&date.match(datePattern);if(!match)return null;
    const day=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))/86400000;
    return new Date(day*86400000).toISOString().slice(0,10)===date?day:null;
  };
  const forDate=date=>{
    const day=parseDate(date);if(day===null||day<EPOCH_DAY)return null;
    const challengeNumber=day-EPOCH_DAY+1,start=((challengeNumber-1)*3)%DAILY_SCHEDULE_V1.length;
    const descriptors=[0,1,2].map(offset=>DAILY_SCHEDULE_V1[(start+offset)%DAILY_SCHEDULE_V1.length]);
    return dailyDeepFreeze({
      challengeNumber,date,
      descriptorDigest:'v2:'+descriptors.map(item=>item.payloadDigest).join('|'),
      playerIds:descriptors.map(item=>item.playerId),
      payloadDigests:descriptors.map(item=>item.payloadDigest),
      optionIds:descriptors.map(item=>item.optionIds),
      payloads:descriptors.map(item=>DAILY_PAYLOAD_V1[item.payloadId])
    });
  };
  const STORAGE_KEY='derabona.daily.v1';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const emptyDocument=()=>({schemaVersion:2,scheduleVersion:2,attempts:{},completionHistory:[],stats:{currentStreak:0,bestStreak:0,lastCompletedDate:null}});
  const pristineRound=(descriptor,index)=>({options:[...descriptor.optionIds[index]],guesses:[],hints:0,status:'playing',points:null,startedAt:null,completedAt:null});
  const makeAttempt=(date,time)=>{
    const descriptor=forDate(date);if(!descriptor)return null;
    return {date,challengeNumber:descriptor.challengeNumber,descriptorDigest:descriptor.descriptorDigest,payloadDigests:[...descriptor.payloadDigests],playerSnapshotIds:[...descriptor.playerIds],options:descriptor.payloads.map(payload=>copy(payload.options)),game:{version:2,deck:[...descriptor.playerIds],roundIndex:0,rounds:[0,1,2].map(index=>pristineRound(descriptor,index)),finished:false},revision:0,updatedAt:time,completion:null};
  };
  const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
  const validTime=value=>Number.isFinite(value)&&value>=0&&value<=8640000000000000;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const scoreFor=(hints,startedAt,completedAt)=>{
    if(!validTime(startedAt)||!validTime(completedAt)||completedAt<startedAt)return null;
    const elapsed=completedAt-startedAt,timeFactor=elapsed<=2000?1:Math.max(.25,1-.75*Math.min(1,(elapsed-2000)/22000));
    return Math.max(10,Math.round(100*(1-.2*Math.min(3,hints))*timeFactor));
  };
  const roundStatus=(round,answer)=>round.guesses.includes(answer)?'won':round.guesses.length===3?'lost':'playing';
  const aggregate=attempt=>{
    const rounds=attempt.game.rounds;
    return {correctCount:rounds.filter(round=>round.status==='won').length,totalGuesses:rounds.reduce((sum,round)=>sum+round.guesses.length,0),totalHints:rounds.reduce((sum,round)=>sum+round.hints,0),totalPoints:rounds.reduce((sum,round)=>sum+(round.points||0),0)};
  };
  const validateAttempt=attempt=>{
    try{
      const keys=['date','challengeNumber','descriptorDigest','payloadDigests','playerSnapshotIds','options','game','revision','updatedAt','completion'];
      if(!exactKeys(attempt,keys)||parseDate(attempt.date)===null)return false;
      const descriptor=forDate(attempt.date);if(!descriptor||attempt.challengeNumber!==descriptor.challengeNumber||attempt.descriptorDigest!==descriptor.descriptorDigest||!same(attempt.payloadDigests,descriptor.payloadDigests)||!same(attempt.playerSnapshotIds,descriptor.playerIds)||!same(attempt.options,descriptor.payloads.map(payload=>payload.options)))return false;
      if(!validTime(attempt.updatedAt)||!Number.isSafeInteger(attempt.revision)||attempt.revision<0)return false;
      const game=attempt.game;if(!exactKeys(game,['version','deck','roundIndex','rounds','finished'])||game.version!==2||!Number.isInteger(game.roundIndex)||game.roundIndex<0||game.roundIndex>2||!same(game.deck,descriptor.playerIds)||!Array.isArray(game.rounds)||game.rounds.length!==3||typeof game.finished!=='boolean')return false;
      for(let index=0;index<3;index++){
        const round=game.rounds[index],answer=descriptor.playerIds[index];
        if(!exactKeys(round,['options','guesses','hints','status','points','startedAt','completedAt'])||!same(round.options,descriptor.optionIds[index])||!Array.isArray(round.guesses)||round.guesses.length>3||new Set(round.guesses).size!==round.guesses.length||!round.guesses.every(id=>round.options.includes(id))||!Number.isInteger(round.hints)||round.hints<0||round.hints>3)return false;
        const correctAt=round.guesses.indexOf(answer);if(correctAt!==-1&&correctAt!==round.guesses.length-1)return false;
        const status=roundStatus(round,answer);if(round.status!==status)return false;
        if(status==='playing'){
          if(round.points!==null||round.completedAt!==null)return false;
          if(round.startedAt!==null&&(!validTime(round.startedAt)||round.startedAt>attempt.updatedAt))return false;
          if(index<game.roundIndex||index>game.roundIndex&&(round.guesses.length||round.hints||round.startedAt!==null))return false;
        }else{
          if(index>game.roundIndex||!validTime(round.startedAt)||!validTime(round.completedAt)||round.completedAt<round.startedAt||round.completedAt>attempt.updatedAt)return false;
          if(!Number.isInteger(round.points)||(status==='lost'?round.points!==0:round.points!==scoreFor(round.hints,round.startedAt,round.completedAt)))return false;
        }
      }
      const current=game.rounds[game.roundIndex];if(game.rounds.slice(0,game.roundIndex).some(round=>round.status==='playing'))return false;
      if(game.finished){
        if(game.roundIndex!==2||current.status==='playing')return false;
        const totals=aggregate(attempt);if(!exactKeys(attempt.completion,['result','completedAt','correctCount','totalGuesses','totalHints','totalPoints'])||attempt.completion.result!=='complete'||attempt.completion.completedAt!==current.completedAt||!same({...attempt.completion,result:undefined,completedAt:undefined},{...totals,result:undefined,completedAt:undefined}))return false;
      }else if(attempt.completion!==null||game.roundIndex===2&&current.status!=='playing')return false;
      return true;
    }catch{return false;}
  };
  const stateDigest=attempt=>{
    const state={date:attempt.date,playerSnapshotIds:attempt.playerSnapshotIds,game:attempt.game,completion:attempt.completion};
    let hash=2166136261;for(const char of JSON.stringify(state)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return 'state-'+(hash>>>0).toString(16).padStart(8,'0');
  };
  const summaryFor=attempt=>({date:attempt.date,challengeNumber:attempt.challengeNumber,descriptorDigest:attempt.descriptorDigest,...attempt.completion,attemptDigest:stateDigest(attempt)});
  const validateSummary=summary=>{const descriptor=summary&&forDate(summary.date);return exactKeys(summary,['date','challengeNumber','descriptorDigest','result','completedAt','correctCount','totalGuesses','totalHints','totalPoints','attemptDigest'])&&descriptor&&summary.challengeNumber===descriptor.challengeNumber&&summary.descriptorDigest===descriptor.descriptorDigest&&summary.result==='complete'&&Number.isInteger(summary.correctCount)&&summary.correctCount>=0&&summary.correctCount<=3&&Number.isInteger(summary.totalGuesses)&&summary.totalGuesses>=3&&summary.totalGuesses<=9&&Number.isInteger(summary.totalHints)&&summary.totalHints>=0&&summary.totalHints<=9&&Number.isInteger(summary.totalPoints)&&summary.totalPoints>=0&&summary.totalPoints<=300&&validTime(summary.completedAt)&&typeof summary.attemptDigest==='string';};
  const reconcileDocument=value=>{
    const byDate=new Map((value.completionHistory||[]).filter(validateSummary).map(summary=>[summary.date,summary]));
    for(const attempt of Object.values(value.attempts))if(attempt.completion){const summary=summaryFor(attempt),existing=byDate.get(attempt.date);if(!existing||summary.attemptDigest>existing.attemptDigest)byDate.set(attempt.date,summary);}
    value.attempts=Object.fromEntries(Object.entries(value.attempts).sort(([a],[b])=>a.localeCompare(b)).slice(-32));
    value.completionHistory=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-400);
    let current=0,best=0,last=null;for(const summary of value.completionHistory){const day=parseDate(summary.date);current=last!==null&&day-last===1?current+1:1;best=Math.max(best,current);last=day;}
    value.stats={currentStreak:value.completionHistory.length?current:0,bestStreak:best,lastCompletedDate:value.completionHistory.at(-1)?.date??null};
    return value;
  };
  const sanitizeDocument=value=>{
    if(!exactKeys(value,['schemaVersion','scheduleVersion','attempts','completionHistory','stats'])||value.schemaVersion!==2||value.scheduleVersion!==2||!exactKeys(value.attempts,Object.keys(value.attempts||{}))||!Array.isArray(value.completionHistory)||!exactKeys(value.stats,['currentStreak','bestStreak','lastCompletedDate']))return emptyDocument();
    const attempts={};for(const [date,attempt] of Object.entries(value.attempts))if(date===attempt?.date&&validateAttempt(attempt))attempts[date]=attempt;
    return reconcileDocument({...emptyDocument(),attempts,completionHistory:value.completionHistory,stats:value.stats});
  };
  const dominantAttempt=(left,right)=>{
    if(!left)return right;if(!right)return left;
    if(left.game.finished!==right.game.finished)return left.game.finished?left:right;
    if(left.game.roundIndex!==right.game.roundIndex)return left.game.roundIndex>right.game.roundIndex?left:right;
    const leftRound=left.game.rounds[left.game.roundIndex],rightRound=right.game.rounds[right.game.roundIndex],leftResolved=leftRound.status!=='playing',rightResolved=rightRound.status!=='playing';
    if(leftResolved!==rightResolved)return leftResolved?left:right;
    if(leftResolved)return stateDigest(left)>=stateDigest(right)?left:right;
    if(leftRound.guesses.length!==rightRound.guesses.length)return leftRound.guesses.length>rightRound.guesses.length?left:right;
    if(leftRound.hints!==rightRound.hints)return leftRound.hints>rightRound.hints?left:right;
    return stateDigest(left)>=stateDigest(right)?left:right;
  };
  const mergeDocuments=(...values)=>{
    const merged=emptyDocument(),summaries=new Map();
    for(const value of values){const clean=sanitizeDocument(value);
      for(const [date,attempt] of Object.entries(clean.attempts))merged.attempts[date]=dominantAttempt(merged.attempts[date],attempt);
      for(const summary of clean.completionHistory){const existing=summaries.get(summary.date);if(!existing||summary.attemptDigest>existing.attemptDigest)summaries.set(summary.date,summary);}
    }
    merged.completionHistory=[...summaries.values()];return reconcileDocument(merged);
  };
  const createPersistence=(storage,{now=()=>Date.now()}={})=>{
    let document=emptyDocument(),persistent=true;
    const load=()=>{try{const raw=storage.getItem(STORAGE_KEY);if(raw)document=mergeDocuments(document,JSON.parse(raw));}catch{persistent=false;}};
    load();
    const save=()=>{try{storage.setItem(STORAGE_KEY,JSON.stringify(document));}catch{persistent=false;}};
    const reconcile=source=>{
      const before=JSON.stringify(document);load();
      try{const incoming=typeof source==='string'?JSON.parse(source):source;document=mergeDocuments(document,incoming);}catch{return false;}
      const serialized=JSON.stringify(document);try{if(storage.getItem(STORAGE_KEY)!==serialized)save();}catch{persistent=false;}
      return serialized!==before;
    };
    const handleStorageEvent=event=>event?.key===STORAGE_KEY&&typeof event.newValue==='string'?reconcile(event.newValue):false;
    const currentDate=()=>new Date(now()).toISOString().slice(0,10);
    const today=()=>{load();const time=now(),date=currentDate();if(!document.attempts[date]){const attempt=makeAttempt(date,time);if(!attempt)return null;document.attempts[date]=attempt;reconcileDocument(document);save();}return copy(document.attempts[date]);};
    const mutate=(change,date=currentDate())=>{
      load();if(date!==currentDate())return false;if(!document.attempts[date])document.attempts[date]=makeAttempt(date,now());
      const attempt=document.attempts[date],round=attempt.game.rounds[attempt.game.roundIndex];if(!attempt||attempt.completion)return false;
      if(!change(attempt,round))return false;attempt.revision++;attempt.updatedAt=now();reconcileDocument(document);save();return true;
    };
    const start=(date=currentDate())=>mutate((attempt,round)=>{if(round.startedAt!==null||round.status!=='playing')return false;round.startedAt=now();return true;},date);
    const hint=(date=currentDate())=>mutate((attempt,round)=>{if(round.status!=='playing'||round.hints>=3)return false;if(round.startedAt===null)round.startedAt=now();round.hints++;return true;},date);
    const guess=(optionId,date=currentDate(),clockStartedAt=null)=>mutate((attempt,round)=>{
      if(round.status!=='playing'||!round.options.includes(optionId)||round.guesses.includes(optionId))return false;
      const actionTime=now(),hasSessionClock=Number.isFinite(clockStartedAt)&&clockStartedAt<=actionTime;
      if(hasSessionClock)round.startedAt=clockStartedAt;else if(round.startedAt===null)round.startedAt=actionTime;round.guesses.push(optionId);
      const answer=attempt.game.deck[attempt.game.roundIndex];
      if(optionId===answer){round.status='won';round.points=scoreFor(round.hints,round.startedAt,actionTime);round.completedAt=actionTime;}
      else if(round.guesses.length===3){round.status='lost';round.points=0;round.completedAt=actionTime;}
      if(round.status!=='playing'&&attempt.game.roundIndex===2){attempt.game.finished=true;attempt.completion={result:'complete',completedAt:actionTime,...aggregate(attempt)};}
      return true;
    },date);
    const next=(date=currentDate())=>mutate((attempt,round)=>{if(round.status==='playing'||attempt.game.roundIndex>=2)return false;attempt.game.roundIndex++;return true;},date);
    return {get persistent(){return persistent;},today,read:()=>copy(document),start,hint,guess,next,reconcile,handleStorageEvent};
  };
  return Object.freeze({schemaVersion:2,scheduleVersion:2,scheduleDigest:DAILY_SCHEDULE_V1_DIGEST,forDate,validateAttempt,stateDigest,createPersistence});
})();`;
const generated=`<script id="daily-challenge">\n${runtime}\n</script>`;
const existing=/<script id="daily-challenge">[\s\S]*?<\/script>/;
if(process.argv.includes('--check')){
  if(html.match(existing)?.[0]!==generated){
    console.error('daily challenge schedule is out of date; run with --write');
    process.exitCode=1;
  }else console.log(`daily challenge schedule is current; ${scheduleDigest}`);
}else if(process.argv.includes('--write')){
  const anchor='<script id="game-model">';
  const next=existing.test(html)?html.replace(existing,generated):html.replace(anchor,generated+'\n'+anchor);
  if(next===html)throw new Error('Could not insert daily-challenge script');
  writeFileSync(indexUrl,next);
  console.log(`wrote 220 frozen payloads; v2 groups three players; ${scheduleDigest}`);
}else process.stdout.write(generated+'\n');
