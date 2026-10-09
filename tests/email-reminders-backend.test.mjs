// Daily email reminders (ADR 0030): real isolated PostgreSQL. The Supabase
// auth schema/roles are SIMULATED (auth.users carries the email columns the
// migration reads) and so is the reminder clock: reminder_private.utc_now()
// is replaced after migration by a version reading public.test_clock.
// No EmailOctopus request is made anywhere in this file: the vendor side is
// represented only by the outcomes the worker RPC is told about.
// PG_BIN=/path/to/postgres/bin node --test tests/email-reminders-backend.test.mjs
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { run as cohortCli } from '../scripts/email-reminders-cohort.mjs';
const asyncExec = promisify(execFile);
const root = new URL('../',import.meta.url);
const pgBin = process.env.PG_BIN || (fs.existsSync('/opt/homebrew/opt/postgresql@17/bin/postgres') ? '/opt/homebrew/opt/postgresql@17/bin' : '');
const bin = cmd => cmd === 'psql' && process.env.PG_CLIENT ? process.env.PG_CLIENT : pgBin ? path.join(pgBin,cmd) : cmd;
const PORT = '55447';
const NEW_MIGRATION = '202610090001_email_reminders.sql';
const CONSENT = 'daily-v1-20261009';
let dir, running = false, upgrade;
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const args = () => ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p',PORT,'-U','postgres','-d','postgres'];
const sql = text => execFileSync(bin('psql'),[...args(),'-c',text],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const json = text => JSON.parse(sql(text));
const asyncSQL = async text => (await asyncExec(bin('psql'),[...args(),'-c',text],{maxBuffer:8*1024*1024})).stdout.trim();
const migrate = file => execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${file}`,root).pathname],{stdio:'pipe',maxBuffer:64*1024*1024});
const asCode = e => ({error:{code:String(e.stderr||e.message).trim().split('\n')[0].replace(/^ERROR:\s+/,'')}});
const prefSQL = (uid,body) => `set role service_role; select public.email_preferences(${uid?quote(uid)+'::uuid':'null'},${quote(JSON.stringify(body))}::jsonb);`;
const P = (uid,body) => { try { return json(prefSQL(uid,body)); } catch(e) { return asCode(e); } };
const W = body => json(`set role service_role; select public.email_reminders_worker(${quote(JSON.stringify(body))}::jsonb);`);
const asyncW = async body => JSON.parse(await asyncSQL(`set role service_role; select public.email_reminders_worker(${quote(JSON.stringify(body))}::jsonb);`));
const A = body => { try { return json(`set role service_role; select public.email_reminders_admin(${quote(JSON.stringify(body))}::jsonb);`); } catch(e) { return asCode(e); } };
const code = r => r?.error?.code;
const key = email => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const get = uid => P(uid,{action:'get'}).preference;
const enable = (uid,extra={}) => P(uid,{action:'set',enabled:true,language:'es',consentVersion:CONSENT,expectedVersion:get(uid).version,requestId:randomUUID(),...extra});
const disable = uid => P(uid,{action:'set',enabled:false,expectedVersion:get(uid).version,requestId:randomUUID()});
const pref = uid => { const r=sql(`select to_jsonb(p) from reminder_private.preferences p where user_id=${quote(uid)}`); return r?JSON.parse(r):null; };
const jobs = (where='true') => json(`select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]'::jsonb) from reminder_private.sync_jobs j where ${where}`);
const setClock = iso => sql(iso ? `delete from public.test_clock; insert into public.test_clock values(${quote(iso)}::timestamptz);` : 'delete from public.test_clock;');
let counter = 0;
const user = ({email=`friend${++counter}@example.com`,verified=true,createdAt='2026-10-01T00:00:00Z',anonymous=false}={}) => {
  const id=randomUUID();
  sql(`insert into auth.users(id,email,email_confirmed_at,created_at,is_anonymous) values(${quote(id)},${email===null?'null':quote(email)},${verified?"'2026-09-01T00:00:00Z'":'null'},${quote(createdAt)},${anonymous})`);
  return id;
};
// Drive the worker as the Edge worker would after a vendor call.
const syncAll = (vendorStatus=job=>job.source==='owner_requested_existing_friends'?'subscribed':'pending') => {
  const claimed=W({action:'claimSync',limit:100}).jobs;
  for(const job of claimed){
    const status=job.kind==='subscribe'?vendorStatus(job):job.kind==='unsubscribe'?'unsubscribed':undefined;
    assert.equal(W({action:'completeSync',jobId:job.jobId,leaseToken:job.leaseToken,outcome:'done',...(status?{vendorStatus:status,contactId:'c-'+job.destinationKey.slice(0,12)}:{})}).accepted,true);
  }
  return claimed;
};
const event = (type,email,occurredAt,status) => ({id:randomUUID(),type,destinationKey:key(email),contactId:null,occurredAt,...(status?{status}:{})});
const player = () => sql('select player_id from ranked_private.daily_schedule where slot_index=0');
const addDailyResult = (uid,date,round) => {
  sql(`insert into ranked_private.accounts(user_id) values(${quote(uid)}) on conflict do nothing`);
  sql(`insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at) values(${quote(uid)},${quote(date)},${round},${quote(player())},50,true,${quote(date+'T12:00:00Z')})`);
};
const GAMEPLAY = ['accounts','rounds','results','daily_rounds','daily_results','daily_streaks','receipts','rate_limits'];
const gameplay = () => Object.fromEntries(GAMEPLAY.map(t=>[t,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x`)]));
const enableDelivery = () => assert.equal(A({action:'setDispatch',enabled:true,confirmation:'ENABLE_DAILY_REMINDERS'}).dispatchEnabled,true);
const subscribedUser = (email) => { const uid=user({email}); enable(uid); syncAll(()=>'subscribed'); assert.equal(get(uid).deliveryStatus,'enabled'); return uid; };
const send = () => { // one full worker dispatch pass; returns the queue calls it would make
  const calls=[];
  for(const {token} of W({action:'claimDispatch',limit:100}).items){
    const start=W({action:'startDispatch',token});
    if(start.send){calls.push(start);W({action:'finishDispatch',token,outcome:'accepted'});}
  }
  return calls;
};

before(() => {
  execFileSync(bin('postgres'),['--version']);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'reminders-pg-'));
  execFileSync(bin('initdb'),['-D',path.join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
  execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-l',path.join(dir,'postgres.log'),'-w','-o',`-k ${dir} -p ${PORT} -c listen_addresses='' -c fsync=off`,'start'],{stdio:'pipe'});
  running=true;
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
       create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
         created_at timestamptz not null default clock_timestamp(), is_anonymous boolean not null default false, deleted_at timestamptz);
       grant usage on schema public to anon,authenticated,service_role;`);
  const migrations=fs.readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(migrations.includes(NEW_MIGRATION));
  for(const f of migrations.filter(f=>f<NEW_MIGRATION))migrate(f);
  // Exact predecessor state: an account with a finished Daily round and a
  // league, before the reminder migration is applied.
  const uid=user({email:'predecessor@example.com'});
  const ranked=body=>json(`set role service_role; select public.ranked_game(${quote(uid)}::uuid,${quote(JSON.stringify(body))}::jsonb);`);
  const daily=ranked({action:'dailyProgress'}).daily.rounds[0];
  ranked({action:'dailyAnswer',roundIndex:0,expectedVersion:daily.version,idempotencyKey:randomUUID(),
    optionId:sql(`select correct_option from ranked_private.daily_rounds where user_id=${quote(uid)} and round_index=0`)});
  upgrade={uid,before:gameplay()};
  for(const f of migrations.filter(f=>f>=NEW_MIGRATION))migrate(f);
  upgrade.after=gameplay();
  sql(`create table public.test_clock(now timestamptz);
       create or replace function reminder_private.utc_now() returns timestamptz language sql volatile set search_path = '' as
       $$ select coalesce((select now from public.test_clock limit 1), clock_timestamp()) $$;`);
  console.log('Real PostgreSQL isolated cluster; Supabase auth schema/roles and the reminder clock are SIMULATED; no vendor or cloud services used.');
});
after(() => {
  if(running)execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'pipe'});
  if(dir)fs.rmSync(dir,{recursive:true,force:true});
});
afterEach(() => {
  setClock(null);
  sql(`delete from auth.users; delete from reminder_private.sync_jobs; delete from reminder_private.dispatches;
       delete from reminder_private.suppressed_destinations; delete from reminder_private.vendor_events;
       delete from reminder_private.cohort_members; delete from reminder_private.cohorts;
       update reminder_private.settings set dispatch_enabled=false;`);
});

