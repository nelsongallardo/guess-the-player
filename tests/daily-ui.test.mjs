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

function loadModeSwitch({signedIn=true}={}){
  const actions=[],nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',dataset:{},setAttribute(){},focus(){},classList:{remove(){}}});return nodes.get(id);};
  const attempt={game:{rounds:[{status:'playing',guesses:[],hints:0}]}};
  const persistence={persistent:true,today:()=>({date:'2026-09-17'}),read:()=>({attempts:{'2026-09-17':attempt},stats:{currentStreak:0}})};
  const location=new URL('https://derabona.club/?daily=1'),history={replaceState(_a,_b,value){location.href=new URL(value,location.href).href;}};
  let unlimitedRenders=0;
  const context=vm.createContext({
    URL,URLSearchParams,location,history,navigator:{},localStorage:{},setInterval:()=>1,clearInterval(){},Date,JSON,confirm:()=>true,language:'en',
    Accounts:{session:signedIn?{user:{id:'A'}}:null},
    RankedUI:{isAccountMode:()=>signedIn,roundClock:()=>null,sync:async()=>{actions.push('progress','start');}},
    DailyChallenge:{createPersistence:()=>persistence},CareerGame:{roundAt:()=>({guesses:[],hints:0}),outcome:()=> 'playing'},state:{},
    document:{getElementById:node,addEventListener(){},documentElement:{classList:{remove(){}}}},window:{addEventListener(){}},
    render(){unlimitedRenders++;}
  });
  vm.runInContext(block('daily-ui')+'\nglobalThis.ui=DailyUI;',context);
  return {ui:context.ui,actions,get unlimitedRenders(){return unlimitedRenders;}};
}

test('direct daily entry and auth scrubbing preserve only lang plus daily',()=>{
  const auth=block('auth-callback');
  let replaced='';
  const context=vm.createContext({URL,URLSearchParams,location:{href:'https://derabona.club/?daily=1&lang=en&code=SECRET&state=PRIVATE&error_description=NOPE#access_token=TOKEN&refresh_token=REFRESH'},history:{replaceState(_a,_b,value){replaced=String(value);}}});
  vm.runInContext(auth+'\nglobalThis.callback=AuthCallback;',context);
  assert.equal(replaced,'https://derabona.club/?lang=en&daily=1');
  assert.equal(context.callback.code,'SECRET','PKCE code remains captured in memory after the visible URL is scrubbed');
  const {ui}=loadController('https://derabona.club/?daily=1&lang=en&code=x&state=y&account=1#access_token=z');
  assert.equal(ui.requestedMode(),'daily');
  assert.equal(ui.sanitizeURL('daily','en'),'https://derabona.club/?lang=en&daily=1');
  assert.equal(ui.sanitizeURL('unlimited','es'),'https://derabona.club/?lang=es');
});

test('initial Daily and Unlimited entries sanitize arbitrary URL state without breaking file paths',()=>{
  const cases=[
    ['https://derabona.club/?daily=1&lang=en&utm_source=x&account=1#private','https://derabona.club/?lang=en&daily=1'],
    ['https://derabona.club/play?lang=bogus&utm_source=x#private','https://derabona.club/play'],
    ['file:///Users/test/derabona/index.html?daily=1&lang=es&junk=x#private','file:///Users/test/derabona/index.html?lang=es&daily=1']
  ];
  for(const [url,expected] of cases){const {ui,location}=loadController(url);ui.updateURL(new URL(url).searchParams.get('lang'));assert.equal(location.href,expected);}
  assert.match(block('daily-ui'),/const init=\(\)=>\{\s*if\(initialized\)return;initialized=true;updateURL\(language\);/,'initial rendering sanitizes the visible URL');
});

test('visible bilingual copy covers mode, local status, rollover, and results',()=>{
  const {ui}=loadController();
  for(const language of ['en','es']){
    const copy=ui.copyFor(language);
    for(const key of ['daily','unlimited','challenge','streak','reset','localRanked','temporary','newDaily','loadDaily','share','keepPlaying','won','lost'])assert.ok(copy[key],`${language}.${key}`);
  }
  assert.equal(ui.copyFor('en').daily,'Daily Rabona');
  assert.equal(ui.copyFor('es').daily,'La Rabona del día');
  assert.match(ui.copyFor('en').localRanked,/browser\/device-local.*non-ranked/i);
  assert.match(ui.copyFor('es').localRanked,/navegador\/dispositivo.*sin clasificación/i);
});

test('denied Daily storage keeps local non-ranked scope plus bilingual temporary warning',()=>{
  const {ui}=loadController('https://derabona.club/?daily=1',{exposeScope:true});
  for(const language of ['en','es']){
    const copy=ui.copyFor(language),scope=ui.scopeText(false,language);
    assert.match(scope,new RegExp(copy.localRanked.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.match(scope,new RegExp(copy.temporary.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.equal(ui.scopeText(true,language),copy.localRanked);
  }
});

test('share payload is bilingual, spoiler-free, and URL-only after status',()=>{
  const {ui}=loadController();
  const forbidden=['Aron Winter','Ajax','Netherlands','Lazio','1986','Midfielder'];
  for(const [language,result] of [['en','won'],['es','lost']]){
    const text=ui.shareText({language,challengeNumber:42,result,guessCount:result==='won'?2:3,hints:1});
    assert.match(text,language==='en'?/Derabona Daily #42/:/Derabona diaria #42/);
    assert.match(text,result==='won'?/✅ 2\/3/:/❌ 3\/3/);
    assert.match(text,/🟩|⬛/);
    assert.ok(text.endsWith('https://derabona.club/?daily=1'));
    for(const clue of forbidden)assert.doesNotMatch(text,new RegExp(clue,'i'));
  }
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
  assert.match(source,/confirm\(/);
  assert.match(source,/render\(false,true\)/);
  assert.match(source,/else\{[^}]*globalThis\.render\(false,true\)/s,'returning to Unlimited invokes the main renderer rather than the Daily renderer');
  assert.match(source,/classList\.remove\([^)]*'game-loading'/,'daily render clears the initial loading shell without waiting for animation frames');
});

test('markup exposes accessible segmented controls, result actions, live share status, and rollover action',()=>{
  for(const id of ['daily-mode','unlimited-mode','daily-card','daily-share','daily-keep-playing','daily-share-status','daily-rollover','daily-load-new'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/id="daily-mode"[^>]+aria-pressed=/);
  assert.match(html,/id="unlimited-mode"[^>]+aria-pressed=/);
  assert.match(html,/id="daily-share-status"[^>]+aria-live="polite"/);
  assert.match(html,/\.mode-segmented button\{[^}]*min-height:44px/);
  assert.match(html,/\.page-nav a\{[^}]*min-height:44px/,'the visible leaderboard control keeps a 44px target');
  assert.match(html,/\.speed-meter\{[^}]*height:44px/,'the visible timer control keeps a 44px target');
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
  assert.match(block('account-service'),/daily/);

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
