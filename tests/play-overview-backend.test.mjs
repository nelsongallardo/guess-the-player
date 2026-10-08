// Real isolated PostgreSQL; only the Supabase Auth schema/roles are simulated.
// Covers fresh replay and upgrade from the exact prior dispatcher with live state.
import test, {before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const root=new URL('../',import.meta.url);
const pgBin=process.env.PG_BIN || (fs.existsSync('/opt/homebrew/opt/postgresql@17/bin/postgres')?'/opt/homebrew/opt/postgresql@17/bin':'');
const bin=cmd=>cmd==='psql'&&process.env.PG_CLIENT?process.env.PG_CLIENT:pgBin?path.join(pgBin,cmd):cmd;
let dir,running=false,database='postgres',upgrade;
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const args=()=>['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','55443','-U','postgres','-d',database];
const sql=text=>execFileSync(bin('psql'),[...args(),'-c',text],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const json=text=>JSON.parse(sql(text));
const rpc=(uid,body)=>json(`set role service_role; select public.ranked_game(${uid?quote(uid)+'::uuid':'null'},${quote(JSON.stringify(body))}::jsonb)`);
const mut=(action,extra={})=>({action,...extra,idempotencyKey:randomUUID()});
const user=()=>{const uid=randomUUID();sql(`insert into auth.users(id) values(${quote(uid)})`);return uid;};
const overview=uid=>rpc(uid,{action:'overview'});
const daily=uid=>rpc(uid,{action:'dailyProgress'});
const correct= (uid,index)=>sql(`select correct_option from ranked_private.daily_rounds where user_id=${quote(uid)} and date=(clock_timestamp() at time zone 'utc')::date and round_index=${index}`);
const finish=(uid,index)=>rpc(uid,mut('dailyAnswer',{roundIndex:index,expectedVersion:0,optionId:correct(uid,index)}));
const snapshot=()=>Object.fromEntries(['rounds','results','receipts','daily_rounds','daily_results','daily_streaks','daily_schedule'].map(table=>[table,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${table} x`)]));
const denied=(fn,code)=>assert.throws(fn,e=>String(e.stderr||e.message).includes(code));
const migrate=file=>execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${file}`,root).pathname],{stdio:'pipe',maxBuffer:64*1024*1024});
const migrations=fs.readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
const migration='202610080002_play_overview.sql';
const bootstrap=()=>sql(`create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public to anon,authenticated,service_role;`);
const assertPrivate=value=>{
  // Resolved player IDs in the established progress ledger are intentional.
  // No current/unstarted player identity or round payload may be exposed.
  assert.deepEqual(Object.keys(value).sort(),['career','daily','profile','progress']);
  assert.deepEqual(Object.keys(value.career).sort(),['competition','status']);
  assert.deepEqual(Object.keys(value.daily).sort(),['completed','correctCount','date','previous','status','totalPoints']);
  assert(!/"(?:playerId|options|guesses|clueCountry|cluePosition|startedAt|rounds|round)"/.test(JSON.stringify(value)));
};
before(()=>{
  execFileSync(bin('postgres'),['--version']);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'overview-pg-'));
  execFileSync(bin('initdb'),['-D',path.join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
  execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-l',path.join(dir,'postgres.log'),'-w','-o',`-k ${dir} -p 55443 -c listen_addresses='' -c fsync=off`,'start'],{stdio:'pipe'});running=true;
  sql('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  bootstrap();
  for(const file of migrations.filter(f=>f<migration))migrate(file);
  const uid=user();let career=rpc(uid,mut('start',{competition:'la-liga'})).round;
  const payload=mut('hint',{roundId:career.id,expectedVersion:career.version}),receipt=rpc(uid,payload);
  daily(uid);finish(uid,0);
  upgrade={uid,payload,receipt,snapshot:snapshot(),legacyDaily:daily(uid),legacyCareer:rpc(uid,{action:'progress'})};
  // During the red test run the absent migration leaves the old API in place.
  for(const file of migrations.filter(f=>f>=migration))migrate(file);
});
after(()=>{
  if(running)execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'pipe'});
  if(dir)fs.rmSync(dir,{recursive:true,force:true});
});
afterEach(()=>sql('delete from auth.users'));

test('overview upgrade preserves engaged clocks, versions, results and exact legacy receipts',()=>{
  assert.deepEqual(snapshot(),upgrade.snapshot);
  assert.deepEqual(rpc(upgrade.uid,upgrade.payload),upgrade.receipt);
  assert.deepEqual(daily(upgrade.uid),upgrade.legacyDaily);
  assert.deepEqual(rpc(upgrade.uid,{action:'progress'}),upgrade.legacyCareer);
  const view=overview(upgrade.uid);assertPrivate(view);
  assert.deepEqual(view.profile,upgrade.legacyCareer.profile);
  assert.deepEqual(view.progress,upgrade.legacyCareer.progress);
  assert.deepEqual(view.career,{status:'playing',competition:'la-liga'});
  assert.equal(view.daily.status,'playing');assert.equal(view.daily.completed,1);
  for(let i=0;i<3;i++)assert.deepEqual(overview(upgrade.uid),view);
  assert.deepEqual(snapshot(),upgrade.snapshot);
});

test('overview is ready before starting and repeated reads never create gameplay',()=>{
  const uid=user(),before=snapshot(),view=overview(uid);assertPrivate(view);
  assert.match(view.profile.nickname,/^[A-Za-z]+-[0-9a-f]{8}$/);
  assert.equal(view.profile.nicknamePrompted,false);
  assert.deepEqual(view.career,{status:'ready',competition:null});
  assert.deepEqual(view.daily,{date:sql("select ((clock_timestamp() at time zone 'utc')::date)::text"),status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null});
  assert.equal(view.progress.totalPoints,0);assert.deepEqual(view.progress.seenPlayerIds,[]);
  for(let i=0;i<3;i++)assert.deepEqual(overview(uid),view);
  assert.deepEqual(snapshot(),before);
});

test('overview summarizes partial and finished Daily outcomes without exposing round data',()=>{
  const uid=user();daily(uid);
  assert.equal(overview(uid).daily.status,'playing');assert.equal(overview(uid).daily.completed,0);
  finish(uid,0);
  let r=daily(uid).daily.rounds[1];const answer=correct(uid,1);
  for(const option of r.options.filter(o=>o.id!==answer).slice(0,3)){
    r=rpc(uid,mut('dailyAnswer',{roundIndex:1,expectedVersion:r.version,optionId:option.id})).daily.rounds[1];
  }
  const partial=overview(uid);assertPrivate(partial);
  assert.equal(partial.daily.status,'playing');assert.equal(partial.daily.completed,2);assert.equal(partial.daily.correctCount,1);
  finish(uid,2);
  const before=snapshot(),view=overview(uid);assertPrivate(view);
  assert.equal(view.daily.status,'finished');assert.equal(view.daily.completed,3);assert.equal(view.daily.correctCount,2);
  const points=Number(sql(`select sum(points) from ranked_private.daily_results where user_id=${quote(uid)}`));
  assert.equal(view.daily.totalPoints,points);assert.equal(view.progress.totalPoints,points);
  assert.equal(view.daily.previous,null);assert.deepEqual(snapshot(),before);
});

test('overview separates the latest completed previous UTC day from today and ignores incomplete days',()=>{
  const uid=user();daily(uid);
  // Dated fixtures exercise rollover without rewriting immutable results or waiting a day.
  sql(`insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at)
    select user_id,date-2,round_index,player_id,case when round_index=1 then 0 else 50 end,round_index<>1,clock_timestamp()-interval '2 days'
    from ranked_private.daily_rounds where user_id=${quote(uid)};
    insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at)
    select user_id,date-1,round_index,player_id,80,true,clock_timestamp()-interval '1 day'
    from ranked_private.daily_rounds where user_id=${quote(uid)} and round_index=0;
    delete from ranked_private.daily_rounds where user_id=${quote(uid)};`);
  const before=snapshot(),view=overview(uid);assertPrivate(view);
  assert.equal(view.daily.status,'ready');assert.equal(view.daily.completed,0);assert.equal(view.daily.totalPoints,0);
  assert.deepEqual(view.daily.previous,{date:sql("select ((clock_timestamp() at time zone 'utc')::date-2)::text"),totalPoints:100,correctCount:2});
  assert.deepEqual(snapshot(),before);
});

test('overview reports resolved and completed competitions while preserving old unattended career clocks',()=>{
  const uid=user();const r=rpc(uid,mut('start',{competition:'premier-league'})).round;
  sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '3 days' where id=${quote(r.id)}`);
  const before=snapshot();assert.equal(overview(uid).career.status,'playing');assert.deepEqual(snapshot(),before);
  const optionId=sql(`select correct_option from ranked_private.rounds where id=${quote(r.id)}`);
  rpc(uid,mut('answer',{roundId:r.id,expectedVersion:0,optionId}));
  assert.deepEqual(overview(uid).career,{status:'resolved',competition:'premier-league'});
  // Simulate exhaustion with valid historical rows, preserving current roster/reference data.
  sql(`with historical as (
    insert into ranked_private.rounds(user_id,player_id,ruleset,competition,options,correct_option,status,finished_at)
    select ${quote(uid)},m.player_id,'v2','premier-league',r.options,r.correct_option,'lost',clock_timestamp()
    from ranked_private.memberships m cross join ranked_private.rounds r
    where r.id=${quote(r.id)} and m.competition='premier-league' and m.player_id<>${quote(r.playerId)}
    returning id,player_id,finished_at)
    insert into ranked_private.results(user_id,player_id,ruleset,round_id,points,correct,finished_at)
    select ${quote(uid)},player_id,'v2',id,0,false,finished_at from historical;`);
  assert.deepEqual(overview(uid).career,{status:'completed',competition:'premier-league'});
});

test('overview requires verified identity, exact keys, private function grants and the existing rate budget',()=>{
  denied(()=>overview(null),'UNAUTHORIZED');denied(()=>overview(randomUUID()),'UNAUTHORIZED');
  const uid=user();
  for(const key of ['date','competition','userId','idempotencyKey','playerId'])denied(()=>rpc(uid,{action:'overview',[key]:'x'}),'INVALID_REQUEST');
  for(const role of ['anon','authenticated'])denied(()=>sql(`set role ${role}; select public.ranked_game(${quote(uid)},'{"action":"overview"}')`),'permission denied');
  for(const role of ['anon','authenticated','service_role']){
    assert.equal(sql(`select has_function_privilege('${role}','ranked_private.play_overview(uuid,date)','EXECUTE')`),'f');
    assert.equal(sql(`select has_function_privilege('${role}','ranked_private.ranked_game_before_overview(uuid,jsonb)','EXECUTE')`),'f');
  }
  overview(uid);
  sql(`update ranked_private.rate_limits set requests=120,window_start=clock_timestamp() where user_id=${quote(uid)}`);
  const before=snapshot();assert.equal(overview(uid).error.code,'RATE_LIMITED');assert.deepEqual(snapshot(),before);
});

test('fresh migration replay supports overview and preserves explicit legacy Daily starts',()=>{
  sql('create database overview_fresh');database='overview_fresh';
  try{
    bootstrap();for(const file of migrations)migrate(file);
    const uid=user(),before=snapshot();assert.equal(overview(uid).daily.status,'ready');assert.deepEqual(snapshot(),before);
    assert.equal(daily(uid).daily.rounds.length,3);assert.equal(overview(uid).daily.status,'playing');
  }finally{database='postgres';}
});