test('upgrade from the current predecessor leaves gameplay untouched and exposes only service-role entry points',()=>{
  assert.deepEqual(upgrade.after,upgrade.before);
  assert.equal(get(upgrade.uid).deliveryStatus,'disabled');
  for(const t of ['settings','preferences','suppressed_destinations','cohorts','cohort_members','sync_jobs','dispatches','vendor_events','receipts','rate_limits']){
    assert.equal(sql(`select relrowsecurity from pg_class where oid='reminder_private.${t}'::regclass`),'t',t);
    for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`select has_table_privilege('${role}','reminder_private.${t}','select')`),'f',`${role} ${t}`);
  }
  for(const fn of ['public.email_preferences(uuid,jsonb)','public.email_reminders_worker(jsonb)','public.email_reminders_admin(jsonb)']){
    for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','${fn}','execute')`),'f',`${role} ${fn}`);
    assert.equal(sql(`select has_function_privilege('service_role','${fn}','execute')`),'t',fn);
  }
  assert.equal(sql(`select has_schema_privilege('authenticated','reminder_private','usage')`),'f');
  assert.equal(A({action:'getSettings'}).dispatchEnabled,false,'delivery ships inactive');
});

test('a new account defaults to off; reading the preference writes no preference or gameplay state',()=>{
  const uid=user();
  const before=gameplay();
  const p=get(uid);
  assert.deepEqual({enabled:p.enabled,version:p.version,source:p.source,deliveryStatus:p.deliveryStatus,emailAvailable:p.emailAvailable},
    {enabled:false,version:0,source:null,deliveryStatus:'disabled',emailAvailable:true});
  assert.equal(pref(uid),null);
  assert.deepEqual(jobs(),[]);
  assert.deepEqual(gameplay(),before);
});

