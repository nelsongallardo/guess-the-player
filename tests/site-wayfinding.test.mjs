import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const controller=html.slice(html.indexOf('const PlayOverview=(()=>{'),html.indexOf("if(!AuthRoute.active){applyLanguage();render(false,true);RankedUI.boot();}"));
function harness(){
  const nodes=new Map(),calls=[],accepted=[],prompts=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',replaceChildren(){},append(){},focus(){},scrollIntoView(){},click(){},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id);};
  const session={user:{id:'account-a'}},daily={date:new Date().toISOString().slice(0,10),status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null};
  let response={profile:{nickname:'Otter-12345678',nicknamePrompted:true},progress:{totalPoints:7},daily,career:{status:'ready',competition:null}},request=async body=>body.action==='list'?{leagues:[]}:response,mode='daily';
  const context=vm.createContext({URL,URLSearchParams,Date,console,setInterval(){},language:'en',playActivated:false,AuthRoute:{active:false},location:{protocol:'http:',href:'http://localhost/index.html',search:''},history:{state:{},pushState(){},replaceState(){}},document:{documentElement:node('root'),querySelector:()=>node('nav')},window:{addEventListener(){}},$:node,el:(tag,text)=>({textContent:text,append(){}}),state:{competition:'all',finished:false},roundClockWaitingForMode:true,localStorage:{},DailyChallenge:{createPersistence:()=>({read:()=>({attempts:{}})})},copy:()=>({competitions:{all:'All Players'}}),Accounts:{session,configured:true,request:async body=>{calls.push(body.action);return request(body);}},RankedUI:{isAccountMode:()=>true,acceptOverview:data=>accepted.push(data),sync:async()=>calls.push('career-sync'),boot(){},update(){}},DailyRankedUI:{sync:async()=>calls.push('daily-sync')},NicknamePrompt:{maybeOpen:p=>prompts.push(p)},DailyUI:{localDocument:()=>null,isDaily:()=>mode==='daily',requestedMode:()=>mode,choose:m=>{mode=m;},prepare:()=>calls.push('prepare'),sanitizeURL:(m,l)=>'http://localhost/index.html?lang='+l+(m==='unlimited'?'&unlimited=1':''),updateURL(){}},startGuestClockForMode:()=>calls.push('guest-clock'),renderCompetitionOptions(){}});
  vm.runInContext(controller+'\nglobalThis.ui=PlayOverview;',context);
  return {context,calls,accepted,prompts,ui:context.ui,node,setResponse:value=>{response=value;},response,setRequest:fn=>{request=fn;}};
}
test('overview reads account and group status without crossing timed activation boundary',async()=>{
  const h=harness();await h.ui.load();assert.deepEqual(h.calls,['overview','list']);assert.equal(h.context.playActivated,false);assert.equal(h.accepted.length,1);assert.equal(h.node('play-daily-start').disabled,false);
  await h.ui.activate('daily');assert.deepEqual(h.calls,['overview','list','prepare','daily-sync']);assert.equal(h.context.playActivated,true);
});
test('mandatory nickname completion cannot be bypassed by programmatic Start',async()=>{
  const h=harness();h.response.profile.nicknamePrompted=false;await h.ui.load();await h.ui.activate('unlimited');assert.equal(h.context.playActivated,false);assert.ok(h.prompts.length>=1);assert.ok(!h.calls.includes('prepare')&&!h.calls.includes('career-sync'));
});
test('late overview response from previous identity cannot populate ready state',async()=>{
  const h=harness();let resolve;h.setRequest(()=>new Promise(r=>resolve=r));const pending=h.ui.load();h.ui.reset();h.context.Accounts.session={user:{id:'account-b'}};resolve(h.response);await pending;assert.equal(h.accepted.length,0);assert.equal(h.calls.includes('list'),false);assert.equal(h.context.playActivated,false);
});
test('overview failure leaves account actions disabled and exposes direct retry',async()=>{
  const h=harness();h.setRequest(async()=>{throw Error('UNAVAILABLE');});await h.ui.load();assert.equal(h.node('play-daily-start').disabled,true);assert.equal(h.node('play-retry').hidden,false);await h.ui.activate('daily');assert.equal(h.calls.length,1);assert.equal(h.context.playActivated,false);
});
