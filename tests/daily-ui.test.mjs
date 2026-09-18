import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];

function loadController(url='https://derabona.club/',{exposeScope=false}={}){
  let source=block('daily-ui');
  assert.ok(source,'named daily-ui controller source exists');
  if(exposeScope){
    const marker='return Object.freeze({requestedMode';
    assert.ok(source.includes('const scopeText='),'daily scope renderer has a testable copy helper');
    assert.ok(source.includes(marker),'daily-ui export marker exists');
    source=source.replace(marker,'return Object.freeze({scopeText,requestedMode');
  }
  const location=new URL(url),history={replaceState(_a,_b,value){const next=new URL(value,location.href);location.href=next.href;}};
  const context=vm.createContext({URL,URLSearchParams,location,history,navigator:{},document:{},window:{},localStorage:{},setInterval,clearInterval,Date,JSON,confirm:()=>true});
  vm.runInContext(source+'\nglobalThis.ui=DailyUI;',context);
  return {ui:context.ui,location,source};
}

function loadControllerWithCompletion(todayResult,url='https://derabona.club/'){
  const location=new URL(url),history={replaceState(_a,_b,value){const next=new URL(value,location.href);location.href=next.href;}};
  const context=vm.createContext({URL,URLSearchParams,location,history,navigator:{},document:{},window:{},localStorage:{},setInterval,clearInterval,Date,JSON,confirm:()=>true,
    DailyChallenge:{createPersistence:()=>({today:()=>todayResult})}});
  vm.runInContext(block('daily-ui')+'\nglobalThis.ui=DailyUI;',context);
  return {ui:context.ui,location};
}

test('an already-completed daily defaults to Unlimited on load; an unfinished one stays on Daily',()=>{
  const done=loadControllerWithCompletion({date:'2026-09-17',completion:{result:'complete'}});
  assert.equal(done.ui.isDaily(),false);
  assert.equal(done.ui.requestedMode(),'unlimited');
  const fresh=loadControllerWithCompletion({date:'2026-09-17',completion:null});
  assert.equal(fresh.ui.isDaily(),true);
  const none=loadControllerWithCompletion(null);
  assert.equal(none.ui.isDaily(),true);
});

function loadModeSwitch({signedIn=true}={}){
  const actions=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',dataset:{},setAttribute(){},focus(){},classList:{remove(){},toggle(){}}});return nodes.get(id);};
  const attempt={game:{roundIndex:0,rounds:[{status:'playing',startedAt:1,guesses:[],hints:0}]}};
  const persistence={persistent:true,today:()=>({date:'2026-09-17'}),read:()=>({attempts:{'2026-09-17':attempt},stats:{currentStreak:0}})};
  const location=new URL('https://derabona.club/'),history={replaceState(_a,_b,value){location.href=new URL(value,location.href).href;}};
  let unlimitedRenders=0;
  const context=vm.createContext({
    URL,URLSearchParams,location,history,navigator:{},localStorage:{},sessionStorage:{getItem(){return null;},setItem(){}},setInterval:()=>1,clearInterval(){},Date,JSON,confirm(){throw new Error('mode switching must not confirm');},language:'en',
    Accounts:{session:signedIn?{user:{id:'A'}}:null},
    RankedUI:{isAccountMode:()=>signedIn,roundClock:()=>null,sync:async()=>{actions.push('progress','start');}},
    DailyRankedUI:{sync(){},finished:()=>false},
    DailyChallenge:{createPersistence:()=>persistence},CareerGame:{roundAt:()=>({guesses:[],hints:0}),outcome:()=> 'playing'},state:{},
    document:{getElementById:node,addEventListener(){},documentElement:{classList:{remove(){}}}},window:{addEventListener(){}},
    render(){unlimitedRenders++;}
  });
  vm.runInContext(block('daily-ui')+'\nglobalThis.ui=DailyUI;',context);
  return {ui:context.ui,actions,get unlimitedRenders(){return unlimitedRenders;}};
}