test('explicit opt-in records consent wording version and server time; disable is versioned and idempotent',()=>{
  setClock('2026-10-09T10:00:00Z');
  const uid=user({email:'  Mixed.Case+tag@Example.COM '});
  const requestId=randomUUID();
  const body={action:'set',enabled:true,language:'en',consentVersion:CONSENT,expectedVersion:0,requestId};
  const first=P(uid,body);
  assert.deepEqual({e:first.preference.enabled,v:first.preference.version,s:first.preference.deliveryStatus,src:first.preference.source},
    {e:true,v:1,s:'pending',src:'user_opt_in'});
  assert.equal(first.preference.email,'mixed.case+tag@example.com','trim+lowercase only; plus tag and dots kept');
  const row=pref(uid);
  assert.equal(row.consent_version,CONSENT);assert.equal(Date.parse(row.consented_at),Date.parse('2026-10-09T10:00:00Z'));
  assert.equal(row.destination_key,key('mixed.case+tag@example.com'));
  assert.deepEqual(P(uid,body),first,'same requestId replays the stored response');
  assert.equal(code(P(uid,{...body,language:'es'})),'IDEMPOTENCY_CONFLICT');
  assert.equal(jobs().length,1,'replay queues no second job');
  assert.equal(code(P(uid,{...body,requestId:randomUUID()})),'VERSION_CONFLICT','stale expectedVersion');
  const off=disable(uid);
  assert.deepEqual([off.preference.enabled,off.preference.version,off.preference.deliveryStatus],[false,2,'disabled']);
  assert.deepEqual(jobs().map(j=>[j.kind,j.preference_version]),[['subscribe',1],['unsubscribe',2]]);
});

