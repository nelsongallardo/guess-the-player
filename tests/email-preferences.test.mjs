// Email reminder UI module (ADR 0030), executed for real in a vm sandbox
// with a minimal fake DOM and a scripted preference endpoint. Rendered
// layout, focus and real network/OAuth are covered by the browser suite
// (tests/email-preferences-checks.js) and are NOT verified here.
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const board=readFileSync(new URL('../leaderboard.html',import.meta.url),'utf8');
const block=html=>html.match(/<script id="email-reminders">([\s\S]*?)<\/script>/)?.[1];
const ES='Quiero recibir un recordatorio diario por email. Puedo darme de baja cuando quiera.';
const EN='Email me a daily reminder. I can unsubscribe at any time.';
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const IDS=['reminder-section','reminder-title','reminder-status','reminder-form','reminder-enabled','reminder-enabled-label','reminder-language','reminder-language-label',
  'reminder-detail','reminder-error','reminder-save','reminder-retry','nickname-prompt-reminder-row','nickname-prompt-reminder','nickname-prompt-reminder-label',
  'reminder-notice','reminder-notice-text','reminder-notice-open','reminder-notice-dismiss'];

function element(){
  const listeners={};
  return {hidden:true,textContent:'',checked:false,value:'',disabled:false,attrs:{},listeners,
    setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){(listeners[type]??=[]).push(fn);},
    fire(type){for(const fn of listeners[type]??[])fn({preventDefault(){}});}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<20;i++)await tick();}
const preference=(over={})=>({preference:{enabled:false,language:null,version:0,source:null,deliveryStatus:'disabled',suppressedReason:null,email:'friend@example.com',emailAvailable:true,...over}});

function harness({responses=[],language='es',configured=true}={}){
  const dom=Object.fromEntries(IDS.map(id=>[id,element()]));
  dom['reminder-language'].value='es';
  const env={uid:UID,language,calls:[],opened:0,queue:[...responses]};
  const context={document:{getElementById:id=>dom[id]??null},crypto:{randomUUID:(()=>{let n=0;return ()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;})()},console};
  vm.createContext(context);
  vm.runInContext(block(index)+';globalThis.EmailReminders=EmailReminders;',context);
  const api=context.EmailReminders;
  api.init({configured:()=>configured,userId:()=>env.uid,language:()=>env.language,openAccount:()=>{env.opened++;},
    request:(payload,owner)=>{env.calls.push({payload:JSON.parse(JSON.stringify(payload)),owner});
      const next=env.queue.shift();if(!next)return Promise.reject(Object.assign(Error('UNAVAILABLE'),{code:'UNAVAILABLE'}));
      return typeof next==='function'?next(payload):next instanceof Error?Promise.reject(next):Promise.resolve(next);}});
  return {api,dom,env};
}
const fail=code=>Object.assign(Error(code),{code});

