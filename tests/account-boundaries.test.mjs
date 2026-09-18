import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1];
function service(url,stored=false){
  const calls=[];let session=stored?{user:{id:'A'},access_token:'A'}:null,listener;
  const c={URL,URLSearchParams,location:new URL(url),history:{replaceState(_a,_b,url){c.location=new URL(url);}},localStorage:{getItem:()=>stored?'stored':null},navigator:{onLine:true},setTimeout,clearTimeout,AbortController,fetch:async()=>{calls.push('fetch');return {ok:true,json:async()=>({})}},window:{supabase:{createClient:()=>({auth:{getSession:async()=>({data:{session}}),setSession:async()=>{calls.push('implicit');session={user:{id:'attacker'}};return {data:{session}}},exchangeCodeForSession:async()=>{calls.push('pkce');session={user:{id:'A'}};return {data:{session}}},onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}}}}})}},document:{createElement:()=>({remove(){}}),head:{append:s=>s.onload()}}};
  vm.createContext(c);vm.runInContext(block('auth-callback')+'\n'+block('account-service')+'\nglobalThis.api=Accounts;',c);
  return {c,calls,change(id){session={user:{id},access_token:id};listener?.('SIGNED_IN',session);}};
}
for(const fragment of ['access_token=ATTACKER&refresh_token=REFRESH','refresh_token=REFRESH'])test('unsolicited implicit callback scrubbed and not imported: '+fragment,async()=>{
  const {c,calls}=service('https://example.test/?lang=en#'+fragment);await c.api.init(()=>{});
  assert.equal(c.location.href,'https://example.test/?lang=en');assert.equal(c.api.session,null);assert.deepEqual(calls,[]);
});
test('PKCE code still exchanges after URL scrubbing',async()=>{const {c,calls}=service('https://example.test/?lang=en&code=LOCAL_CODE');await c.api.init(()=>{});assert.deepEqual(calls,['pkce']);assert.equal(c.location.search,'?lang=en');});
test('request cannot use B credentials for an operation bound to A',async()=>{const {c,calls,change}=service('https://example.test/',true);await c.api.init(()=>{});change('B');await assert.rejects(c.api.request({action:'enroll'},'ranked-game',false,'A'));assert.deepEqual(calls,[]);});
function ranked(daily=false,runTimers=false){
  let dailyMode=daily,modeEpoch=0;
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'all',dataset:{},addEventListener(){},replaceChildren(){},classList:{toggle(){}},querySelector(){return null;},focus(){},scrollIntoView(){},close(){}});return nodes.get(id);};
  const renders=[];
  const c={Accounts:{configured:true,hasStoredSession:()=>true,session:{user:{id:'A'}},init:async()=>c.Accounts.session,request:()=>new Promise(()=>{})},AuthCallback:{},DailyUI:{isDaily:()=>dailyMode,modeEpoch:()=>modeEpoch,choose(next){dailyMode=next==='daily';modeEpoch++;if(!dailyMode)c.ui.sync();return true;}},DailyRankedUI:{resetIdentity(){},sync(){}},language:'en',$:node,document:{addEventListener(){},activeElement:null},window:{addEventListener(){}},setTimeout:fn=>{if(runTimers)queueMicrotask(fn);return 0;},crypto:{randomUUID:()=> 'key'},GuestStorage:{clear(){}},seen:new Set(),defaultLifetime:()=>({}),CareerGame:{create:()=>({})},resetRoundClock(){},applyLanguage(){},render(){renders.push(dailyMode?'daily':'unlimited');},PLAYERS:[]};vm.createContext(c);
  let source=html.slice(html.indexOf('const RankedUI = (()=>{'),html.indexOf('\napplyLanguage();render(false,true);RankedUI.boot();'));
  const returnLine='return {update,render:renderRanked,competitions,isAccountMode,player,competition,mutate,boot,roundClock,sync};';
  // String.replace on a pattern that no longer matches RankedUI's actual
  // return statement fails SILENTLY (source comes back unchanged), which
  // previously let a real regression through undetected until CI: every
  // test below then failed with the unhelpful "c.ui.seed is not a
  // function" instead of pointing at this line. Keep this line's list of
  // exported names in sync with RankedUI's actual `return {...}` in
  // index.html whenever that changes.
  if(!source.includes(returnLine))throw new Error('RankedUI\'s return statement no longer matches this harness\'s extraction pattern - update returnLine in tests/account-boundaries.test.mjs to match index.html');
  source=source.replace(returnLine,`update=()=>{};renderRanked=()=>{};return {authChanged,sync,sendPending,boot,seed(m){mode=m;cloud={private:'A'};pending={action:'enroll',nickname:'A nickname',idempotencyKey:'A key'};pendingUserId='A';userId='A';epoch=7;},snapshot(){return {mode,cloud,pending,epoch,busy};}};`);
  vm.runInContext(source+'\nglobalThis.ui=RankedUI;',c);c.setDaily=value=>{if(dailyMode!==value){dailyMode=value;modeEpoch++;}};c.renders=renders;return c;
}
for(const mode of ['ranked','loading','unavailable','practice'])for(const event of ['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'])test(`identity change invalidates ${mode} on ${event}`,()=>{const c=ranked();c.ui.seed(mode);c.Accounts.session={user:{id:'B'}};c.ui.authChanged(event,c.Accounts.session);const s=c.ui.snapshot();assert.equal(s.cloud,null);assert.equal(s.pending,null);assert.ok(s.epoch>7);});
test('same-user refresh preserves ranked state and pending retry',()=>{const c=ranked();c.ui.seed('ranked');const before=c.ui.snapshot();c.ui.authChanged('TOKEN_REFRESHED',c.Accounts.session);assert.deepEqual(c.ui.snapshot(),before);});
test('late A mutation response cannot restore A after B event',async()=>{const c=ranked();c.ui.seed('ranked');let release;c.Accounts.request=()=>release?Promise.resolve({progress:{},round:null}):new Promise(r=>release=r);const work=c.ui.sendPending();c.Accounts.session={user:{id:'B'}};c.ui.authChanged('SIGNED_IN',c.Accounts.session);release({progress:{totalPoints:999},round:null});await work;assert.equal(c.ui.snapshot().cloud,null);assert.equal(c.ui.snapshot().pending,null);});
test('pending A mutation never starts with B current identity',async()=>{const c=ranked();c.ui.seed('unavailable');let calls=0;c.Accounts.request=async()=>{calls++;return {progress:{},round:null}};c.Accounts.session={user:{id:'B'}};await c.ui.sendPending();assert.equal(calls,0);});
test('signed-in boot starts ranked play only from Unlimited, never Daily',async()=>{
  for(const [daily,expected] of [[true,[]],[false,['progress','start']]]){
    const c=ranked(daily),actions=[];
    c.Accounts.request=async payload=>{actions.push(payload.action);return {progress:{competitionCounts:{all:{answered:0,total:1}}},round:payload.action==='start'?{id:'round'}:null,profile:{}};};
    await c.ui.boot();
    assert.deepEqual(actions,expected,daily?'Daily account boot':'Unlimited account boot');
  }
});
test('auth-state boot reconciliation is also automatic only in Unlimited',async()=>{
  for(const [daily,expected] of [[true,[]],[false,['progress','start']]]){
    const c=ranked(daily,true),actions=[];
    c.Accounts.request=async payload=>{actions.push(payload.action);return {progress:{competitionCounts:{all:{answered:0,total:1}}},round:payload.action==='start'?{id:'round'}:null,profile:{}};};
    c.Accounts.session={user:{id:'B'}};c.ui.authChanged('SIGNED_IN',c.Accounts.session);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(actions,expected,daily?'Daily auth callback':'Unlimited auth callback');
  }
});
test('Return to ranked play selects Unlimited before requesting ranked progress',async()=>{
  const c=ranked(true),actions=[];
  c.Accounts.request=async payload=>{actions.push({action:payload.action,daily:c.DailyUI.isDaily()});return {progress:{competitionCounts:{all:{answered:1,total:1}}},round:null,profile:{}};};
  await c.ui.boot();
  assert.deepEqual(actions,[],'direct signed-in Daily boot remains deferred');
  c.$('account-ranked').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.DailyUI.isDaily(),false,'account control performs a real Daily to Unlimited selection');
  assert.deepEqual(actions,[{action:'progress',daily:false}],'ranked progress cannot run while Daily remains selected');
});
test('late Unlimited sync cannot project or start ranked after returning to Daily',async()=>{
  const c=ranked(false),actions=[];
  let releaseProgress;
  c.Accounts.request=payload=>{
    actions.push(payload.action);
    if(actions.length===1)return new Promise(resolve=>{releaseProgress=resolve;});
    return Promise.resolve({progress:{competitionCounts:{all:{answered:0,total:1}}},round:payload.action==='start'?{id:'round'}:null,profile:{}});
  };
  const stale=c.ui.sync();
  assert.deepEqual(actions,['progress']);
  c.setDaily(true);
  releaseProgress({progress:{competitionCounts:{all:{answered:0,total:1}}},round:null,profile:{}});
  await stale;
  assert.deepEqual(actions,['progress'],'late no-round progress does not auto-start ranked');
  assert.equal(c.DailyUI.isDaily(),true);
  assert.equal(c.renders.at(-1),'daily','late sync leaves Daily rendered');

  c.setDaily(false);
  await c.ui.sync();
  assert.deepEqual(actions,['progress','progress','start'],'a later explicit Unlimited choice performs one clean progress to start sync');
});
test('Unlimited switch during stale progress defers exactly one fresh sync and start',async()=>{
  const c=ranked(false),actions=[];
  let releaseProgress;
  c.Accounts.request=payload=>{
    actions.push(payload.action);
    if(actions.length===1)return new Promise(resolve=>{releaseProgress=resolve;});
    return Promise.resolve({progress:{competitionCounts:{all:{answered:0,total:1}}},round:payload.action==='start'?{id:'round'}:null,profile:{}});
  };
  const stale=c.ui.sync();
  c.DailyUI.choose('daily');
  c.DailyUI.choose('unlimited');
  assert.deepEqual(actions,['progress'],'the explicit Unlimited sync waits for the busy request');
  releaseProgress({progress:{competitionCounts:{all:{answered:0,total:1}}},round:null,profile:{}});
  await stale;
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(actions,['progress','progress','start']);
  assert.equal(c.ui.snapshot().busy,false);
  assert.equal(c.ui.snapshot().mode,'ranked');
});
test('Unlimited switch during stale mutation retries the same pending operation once',async()=>{
  const c=ranked(false),actions=[];
  c.ui.seed('ranked');
  let releaseMutation;
  c.Accounts.request=payload=>{
    actions.push({...payload});
    if(actions.length===1)return new Promise(resolve=>{releaseMutation=resolve;});
    return Promise.resolve({progress:{competitionCounts:{all:{answered:1,total:1}}},round:null,profile:{nickname:'A nickname'}});
  };
  const stale=c.ui.sendPending();
  c.DailyUI.choose('daily');
  c.DailyUI.choose('unlimited');
  releaseMutation({progress:{competitionCounts:{all:{answered:1,total:1}}},round:null,profile:{nickname:'A nickname'}});
  await stale;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(actions.length,2);
  assert.deepEqual(actions.map(({action,idempotencyKey})=>({action,idempotencyKey})),[
    {action:'enroll',idempotencyKey:'A key'},
    {action:'enroll',idempotencyKey:'A key'}
  ]);
  assert.equal(c.ui.snapshot().pending,null);
  assert.equal(c.ui.snapshot().busy,false);
  assert.equal(c.ui.snapshot().mode,'ranked');
});
test('stale mutation settling while Daily stays selected does not retry',async()=>{
  const c=ranked(false),actions=[];
  c.ui.seed('ranked');
  let releaseMutation;
  c.Accounts.request=payload=>{actions.push(payload.action);return new Promise(resolve=>{releaseMutation=resolve;});};
  const stale=c.ui.sendPending();
  c.DailyUI.choose('daily');
  releaseMutation({progress:{competitionCounts:{all:{answered:1,total:1}}},round:null,profile:{nickname:'A nickname'}});
  await stale;
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(actions,['enroll']);
  assert.equal(c.DailyUI.isDaily(),true);
});