test('the endpoint accepts no address, identity, vendor, timestamp or status from the client',()=>{
  const uid=user();
  const base={action:'set',enabled:true,language:'es',consentVersion:CONSENT,expectedVersion:0,requestId:randomUUID()};
  for(const extra of [{email:'attacker@example.com'},{userId:uid},{verified_user_id:uid},{contactId:'x'},{consentedAt:'2020-01-01T00:00:00Z'},{status:'subscribed'},{source:'owner_requested_existing_friends'}])
    assert.equal(code(P(uid,{...base,...extra})),'INVALID_REQUEST',JSON.stringify(extra));
  for(const body of [{...base,consentVersion:undefined},{...base,consentVersion:'daily-v0'},{...base,language:'fr'},{...base,enabled:'true'},
    {...base,expectedVersion:-1},{...base,requestId:'x'},{action:'set',enabled:false,language:'es',expectedVersion:0,requestId:randomUUID()},{action:'subscribe'}])
    assert.equal(code(P(uid,JSON.parse(JSON.stringify(body)))),'INVALID_REQUEST',JSON.stringify(body));
  assert.equal(code(P(null,{action:'get'})),'UNAUTHORIZED');
  assert.equal(code(P(randomUUID(),{action:'get'})),'UNAUTHORIZED');
  assert.equal(pref(uid),null);
});

test('enabling needs a verified Auth address; one address cannot be enrolled by two accounts',()=>{
  const unverified=user({verified:false});
  assert.equal(get(unverified).emailAvailable,false);
  assert.equal(code(enable(unverified)),'EMAIL_UNAVAILABLE');
  const a=user({email:'same@example.com'}),b=user({email:'SAME@example.com'});
  assert.equal(enable(a).preference.enabled,true);
  assert.equal(code(enable(b)),'DESTINATION_IN_USE');
});