test('both pages ship the identical module and Account section, with the exact bilingual consent copy',()=>{
  assert.ok(block(index));assert.equal(block(index),block(board),'component parity between index.html and leaderboard.html');
  for(const html of [index,board]){
    assert.match(html,/id="reminder-section"[^>]*hidden/);
    assert.ok(html.includes(ES));
  }
  assert.ok(block(index).includes(ES)&&block(index).includes(EN));
  // The first-sign-in checkbox is unchecked by default and hidden until an account is known.
  assert.match(index,/<label class="reminder-toggle" id="nickname-prompt-reminder-row" for="nickname-prompt-reminder" hidden><input id="nickname-prompt-reminder" type="checkbox">/);
  // No vendor contact from the browser, and no tracking of the choice.
  for(const html of [index,board]){
    assert.doesNotMatch(block(html),/emailoctopus\.com|fetch\(|posthog/i);
    assert.doesNotMatch(block(html),/Analytics\./);
    assert.doesNotMatch(block(html),/\.innerHTML\s*=/);
  }
});

test('nothing is requested for a signed-out visitor or portable play',async()=>{
  for(const [configured,uid] of [[false,UID],[true,null]]){
    const h=harness({configured});h.env.uid=uid;
    h.api.open();h.api.promptOpened();await h.api.promptCompleted(true);await settle();
    assert.deepEqual(h.env.calls,[]);assert.equal(h.dom['reminder-section'].hidden,true);
  }
});

test('an unchecked first-sign-in choice enrolls nothing; checked saves only after the nickname is submitted',async()=>{
  const h=harness({responses:[preference()]});
  h.api.promptOpened();await settle();
  assert.equal(h.dom['nickname-prompt-reminder-row'].hidden,false);
  assert.equal(h.dom['nickname-prompt-reminder'].checked,false,'unchecked by default');
  assert.deepEqual(h.env.calls.map(c=>c.payload.action),['get'],'opening the prompt only reads');
  await h.api.promptCompleted(false);await settle();
  assert.deepEqual(h.env.calls.map(c=>c.payload.action),['get'],'declining is a successful signup with no enrollment');

  const g=harness({responses:[preference(),preference({enabled:true,language:'es',version:1,source:'user_opt_in',deliveryStatus:'pending'})]});
  g.api.promptOpened();await settle();
  g.dom['nickname-prompt-reminder'].checked=true;
  assert.equal(g.env.calls.length,1,'checking the box is only local intent');
  await g.api.promptCompleted(true);await settle();
  assert.deepEqual(g.env.calls[1],{owner:UID,payload:{action:'set',enabled:true,language:'es',consentVersion:'daily-v1-20261009',expectedVersion:0,requestId:'00000000-0000-4000-8000-000000000001'}});
  assert.ok(!('email' in g.env.calls[1].payload)&&!('userId' in g.env.calls[1].payload));
  assert.equal(g.dom['reminder-notice'].hidden,true);
});

test('a failed reminder save after the nickname shows a dismissible notice and a retry in Account',async()=>{
  const h=harness({responses:[preference(),fail('UNAVAILABLE'),preference({enabled:true,language:'es',version:1,source:'user_opt_in',deliveryStatus:'pending'})]});
  h.api.promptOpened();await settle();
  await h.api.promptCompleted(true);await settle();
  assert.equal(h.dom['reminder-notice'].hidden,false);
  assert.match(h.dom['reminder-notice-text'].textContent,/No pudimos activar/);
  h.dom['reminder-notice-open'].fire('click');assert.equal(h.env.opened,1);assert.equal(h.dom['reminder-notice'].hidden,true);
  // Account keeps the intent (checked) and the error; Save retries with the same request ID.
  assert.equal(h.dom['reminder-enabled'].checked,true);
  assert.match(h.dom['reminder-error'].textContent,/No se pudo guardar/);
  assert.equal(h.dom['reminder-save'].disabled,false);
  h.dom['reminder-form'].fire('submit');await settle();
  assert.equal(h.env.calls[2].payload.requestId,h.env.calls[1].payload.requestId,'an uncertain attempt is retried with the same request ID');
  assert.match(h.dom['reminder-status'].textContent,/pendiente de confirmación/);
  assert.equal(h.dom['reminder-error'].textContent,'');
  // An unavailable read also leaves the explicit intent for Account.
  const u=harness({responses:[]});
  u.api.promptOpened();await settle();await u.api.promptCompleted(true);await settle();
  assert.equal(u.dom['reminder-notice'].hidden,false);
  assert.equal(u.dom['reminder-retry'].hidden,false);
  u.env.queue.push(preference());u.dom['reminder-retry'].fire('click');await settle();
  assert.equal(u.dom['reminder-enabled'].checked,true,'intent restored once the preference loads');
});

test('an already enrolled legacy account sees its state, never a new unchecked invitation',async()=>{
  const legacy=preference({enabled:true,language:'es',version:1,source:'owner_requested_existing_friends',deliveryStatus:'enabled'});
  const h=harness({responses:[legacy,legacy]});
  h.api.promptOpened();await settle();
  assert.equal(h.dom['nickname-prompt-reminder-row'].hidden,true);
  await h.api.promptCompleted(true);await settle();
  assert.deepEqual(h.env.calls.map(c=>c.payload.action),['get'],'no write for an already enrolled account');
  h.api.open();await settle();
  assert.equal(h.dom['reminder-enabled'].checked,true);
  assert.match(h.dom['reminder-status'].textContent,/Activados\. Te sumamos/);
  assert.doesNotMatch(h.dom['reminder-status'].textContent,/confirm|aceptaste|consent/i,'never claims the friend opted in through a form');
});

test('Account: read failure shows unavailable/retry, not a guessed "off"; suppression cannot be undone from the client',async()=>{
  const h=harness({responses:[]});
  h.api.open();await settle();
  assert.equal(h.dom['reminder-form'].hidden,true);assert.equal(h.dom['reminder-retry'].hidden,false);
  assert.match(h.dom['reminder-status'].textContent,/No pudimos cargar/);
  const s=harness({responses:[preference({version:3,deliveryStatus:'suppressed',suppressedReason:'bounced',language:'es'})]});
  s.api.open();await settle();
  assert.equal(s.dom['reminder-enabled'].disabled,true);
  assert.match(s.dom['reminder-status'].textContent,/No podemos enviar emails/);
});

test('UI language seeds a new enrollment but never rewrites a saved email language',async()=>{
  const h=harness({responses:[preference()],language:'en'});
  h.api.open();await settle();
  assert.equal(h.dom['reminder-language'].value,'en');
  assert.equal(h.dom['reminder-enabled-label'].textContent,EN);
  const saved=harness({responses:[preference({enabled:true,language:'es',version:2,source:'user_opt_in',deliveryStatus:'enabled'})],language:'en'});
  saved.api.open();await settle();
  saved.env.language='en';saved.api.translate();
  assert.equal(saved.dom['reminder-language'].value,'es');
  assert.equal(saved.dom['reminder-save'].disabled,true,'nothing to save after a game-language switch');
  assert.deepEqual(saved.env.calls.map(c=>c.payload.action),['get']);
});

test('a response for a previous account never updates the newly signed-in account',async()=>{
  let release;
  const h=harness({responses:[()=>new Promise(resolve=>{release=()=>resolve(preference({enabled:true,language:'en',version:4,deliveryStatus:'enabled',source:'user_opt_in'}));})]});
  h.api.open();await tick();
  h.env.uid=OTHER;h.api.resetIdentity();
  release();await settle();
  assert.equal(h.dom['reminder-status'].textContent,'');
  assert.equal(h.dom['reminder-enabled'].checked,false);
  h.env.queue.push(preference({version:0}));h.api.open();await settle();
  assert.equal(h.env.calls[1].owner,OTHER);
  assert.equal(h.dom['reminder-enabled'].checked,false);
});

test('disable and version conflicts: explicit save, server state reloaded, user choice kept',async()=>{
  const on=preference({enabled:true,language:'es',version:2,source:'user_opt_in',deliveryStatus:'enabled'});
  const h=harness({responses:[on,fail('VERSION_CONFLICT'),{...on,preference:{...on.preference,version:3}},preference({version:4,language:'es',source:'user_opt_in'})]});
  h.api.open();await settle();
  h.dom['reminder-enabled'].checked=false;h.dom['reminder-enabled'].fire('change');
  assert.equal(h.dom['reminder-save'].disabled,false);
  h.dom['reminder-form'].fire('submit');await settle();
  assert.deepEqual(h.env.calls[1].payload,{action:'set',enabled:false,expectedVersion:2,requestId:'00000000-0000-4000-8000-000000000001'});
  assert.match(h.dom['reminder-error'].textContent,/cambiaron en otro lugar/);
  assert.equal(h.dom['reminder-enabled'].checked,false,'the user choice survives the reload');
  h.dom['reminder-form'].fire('submit');await settle();
  assert.equal(h.env.calls[3].payload.expectedVersion,3);
  assert.notEqual(h.env.calls[3].payload.requestId,h.env.calls[1].payload.requestId);
  assert.match(h.dom['reminder-status'].textContent,/Desactivados/);
});