test('Daily is the default and auth scrubbing preserves only language or explicit Unlimited',()=>{
  const auth=block('auth-callback');
  let replaced='';
  const context=vm.createContext({URL,URLSearchParams,location:{href:'https://derabona.club/?daily=1&lang=en&code=SECRET&state=PRIVATE&error_description=NOPE#access_token=TOKEN&refresh_token=REFRESH'},history:{replaceState(_a,_b,value){replaced=String(value);}}});
  vm.runInContext(auth+'\nglobalThis.callback=AuthCallback;',context);
  assert.equal(replaced,'https://derabona.club/?lang=en');
  assert.equal(context.callback.code,'SECRET','PKCE code remains captured in memory after the visible URL is scrubbed');
  const {ui}=loadController('https://derabona.club/');
  assert.equal(ui.requestedMode(),'daily');
  assert.equal(ui.sanitizeURL('daily','en'),'https://derabona.club/?lang=en');
  assert.equal(ui.sanitizeURL('unlimited','es'),'https://derabona.club/?lang=es&unlimited=1');
});

test('initial entries canonicalize legacy Daily and retain explicit Unlimited without arbitrary URL state',()=>{
  const cases=[
    ['https://derabona.club/?daily=1&lang=en&utm_source=x&account=1#private','https://derabona.club/?lang=en'],
    ['https://derabona.club/play?lang=bogus&utm_source=x#private','https://derabona.club/play'],
    ['https://derabona.club/?unlimited=1&lang=es&code=x&state=y#private','https://derabona.club/?lang=es&unlimited=1'],
    ['file:///Users/test/derabona/index.html?daily=1&lang=es&junk=x#private','file:///Users/test/derabona/index.html?lang=es']
  ];
  for(const [url,expected] of cases){const {ui,location}=loadController(url);ui.updateURL(new URL(url).searchParams.get('lang'));assert.equal(location.href,expected);}
  assert.match(block('daily-ui'),/const init=\(\)=>\{\s*if\(initialized\)return;initialized=true;updateURL\(language\);/,'initial rendering sanitizes the visible URL');
});

test('visible bilingual copy covers mode, completion status, rollover, and results',()=>{
  const {ui}=loadController();
  for(const language of ['en','es']){
    const copy=ui.copyFor(language);
    for(const key of ['daily','unlimited','challenge','streak','reset','done','pending','temporary','newDaily','loadDaily','share','keepPlaying','won','lost'])assert.ok(copy[key],`${language}.${key}`);
  }
  assert.equal(ui.copyFor('en').daily,'Daily challenge');
  assert.equal(ui.copyFor('es').daily,'Desafío diario');
  assert.equal(ui.copyFor('en').unlimited,'Unlimited play');
  assert.equal(ui.copyFor('es').unlimited,'Juego sin límite');
  assert.match(ui.copyFor('en').primary,/three (?:careers|players)/i);
  assert.match(ui.copyFor('es').primary,/tres (?:carreras|jugadores)/i);
  assert.doesNotMatch(ui.copyFor('en').primary,/local|ranked/i);
  assert.doesNotMatch(ui.copyFor('es').primary,/clasificaci[oó]n|navegador/i);
});

test('each mode button carries a self-contained noun label plus concrete facts',()=>{
  const {ui}=loadController();
  for(const language of ['en','es']){
    const copy=ui.copyFor(language);
    for(const key of ['dailyFacts','unlimitedFacts']){
      assert.ok(Array.isArray(copy[key])&&copy[key].length===2,`${language}.${key} is a two-line fact list`);
      for(const fact of copy[key])assert.ok(fact&&!/·/.test(fact),`${language}.${key} lines carry no separator to dangle at a wrap`);
    }
  }
  // The daily side states the fixed scope; the unlimited side states the open one.
  assert.match(ui.copyFor('en').dailyFacts.join(' '),/3 players.*00:00 UTC/i);
  assert.match(ui.copyFor('es').dailyFacts.join(' '),/3 jugadores.*00:00 UTC/i);
  assert.match(ui.copyFor('en').unlimitedFacts.join(' '),/competition.*as many as you want/i);
  assert.match(ui.copyFor('es').unlimitedFacts.join(' '),/competición.*los que quieras/i);
  // Neither label may be a bare verb or a bare adjective: both must read cold.
  for(const language of ['en','es']){
    const copy=ui.copyFor(language);
    for(const key of ['daily','unlimited'])assert.match(copy[key],/\S+\s+\S+/,`${language}.${key} is a multi-word noun phrase`);
  }
});

test('"challenge" names the daily mode only, never a ranked round loader',()=>{
  const source=html;
  assert.doesNotMatch(source,/Preparando el desafío/,'the ranked loader must not compete with the daily challenge for the word desafío');
  assert.doesNotMatch(source,/Preparing your challenge/,'the ranked loader must not compete with the daily challenge for the word challenge');
  assert.match(source,/Preparando tu partida…/);
  assert.match(source,/Preparing your game…/);
});

test('mode group and competition badge expose translated accessible names',()=>{
  assert.doesNotMatch(html,/aria-label="Modo de juego \/ Game mode"/,'the mode group must not hardcode both languages at once');
  assert.match(html,/id="mode-segmented"/,'the mode group is addressable so applyLanguage can translate its label');
  assert.match(html,/id="competition-badge-label"/);
});

test('persistent Daily storage stays silent; denied storage surfaces a bilingual temporary warning',()=>{
  const {ui}=loadController('https://derabona.club/?daily=1',{exposeScope:true});
  for(const language of ['en','es']){
    const copy=ui.copyFor(language);
    assert.equal(ui.scopeText(true,language),'');
    assert.equal(ui.scopeText(false,language),copy.temporary);
  }
});

test('share payload aggregates all three players, is bilingual and spoiler-free',()=>{
  const {ui}=loadController();
  const forbidden=['Aron Winter','Ajax','Netherlands','Lazio','1986','Midfielder'];
  for(const language of ['en','es']){
    const text=ui.shareText({language,challengeNumber:42,correctCount:2,totalGuesses:5,totalHints:4,totalPoints:164,currentStreak:7});
    assert.match(text,language==='en'?/Derabona Daily #42/:/Derabona diaria #42/);
    assert.match(text,/2\/3/);
    assert.match(text,/5/);
    assert.match(text,/4/);
    assert.match(text,/164/);
    assert.match(text,/7/);
    assert.ok(text.endsWith('https://derabona.club/'));
    for(const clue of forbidden)assert.doesNotMatch(text,new RegExp(clue,'i'));
  }
  assert.match(ui.shareText({language:'en',challengeNumber:42,correctCount:2,totalGuesses:5,totalHints:1,totalPoints:164,currentStreak:1}),/💡 1 hint\b.*🔥 1 day\b/s);
  assert.match(ui.shareText({language:'es',challengeNumber:42,correctCount:2,totalGuesses:5,totalHints:1,totalPoints:164,currentStreak:1}),/💡 1 pista\b.*🔥 1 día\b/s);
});

test('Daily UI renders the current one of three and advances through the existing Next Player button',()=>{
  const source=block('daily-ui'),game=block('game-ui');
  assert.match(source,/a\.game\.roundIndex/);
  assert.match(source,/descriptor\.payloads\[a\.game\.roundIndex\]/);
  assert.match(source,/a\.options\[a\.game\.roundIndex\]/);
  assert.match(source,/progress[^\n]+max\s*=\s*3/);
  assert.match(source,/playerProgress|player progress/i);
  assert.match(source,/const next=.*persistence\.next/);
  assert.match(source,/daily-result-actions[^\n]+a\.game\.finished/);
  assert.match(game,/if\(DailyUI\.isDaily\(\)\)\{DailyUI\.next\(\);return;\}/);
});

test('controller source isolates daily mutations, preserves unlimited state, and owns rollover cleanup',()=>{
  const {source}=loadController();
  assert.match(source,/DailyChallenge\.createPersistence/);
  assert.match(source,/persistence\.(?:hint|guess)/);
  assert.doesNotMatch(source,/RankedUI\.mutate\(/);
  assert.doesNotMatch(source,/CareerGame\.(?:validate|playerAt)|eligibleRivals|\bPLAYERS\b/);
  assert.match(source,/setInterval\([^,]+,\s*30000\)/);
  assert.match(source,/clearInterval/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/addEventListener\('focus'/);
  assert.doesNotMatch(source,/confirm\(/);
  assert.doesNotMatch(source,/switchDaily|switchUnlimited|switchRanked/);
  assert.match(source,/render\(false,true\)/);
  assert.match(source,/else\{[^}]*globalThis\.render\(false,true\)/s,'returning to Unlimited invokes the main renderer rather than the Daily renderer');
  assert.match(source,/classList\.remove\([^)]*'game-loading'/,'daily render clears the initial loading shell without waiting for animation frames');
});

test('Daily elapsed time is tab-session scoped and separate from Unlimited',()=>{
  const source=block('daily-ui');
  assert.match(source,/const DAILY_CLOCK_KEY='derabona\.daily-clock\.v1'/);
  assert.match(source,/sessionStorage\.getItem\(DAILY_CLOCK_KEY\)/);
  assert.match(source,/sessionStorage\.setItem\(DAILY_CLOCK_KEY/);
  assert.match(source,/persistence\.guess\(option\.id,displayedDate,dailyClockStart\)/);
  assert.match(source,/startDailyClockFromInteraction=\(\)=>\{[^}]*dailyClockStart=Date\.now\(\)/,'consent-overlay time is excluded when play starts by interaction');
  assert.match(source,/derabona:analytics-consent-resolved[^;]*;if\(dailyClockWaitingForConsent\)[^}]*dailyClockStart=Date\.now\(\)[^}]*\}if\(!isDaily\(\)\)return/s,'Daily resolves its pending clock even if consent finishes while Unlimited is open');
  assert.match(source,/startGuestClockForMode\(\)/,'Unlimited starts its own clock only when that mode opens');
  assert.doesNotMatch(source,/elapsedMs:Date\.now\(\)-r\.startedAt/,'the visible clock must not include time while the tab was closed');
});

test('markup exposes accessible segmented controls, result actions, live share status, and rollover action',()=>{
  for(const id of ['daily-mode','unlimited-mode','daily-card','daily-share','daily-keep-playing','daily-share-status','daily-rollover','daily-load-new'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="daily-mode"[^>]+aria-pressed=/);
  assert.match(html,/id="unlimited-mode"[^>]+aria-pressed=/);
  // The completion badge sits on the title line, not beside the fact lines,
  // so it annotates the mode rather than the countdown.
  assert.match(html,/<span class="mode-head"><span id="daily-mode-label"[^>]*>[^<]*<\/span><span id="daily-mode-status"/);
  assert.match(html,/id="daily-mode-status"[^>]*aria-hidden="true"/,'the badge is decorative; the button aria-label carries the real state');
  assert.match(html,/id="daily-share-status"[^>]+aria-live="polite"/);
  assert.match(html,/\.mode-segmented button\{[^}]*min-height:44px/);
  assert.match(html,/\.page-nav a\{[^}]*min-height:44px/,'the visible leaderboard control keeps a 44px target');
  assert.match(html,/\.elapsed-time\{[^}]*min-height:44px/,'the visible elapsed-time control keeps a 44px target');
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(block('daily-ui'),/\.innerHTML\s*=/);
});

test('daily controller defers ranked synchronization until the first signed-in Unlimited choice',async()=>{
  const game=block('game-ui');
  assert.match(game,/DailyUI\.isDaily\(\)/);
  assert.match(game,/DailyUI\.updateURL\(language\)/);
  assert.match(game,/DailyUI\.render/);
  assert.match(game,/DailyUI\.init\(\)/);
  assert.match(game,/DailyUI\.isDaily\(\).*RankedUI\.update|RankedUI\.update\(\).*DailyUI\.isDaily\(\)/s);
  assert.match(block('account-service'),/unlimited/);

  const signed=loadModeSwitch();
  signed.ui.init();
  assert.deepEqual(signed.actions,[],'direct Daily initialization makes no ranked request');
  assert.equal(signed.ui.choose('unlimited'),true);
  await Promise.resolve();
  assert.deepEqual(signed.actions,['progress','start']);
  assert.equal(signed.ui.choose('unlimited'),true);
  await Promise.resolve();
  assert.deepEqual(signed.actions,['progress','start'],'a repeated Unlimited choice does not synchronize again');

  const guest=loadModeSwitch({signedIn:false});
  guest.ui.init();
  assert.equal(guest.ui.choose('unlimited'),true);
  assert.deepEqual(guest.actions,[]);
  assert.equal(guest.unlimitedRenders,1,'guest switching remains synchronous');
});