test('the frozen legacy cohort: dry run, digest-gated one-time apply, no later accounts, no overrides, no fabricated consent',async()=>{
  setClock('2026-10-09T12:00:00Z');
  const friends=[user({email:'a@example.com'}),user({email:'b@example.com'}),user({email:'B@Example.com '}),user({email:null}),user({email:'d@example.com',verified:false}),user({email:'e@example.com'}),user({email:'f@example.com'})];
  const anon=user({email:'anon@example.com',anonymous:true});
  const optedOut=friends[5];enable(optedOut);disable(optedOut);
  sql(`insert into reminder_private.suppressed_destinations values(${quote(key('f@example.com'))},'complained','2026-10-08T00:00:00Z')`);
  const deleted=user({email:'gone@example.com'});
  const log=[];const rpc=async(fn,body)=>fn==='email_reminders_admin'?A(body):W(body);
  const frozen=await cohortCli(['freeze','--cohort','existing-friends-20261009','--cutoff','2026-10-09T11:00:00Z'],{rpc,log:x=>log.push(x)});
  assert.equal(frozen.members,8,'every non-anonymous account created by the cutoff');
  assert.ok(!JSON.stringify(log).includes('@'),'aggregate output only, no addresses');
  assert.ok(!log.join('\n').includes(friends[0]),'no account identifiers in output');
  // A cutoff in the future cannot be frozen.
  assert.equal(code(A({action:'freezeCohort',cohortId:'later',cutoff:'2026-10-10T00:00:00Z'})),'INVALID_CUTOFF');
  sql(`delete from auth.users where id=${quote(deleted)}`);
  const late=user({email:'late@example.com',createdAt:'2026-10-09T11:30:00Z'});
  assert.equal(code(A({action:'freezeCohort',cohortId:'existing-friends-20261009',cutoff:'2026-10-09T11:30:00Z'})),'COHORT_CONFLICT');
  assert.equal(code(A({action:'freezeCohort',cohortId:'another',cutoff:'2026-10-09T11:30:00Z'})),'COHORT_CONFLICT','a single owner-requested cohort');
  const preview=await cohortCli(['preview','--cohort','existing-friends-20261009'],{rpc,log:()=>{}});
  assert.deepEqual(preview.preview,{frozen:8,deleted:1,enroll:2,duplicate_destination:1,no_verified_email:2,existing_preference:1,destination_suppressed:1});
  assert.equal(pref(friends[0]),null,'dry run writes nothing');
  await assert.rejects(cohortCli(['apply','--cohort','existing-friends-20261009'],{rpc,log:()=>{}}),/manifest/i,'apply requires the frozen manifest identity');
  assert.equal(code(A({action:'applyCohort',cohortId:'existing-friends-20261009',manifestDigest:'0'.repeat(64)})),'MANIFEST_MISMATCH');
  const dry=await cohortCli(['apply','--cohort','existing-friends-20261009','--manifest',frozen.manifestDigest],{rpc,log:()=>{}});
  assert.equal(dry.dryRun,true);assert.equal(pref(friends[0]),null,'apply without --execute is a dry run');
  const applied=await cohortCli(['apply','--cohort','existing-friends-20261009','--manifest',frozen.manifestDigest,'--execute'],{rpc,log:()=>{}});
  assert.deepEqual(applied.summary,preview.preview);
  const rows=json(`select jsonb_agg(to_jsonb(p)) from reminder_private.preferences p where source='owner_requested_existing_friends'`);
  assert.equal(rows.length,2);
  for(const r of rows){
    assert.deepEqual([r.enabled,r.language,r.cohort_id,r.consented_at,r.consent_version],[true,'es','existing-friends-20261009',null,null]);
    assert.ok(r.owner_enrolled_at);
  }
  assert.equal(pref(late),null,'an account created after the cutoff never enters');
  assert.equal(pref(anon),null);
  assert.equal(pref(optedOut).enabled,false,'an earlier opt-out is not overridden');
  // Rerun is a no-op that reports the original outcome.
  const again=A({action:'applyCohort',cohortId:'existing-friends-20261009',manifestDigest:frozen.manifestDigest});
  assert.deepEqual([again.rerun,again.summary],[true,applied.summary]);
  assert.equal(json(`select count(*) from reminder_private.preferences where source='owner_requested_existing_friends'`),2);
  // The schema itself refuses consent evidence on owner-requested rows.
  assert.throws(()=>sql(`update reminder_private.preferences set consented_at=now(),consent_version='${CONSENT}' where user_id=${quote(friends[0])}`),/check/);
  // Legacy rows read as enrolled-pending until the vendor reports subscribed.
  assert.deepEqual([get(friends[0]).source,get(friends[0]).deliveryStatus],['owner_requested_existing_friends','pending']);
  syncAll();
  assert.equal(get(friends[0]).deliveryStatus,'enabled');
});

test('legacy sync never overrides a vendor unsubscribe',()=>{
  setClock('2026-10-09T12:00:00Z');
  const uid=user({email:'friend@example.com'});
  const frozen=A({action:'freezeCohort',cohortId:'existing-friends-20261009',cutoff:'2026-10-09T11:00:00Z'});
  A({action:'applyCohort',cohortId:'existing-friends-20261009',manifestDigest:frozen.manifestDigest});
  syncAll(()=>'unsubscribed');
  const p=get(uid);
  assert.deepEqual([p.enabled,p.deliveryStatus,p.suppressedReason],[false,'disabled','unsubscribed']);
  assert.equal(sql(`select reason from reminder_private.suppressed_destinations where destination_key=${quote(key('friend@example.com'))}`),'unsubscribed');
});

