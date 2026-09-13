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
function ranked(){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'all',dataset:{},addEventListener(){},replaceChildren(){},classList:{toggle(){}},querySelector(){return null;},focus(){},scrollIntoView(){}});return nodes.get(id);};
  const c={Accounts:{configured:true,hasStoredSession:()=>true,session:{user:{id:'A'}},request:()=>new Promise(()=>{})},AuthCallback:{},language:'en',$:node,document:{addEventListener(){},activeElement:null},window:{addEventListener(){}},setTimeout:()=>0,crypto:{randomUUID:()=> 'key'},GuestStorage:{clear(){}},seen:new Set(),defaultLifetime:()=>({}),CareerGame:{create:()=>({})},resetRoundClock(){},applyLanguage(){},render(){},PLAYERS:[]};vm.createContext(c);
  let source=html.slice(html.indexOf('const RankedUI = (()=>{'),html.indexOf('\napplyLanguage();render(false,true);RankedUI.boot();'));
  source=source.replace('return {update,render:renderRanked,competitions,isAccountMode,player,competition,mutate,boot};',`update=()=>{};renderRanked=()=>{};return {authChanged,sync,sendPending,board,seed(m){mode=m;cloud={private:'A'};pending={action:'enroll',nickname:'A nickname',idempotencyKey:'A key'};pendingUserId='A';userId='A';epoch=7;boardData={own:'A'};},snapshot(){return {mode,cloud,pending,epoch,boardData,busy};}};`);
  vm.runInContext(source+'\nglobalThis.ui=RankedUI;',c);return c;
}
for(const mode of ['ranked','loading','unavailable','practice'])for(const event of ['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'])test(`identity change invalidates ${mode} on ${event}`,()=>{const c=ranked();c.ui.seed(mode);c.Accounts.session={user:{id:'B'}};c.ui.authChanged(event,c.Accounts.session);const s=c.ui.snapshot();assert.equal(s.cloud,null);assert.equal(s.pending,null);assert.equal(s.boardData,null);assert.ok(s.epoch>7);});
test('same-user refresh preserves ranked state and pending retry',()=>{const c=ranked();c.ui.seed('ranked');const before=c.ui.snapshot();c.ui.authChanged('TOKEN_REFRESHED',c.Accounts.session);assert.deepEqual(c.ui.snapshot(),before);});
test('late A mutation response cannot restore A after B event',async()=>{const c=ranked();c.ui.seed('ranked');let release;c.Accounts.request=()=>release?Promise.resolve({progress:{},round:null}):new Promise(r=>release=r);const work=c.ui.sendPending();c.Accounts.session={user:{id:'B'}};c.ui.authChanged('SIGNED_IN',c.Accounts.session);release({progress:{totalPoints:999},round:null});await work;assert.equal(c.ui.snapshot().cloud,null);assert.equal(c.ui.snapshot().pending,null);});
test('pending A mutation never starts with B current identity',async()=>{const c=ranked();c.ui.seed('unavailable');let calls=0;c.Accounts.request=async()=>{calls++;return {progress:{},round:null}};c.Accounts.session={user:{id:'B'}};await c.ui.sendPending();assert.equal(calls,0);});
