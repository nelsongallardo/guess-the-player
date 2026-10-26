import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=()=>{const m=html.match(/<script id="analytics">([\s\S]*?)<\/script>/);assert.ok(m,'Analytics module exists');return m[1];};
function harness({host='derabona.club',protocol='https:',stored=null,denied=false,networkOffline=false,dnt=false,search='',pathname='/',page='play',gpc=false,referrer='https://example.org/private?email=secret@example.com'}={}){
 const storage=new Map(stored?[['derabona.analytics-consent.v1',stored]]:[]),requests=[],sent=[];
 const node=()=>({hidden:true,textContent:'',setAttribute(){},addEventListener(){},close(){},showModal(){},open:false});
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const document={referrer,getElementById:get,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild:s=>requests.push(s)}};
 let config;const sdk={init:(token,c)=>{config=c;c.loaded(sdk);},opt_in_capturing(){},opt_out_capturing(){},capture:(event,properties)=>{const result=config.before_send({event,properties:{token:'public-project-token',distinct_id:'anonymous-test','$current_url':'https://derabona.club/?secret=yes',email:'never@example.com',...properties}});if(result)sent.push(result);}};
 const c=vm.createContext({document,location:{hostname:host,protocol,search,pathname},navigator:{doNotTrack:dnt?'1':null,globalPrivacyControl:gpc,onLine:!networkOffline},localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],removeItem:k=>storage.delete(k),getItem:k=>{if(denied)throw Error('denied');return storage.get(k)||null;},setItem:(k,v)=>{if(denied)throw Error('denied');storage.set(k,v);}},URL,URLSearchParams,console,setTimeout,clearTimeout,window:{posthog:sdk},Map,Set});
 vm.runInContext(source(),c);const api=vm.runInContext('Analytics',c);api.start(()=>({language:'es',page,competition:'all',player_id:'test',round_index:1}));
 return {api,requests,sent,storage,load:()=>requests[0].onload(),config:()=>config};
}
test('No PostHog request or capture before affirmative consent',()=>{const h=harness();h.api.capture('hint_used');assert.equal(h.requests.length,0);assert.equal(h.sent.length,0);assert.equal(h.api.getConsent(),null);});
test('Accept enables manual events with sanitization; withdrawal immediately stops events',()=>{const h=harness();h.api.setConsent(true);assert.equal(h.requests.length,1);h.load();assert.ok(h.sent.some(e=>e.event==='$pageview'));h.api.capture('hint_used',{hints:1,email:'no'});const e=h.sent.at(-1);assert.equal(e.properties.token,'public-project-token','SDK ingestion token must survive filtering');assert.equal(e.properties.email,undefined);assert.equal(e.properties.$current_url,'https://derabona.club/');assert.equal(e.properties.referrer_host,'example.org');const n=h.sent.length;h.api.setConsent(false);h.api.capture('hint_used');assert.equal(h.sent.length,n);assert.equal(h.api.getConsent(),'declined');});
test('Localhost and file play never load analytics even with prior consent',()=>{for(const params of [{host:'localhost'},{protocol:'file:'}]){const h=harness({...params,stored:'accepted'});h.api.setConsent(true);assert.equal(h.requests.length,0);}});
test('Browser privacy requests and offline network status suppress all analytics',()=>{for(const params of [{networkOffline:true},{dnt:true}]){const h=harness({...params,stored:'accepted'});h.api.capture('hint_used');assert.equal(h.requests.length,0);assert.equal(h.sent.length,0);}});
test('Revoking while SDK loads discards queued gameplay and pageview events',()=>{const h=harness();h.api.setConsent(true);h.api.capture('hint_used');h.api.setConsent(false);h.load();assert.equal(h.sent.length,0);});
test('Withdrawal cleans previous identity before the SDK has loaded',()=>{const h=harness({stored:'accepted'});const token=source().match(/const TOKEN='([^']+)'/)[1];h.storage.set('ph_'+token+'_posthog','previous-identity');h.api.setConsent(false);assert.equal(h.storage.has('ph_'+token+'_posthog'),false);h.load();assert.equal(h.sent.length,0);});
test('Denied storage does not break consent or gameplay integration',()=>{const h=harness({denied:true});h.api.setConsent(true);h.load();assert.ok(h.sent.length>0);h.api.setConsent(false);assert.equal(h.api.getConsent(),'declined');});
test('Privacy configuration disables automatic capture, recordings and persistent profiles',()=>{const h=harness({stored:'accepted'});h.load();const c=h.config();for(const key of ['autocapture','capture_pageview','capture_pageleave','capture_dead_clicks','capture_heatmaps','capture_performance','capture_exceptions','ip'])assert.equal(c[key],false,key);assert.equal(c.disable_session_recording,true);assert.equal(c.person_profiles,'never');assert.equal(c.persistence,'localStorage');assert.equal(c.opt_out_capturing_by_default,true);assert.equal(c.before_send({event:'$autocapture',properties:{}}),null);});
test('utm_source/utm_medium/utm_campaign survive filtering when present in the load URL; nothing else from the query string does',()=>{const h=harness({stored:'accepted',search:'?utm_source=reddit&utm_medium=social&utm_campaign=sorin_oct&secret=yes&daily=1'});h.load();const e=h.sent.at(-1);assert.equal(e.properties.utm_source,'reddit');assert.equal(e.properties.utm_medium,'social');assert.equal(e.properties.utm_campaign,'sorin_oct');assert.equal(e.properties.secret,undefined);assert.equal(e.properties.daily,undefined);assert.equal(e.properties.$current_url,'https://derabona.club/','full URL, including the UTM params themselves, is still never sent verbatim');h.api.capture('hint_used',{hints:1});const later=h.sent.at(-1);assert.equal(later.properties.utm_source,'reddit','captured once at load, reused for every later event in the tab session');});
test('A load URL with no UTM params sends no utm_* properties at all',()=>{const h=harness({stored:'accepted'});h.load();const e=h.sent.at(-1);assert.equal('utm_source' in e.properties,false);assert.equal('utm_medium' in e.properties,false);assert.equal('utm_campaign' in e.properties,false);});
test('PostHog source attribution uses only the current HTTP referrer hostname, never SDK URLs or stale sources',()=>{
 for(const [referrer,hostname] of [
  ['https://user:secret@www.google.com:8443/search?q=private#fragment','www.google.com'],
  ['http://t.co/private?token=secret','t.co'],
  ['',''],['not a URL',''],['file:///private/source.html',''],['android-app://com.instagram.android','']
 ]){
  const h=harness({stored:'accepted',referrer});h.load();
  for(const e of h.sent){
   assert.equal(e.properties.$referring_domain,hostname,referrer);
   assert.equal(e.properties.referrer_host,hostname,referrer);
  }
  const e=h.config().before_send({event:'$pageview',properties:{
   $referring_domain:'https://stale.example/private?email=secret',referrer_host:'stale.example',
   $referrer:referrer,$initial_referrer:referrer,$session_entry_referrer:referrer,
   $set:{$initial_referring_domain:'stale.example'}
  }});
  assert.equal(e.properties.$referring_domain,hostname);
  assert.equal(e.properties.referrer_host,hostname);
  for(const key of ['$referrer','$initial_referrer','$session_entry_referrer','$set'])assert.equal(key in e.properties,false,key);
 }
});

test('Board pageviews use a safe canonical pathname and never manufacture a viewed round',()=>{
 const h=harness({stored:'accepted',pathname:'/leaderboard.html',page:'groups',search:'?view=friends&league=private-id&code=secret&utm_source=reddit'});h.load();
 assert.deepEqual(h.sent.map(e=>e.event),['$pageview']);
 assert.equal(h.sent[0].properties.$current_url,'https://derabona.club/leaderboard.html');
 assert.equal(h.sent[0].properties.$pathname,'/leaderboard.html');
 assert.equal(h.sent[0].properties.page,'groups');
 assert.equal(h.sent[0].properties.league,undefined);
});
test('Gameplay context admits only known mode/access/page categories',()=>{
 const h=harness({stored:'accepted'});h.load();h.api.capture('answer_submitted',{mode:'daily',access:'ranked',page:'play',correct:true});
 assert.equal(h.sent.at(-1).properties.mode,'daily');assert.equal(h.sent.at(-1).properties.access,'ranked');
 h.api.capture('answer_submitted',{mode:'private-name',access:'user@example.com',page:'league-secret'});
 for(const key of ['mode','access','page'])assert.equal(h.sent.at(-1).properties[key],undefined);
});
test('GPC blocks analytics on board as well as play',()=>{
 const h=harness({stored:'accepted',pathname:'/leaderboard.html',page:'leaderboard',gpc:true});
 assert.equal(h.requests.length,0);assert.equal(h.sent.length,0);
});

test('Successful gameplay transitions capture once, with no historical or denied completion replay',()=>{
 const h=harness({stored:'accepted'});h.load();const before={key:'server-round-secret',mode:'daily',access:'ranked',player_id:'messi',round_index:1,status:'playing',guess_count:0,hints:0,points:0};
 const after={...before,status:'won',guess_count:1,points:75};
 h.api.recordMutation(before,after);h.api.recordMutation(before,after);
 assert.equal(h.sent.filter(e=>e.event==='answer_submitted').length,1);
 assert.equal(h.sent.filter(e=>e.event==='round_completed').length,1);
 const done=h.sent.find(e=>e.event==='round_completed');assert.equal(done.properties.mode,'daily');assert.equal(done.properties.access,'ranked');assert.equal(done.properties.points,75);assert.equal(done.properties.result,'won');assert.equal(done.properties.key,undefined);
 const count=h.sent.length;h.api.recordMutation(after,after);h.api.observeRound(after);h.api.observeRound(after);
 assert.equal(h.sent.filter(e=>e.event==='round_completed').length,1,'rendering a completed round never records completion');
 h.api.setConsent(false);h.api.recordMutation({...before,key:'other'},{...after,key:'other'});h.api.setConsent(true);
 assert.equal(h.sent.filter(e=>e.event==='round_completed').length,1,'denied actions never replay after consent');
});
test('Round observation follows the actual displayed mode and hints require an accepted increment',()=>{
 const h=harness({stored:'accepted'});h.load();const r={key:'daily:2026-10-26:0',mode:'daily',access:'guest',player_id:'messi',status:'playing',guess_count:0,hints:0};
 h.api.observeRound(r);h.api.observeRound(r);assert.equal(h.sent.filter(e=>e.event==='round_viewed'&&e.properties.mode==='daily').length,1);
 h.api.recordMutation(r,{...r,hints:1});h.api.recordMutation(r,{...r,hints:1});
 assert.equal(h.sent.filter(e=>e.event==='hint_used').length,1);
 h.api.recordMutation(r,{...r,key:'different',hints:2});assert.equal(h.sent.filter(e=>e.event==='hint_used').length,1,'mismatched round responses are not actions');
});