test('sync outbox: stale versions are skipped, unsubscribe-before-sync wins, leases guard completion',()=>{
  setClock('2026-10-09T12:00:00Z');
  const uid=user();
  enable(uid);disable(uid);
  const claimed=W({action:'claimSync',limit:10}).jobs;
  assert.deepEqual(claimed.map(j=>j.kind),['unsubscribe'],'the superseded subscribe is skipped, not sent');
  assert.equal(jobs(`kind='subscribe'`)[0].outcome,'stale');
  assert.equal(jobs(`kind='subscribe'`)[0].email,null,'finished work drops the address');
  // An expired lease can be reclaimed; the old lease holder cannot complete.
  setClock('2026-10-09T12:10:00Z');
  const again=W({action:'claimSync',limit:10}).jobs;
  assert.equal(again.length,1);
  assert.equal(W({action:'completeSync',jobId:claimed[0].jobId,leaseToken:claimed[0].leaseToken,outcome:'done'}).accepted,false);
  assert.equal(W({action:'completeSync',jobId:again[0].jobId,leaseToken:again[0].leaseToken,outcome:'retry',detail:'vendor_unavailable'}).accepted,true);
  assert.deepEqual(W({action:'claimSync'}).jobs,[],'retry backs off');
  // Bounded attempts.
  for(let i=0;i<10;i++){
    setClock(new Date(Date.parse('2026-10-09T13:00:00Z')+i*7200e3).toISOString());
    for(const j of W({action:'claimSync'}).jobs)W({action:'completeSync',jobId:j.jobId,leaseToken:j.leaseToken,outcome:'retry',detail:'vendor_unavailable'});
  }
  assert.equal(jobs(`kind='unsubscribe'`)[0].status,'failed');
});

test('vendor events: hard suppression is permanent, old events never restore delivery, replays are ignored',()=>{
  setClock('2026-10-09T12:00:00Z');
  const uid=subscribedUser('x@example.com');
  const unsub=event('contact.unsubscribed','x@example.com','2026-10-09T12:30:00Z');
  setClock('2026-10-09T12:31:00Z');
  assert.equal(W({action:'vendorEvents',events:[unsub]}).processed,1);
  assert.deepEqual([get(uid).enabled,get(uid).suppressedReason],[false,'unsubscribed']);
  assert.equal(W({action:'vendorEvents',events:[unsub]}).processed,0,'replayed event id');
  // A stale "subscribed" update from before the unsubscribe cannot restore it.
  W({action:'vendorEvents',events:[event('contact.updated','x@example.com','2026-10-09T12:20:00Z','SUBSCRIBED')]});
  assert.equal(get(uid).deliveryStatus,'disabled');
  // Re-enrollment after a voluntary unsubscribe is a new explicit action and stays pending until the vendor confirms.
  setClock('2026-10-09T13:00:00Z');
  assert.equal(enable(uid).preference.deliveryStatus,'pending');
  // A late-delivered unsubscribe that happened before the new enrollment is ignored.
  W({action:'vendorEvents',events:[event('contact.unsubscribed','x@example.com','2026-10-09T12:45:00Z')]});
  assert.equal(get(uid).enabled,true);
  W({action:'vendorEvents',events:[event('contact.updated','x@example.com','2026-10-09T13:05:00Z','SUBSCRIBED')]});
  assert.equal(get(uid).deliveryStatus,'enabled','vendor confirmation after the new enrollment');
  // Bounces and complaints suppress regardless of order and cannot be cleared by the account.
  W({action:'vendorEvents',events:[event('contact.bounced','x@example.com','2026-10-01T00:00:00Z')]});
  assert.deepEqual([get(uid).enabled,get(uid).deliveryStatus,get(uid).suppressedReason],[false,'suppressed','bounced']);
  assert.equal(code(enable(uid)),'REMINDERS_SUPPRESSED');
  W({action:'vendorEvents',events:[event('contact.updated','x@example.com','2026-10-09T14:00:00Z','SUBSCRIBED')]});
  assert.equal(get(uid).deliveryStatus,'suppressed');
  // The same address on another account is also blocked.
  sql(`delete from auth.users where id=${quote(uid)}`);
  assert.equal(code(enable(user({email:'X@example.com'}))),'REMINDERS_SUPPRESSED');
});

test('dispatch is inactive by default, then sends at most once per destination and UTC date',()=>{
  setClock('2026-10-09T15:00:00Z');
  const a=subscribedUser('a@example.com'),b=subscribedUser('b@example.com');
  const pending=user({email:'p@example.com'});enable(pending);
  setClock('2026-10-09T16:05:00Z');
  assert.deepEqual(W({action:'claimDispatch'}),{dispatchEnabled:false,items:[]},'nothing is claimed while inactive');
  assert.deepEqual(W({action:'previewDispatch'}).counts,{eligible:2,vendor_not_subscribed:1});
  enableDelivery();
  setClock('2026-10-09T15:59:00Z');
  assert.deepEqual(W({action:'claimDispatch'}).items,[],'outside the window');
  setClock('2026-10-09T16:05:00Z');
  const calls=send();
  assert.equal(calls.length,2);
  assert.deepEqual(new Set(calls.map(c=>c.language)),new Set(['es']));
  assert.deepEqual(send(),[],'same date: never again');
  setClock('2026-10-09T19:55:00Z');
  assert.deepEqual(send(),[]);
  // Next UTC date, after the 24h vendor gap plus margin.
  setClock('2026-10-10T16:05:00Z');
  assert.deepEqual(send(),[],'inside the 24-hour vendor minimum gap');
  setClock('2026-10-10T16:10:00Z');
  assert.equal(send().length,2);
  assert.equal(json(`select count(*) from reminder_private.dispatches where status='accepted'`),4);
  void a;void b;
});

test('two concurrent workers claiming the same destination and date reach the queue once',async()=>{
  setClock('2026-10-09T15:00:00Z');
  subscribedUser('race@example.com');enableDelivery();
  setClock('2026-10-09T16:05:00Z');
  const results=await Promise.all([asyncW({action:'claimDispatch'}),asyncW({action:'claimDispatch'}),asyncW({action:'claimDispatch'})]);
  const tokens=results.flatMap(r=>r.items.map(i=>i.token));
  assert.equal(tokens.length,1);
  const starts=await Promise.all([asyncW({action:'startDispatch',token:tokens[0]}),asyncW({action:'startDispatch',token:tokens[0]})]);
  assert.equal(starts.filter(s=>s.send).length,1,'a claim starts once');
});

test('a crash after the vendor call becomes uncertain and is never retried; a crash before it is skipped',()=>{
  setClock('2026-10-09T15:00:00Z');
  subscribedUser('crash1@example.com');subscribedUser('crash2@example.com');enableDelivery();
  setClock('2026-10-09T16:05:00Z');
  const [one,two]=W({action:'claimDispatch',leaseSeconds:60}).items;
  assert.equal(W({action:'startDispatch',token:one.token}).send,true); // vendor call made, response lost
  setClock('2026-10-09T16:20:00Z');
  assert.deepEqual(W({action:'claimDispatch'}).items,[]);
  assert.deepEqual(json(`select jsonb_object_agg(token,status) from reminder_private.dispatches`),{[one.token]:'uncertain',[two.token]:'skipped'});
  assert.equal(W({action:'startDispatch',token:two.token}).send,false);
  // A definite late outcome may still be recorded for the uncertain one.
  assert.equal(W({action:'finishDispatch',token:one.token,outcome:'accepted'}).accepted,true);
  setClock('2026-10-10T16:05:00Z');
  assert.equal(send().length,1,'the skipped destination is eligible the next day');
  setClock('2026-10-10T16:25:00Z');
  assert.equal(send().length,1,'the uncertain one waits out the full gap from its start');
});

test('dispatch skips completed Dailies and rechecks eligibility before the vendor call, without touching gameplay',()=>{
  setClock('2026-10-09T15:00:00Z');
  const done=subscribedUser('done@example.com'),partial=subscribedUser('partial@example.com'),late=subscribedUser('late@example.com');
  for(const r of [0,1,2])addDailyResult(done,'2026-10-09',r);
  addDailyResult(partial,'2026-10-09',0);
  for(const r of [0,1,2])addDailyResult(late,'2026-10-08',r);
  enableDelivery();setClock('2026-10-09T16:05:00Z');
  const before=gameplay();
  const items=W({action:'claimDispatch'}).items;
  assert.equal(items.length,2,'completed today is skipped; a partial or yesterday-complete Daily is not');
  // Completion between claim and send is caught by the recheck.
  for(const r of [1,2])addDailyResult(partial,'2026-10-09',r);
  const after=gameplay();
  const starts=items.map(i=>W({action:'startDispatch',token:i.token}));
  assert.deepEqual(starts.map(s=>s.send).sort(),[false,true]);
  assert.equal(starts.find(s=>!s.send).reason,'daily_complete');
  assert.deepEqual(gameplay(),after,'claims, rechecks and preview write no gameplay state');
  assert.notDeepEqual(before,after);
});

test('deleted accounts and changed addresses are ineligible immediately and leave cleanup work',()=>{
  setClock('2026-10-09T15:00:00Z');
  const gone=subscribedUser('gone@example.com'),moved=subscribedUser('old@example.com');
  enableDelivery();setClock('2026-10-09T16:05:00Z');
  const [first]=W({action:'claimDispatch',limit:1}).items;
  sql(`delete from auth.users where id=${quote(gone)}`);
  sql(`update auth.users set email='new@example.com' where id=${quote(moved)}`);
  assert.deepEqual(W({action:'previewDispatch'}).counts,{email_changed:1});
  assert.equal(W({action:'startDispatch',token:first.token}).send,false);
  assert.deepEqual(send(),[]);
  const del=jobs(`kind='delete'`);
  assert.equal(del.length,1);assert.equal(del[0].email,'gone@example.com');assert.equal(del[0].user_id,null);
  assert.equal(json(`select count(*) from reminder_private.dispatches where user_id=${quote(gone)}`),0,'ledger detached from the deleted account');
  // The address change takes effect on the next reconcile/read: old destination retired, fresh enrollment needed.
  assert.equal(W({action:'reconcileAddresses'}).retired,1);
  const p=get(moved);
  assert.deepEqual([p.enabled,p.suppressedReason,p.email],[false,'address_changed','new@example.com']);
  assert.equal(jobs(`kind='retire'`)[0].email,'old@example.com');
  // Cleanup work survives a vendor outage and drops the address once done.
  const claimed=W({action:'claimSync'}).jobs;
  assert.deepEqual(claimed.map(j=>j.kind).sort(),['delete','retire']);
  for(const j of claimed)W({action:'completeSync',jobId:j.jobId,leaseToken:j.leaseToken,outcome:'retry',detail:'vendor_unavailable'});
  setClock('2026-10-09T18:00:00Z');
  for(const j of W({action:'claimSync'}).jobs)W({action:'completeSync',jobId:j.jobId,leaseToken:j.leaseToken,outcome:'done'});
  assert.deepEqual(jobs(`kind in ('delete','retire')`).map(j=>[j.status,j.email]),[['done',null],['done',null]]);
  assert.equal(enable(moved).preference.email,'new@example.com');
});
