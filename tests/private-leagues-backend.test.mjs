// Private Daily leagues: real isolated PostgreSQL. Supabase auth schema/roles
// are SIMULATED (as in ranked-backend.test.mjs) and so is the clock for the
// UTC boundary tests: ranked_private.utc_now() is replaced after migration by
// a version that reads public.test_clock when it holds a row, otherwise the
// real clock_timestamp(). SQL, constraints, locks and concurrent sessions are real.
// PG_BIN=/path/to/postgres/bin node --test tests/private-leagues-backend.test.mjs
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const asyncExec = promisify(execFile);
const root = new URL('../',import.meta.url);
const pgBin = process.env.PG_BIN || (fs.existsSync('/opt/homebrew/opt/postgresql@17/bin/postgres') ? '/opt/homebrew/opt/postgresql@17/bin' : '');
const bin = cmd => cmd === 'psql' && process.env.PG_CLIENT ? process.env.PG_CLIENT : pgBin ? path.join(pgBin,cmd) : cmd;
const PORT = '55441';
const NEW_MIGRATION = '202610080001_private_daily_leagues.sql';
let dir, running = false, upgrade;
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const args = () => ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p',PORT,'-U','postgres','-d','postgres'];
const sql = text => execFileSync(bin('psql'),[...args(),'-c',text],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const json = text => JSON.parse(sql(text));
const asyncSQL = async text => (await asyncExec(bin('psql'),[...args(),'-c',text],{maxBuffer:8*1024*1024})).stdout.trim();
const migrate = file => execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${file}`,root).pathname],{stdio:'pipe',maxBuffer:64*1024*1024});
const rankedSQL = (uid,body) => `set role service_role; select public.ranked_game(${quote(uid)}::uuid,${quote(JSON.stringify(body))}::jsonb);`;
const leagueSQL = (uid,body) => `set role service_role; select public.private_leagues(${uid?quote(uid)+'::uuid':'null'},${quote(JSON.stringify(body))}::jsonb);`;
const ranked = (uid,body) => json(rankedSQL(uid,body));
// Raised RPC errors surface like the Edge Function maps them: {error:{code}}.
// Real psql prefixes raised errors with "ERROR:  "; the Node psql stand-in does not.
const asCode = e => ({error:{code:String(e.stderr||e.message).trim().split('\n')[0].replace(/^ERROR:\s+/,'')}});
const L = (uid,body) => { try { return json(leagueSQL(uid,body)); } catch(e) { return asCode(e); } };
const asyncL = async (uid,body) => { try { return JSON.parse(await asyncSQL(leagueSQL(uid,body))); } catch(e) { return asCode(e); } };
const mut = (action,extra={}) => ({action,...extra,idempotencyKey:randomUUID()});
const code = r => r?.error?.code;
const snapshot = (tables,where='') => Object.fromEntries(tables.map(t=>[t,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x ${where}`)]));
const GAMEPLAY = ['rounds','results','daily_rounds','daily_results','daily_streaks','receipts'];
// A prompted account is the state after Google sign-in + the mandatory nickname prompt.
const user = (prompted=true) => {
  const id=randomUUID();sql(`insert into auth.users(id) values(${quote(id)});`);
  ranked(id,{action:'progress'});
  if(prompted)sql(`update ranked_private.accounts set nickname_prompted=true where user_id=${quote(id)}`);
  return id;
};
const users = n => sql(`with u as (insert into auth.users(id) select gen_random_uuid() from generate_series(1,${n}) returning id),
  a as (insert into ranked_private.accounts(user_id,nickname_prompted) select id,true from u returning user_id) select user_id from a`).split('\n');
const setClock = iso => sql(iso ? `delete from public.test_clock; insert into public.test_clock values(${quote(iso)}::timestamptz);` : 'delete from public.test_clock;');
const player = () => sql('select player_id from ranked_private.daily_schedule where slot_index=0');
const addResult = (uid,date,round,points,finishedAt) => sql(`insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at)
  values(${quote(uid)},${quote(date)},${round},${quote(player())},${points},${points>0},${quote(finishedAt)}::timestamptz)`);
const addRound = (uid,date,round,correct=randomUUID()) => sql(`insert into ranked_private.daily_rounds(user_id,date,round_index,slot_index,player_id,options,correct_option)
  values(${quote(uid)},${quote(date)},${round},0,${quote(player())},
  (select jsonb_agg(jsonb_build_object('id',id,'label','Option')) from (select ${quote(correct)}::uuid id union all select gen_random_uuid() from generate_series(1,9)) o),${quote(correct)})`);
const create = (uid,name='Los Pibes') => { const r=L(uid,mut('create',{name}));assert.ok(r.leagueId,JSON.stringify(r));return r.leagueId; };
const manage = (uid,lid) => L(uid,{action:'manage',leagueId:lid});
const tokenOf = (uid,lid) => manage(uid,lid).invite.token;
const join = (uid,token) => L(uid,mut('join',{token}));
const standings = (uid,lid,period='week',extra={}) => L(uid,{action:'standings',leagueId:lid,period,...extra});
const entry = (s,uid) => s.entries.find(e=>e.nickname===sql(`select nickname from ranked_private.accounts where user_id=${quote(uid)}`));
const memberId = (lid,uid) => sql(`select id from ranked_private.friend_league_members where league_id=${quote(lid)} and user_id=${quote(uid)}`);
const history = (uid,lid,extra={}) => L(uid,{action:'history',leagueId:lid,...extra});

before(() => {
  execFileSync(bin('postgres'),['--version']);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'leagues-pg-'));
  execFileSync(bin('initdb'),['-D',path.join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
  execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-l',path.join(dir,'postgres.log'),'-w','-o',`-k ${dir} -p ${PORT} -c listen_addresses='' -c fsync=off`,'start'],{stdio:'pipe'});
  running=true;
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
       create schema auth; create table auth.users(id uuid primary key);
       grant usage on schema public to anon,authenticated,service_role;`);
  const migrations=fs.readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(migrations.includes(NEW_MIGRATION));
  for(const f of migrations.filter(f=>f<NEW_MIGRATION))migrate(f);
  // Exact current predecessor: a finished career round, an engaged and a
  // finished Daily round, receipts, before the league migration is applied.
  const uid=user(false);
  const round=ranked(uid,mut('start',{competition:'all'})).round;
  const correct=sql(`select correct_option from ranked_private.rounds where id=${quote(round.id)}`);
  ranked(uid,mut('answer',{roundId:round.id,expectedVersion:round.version,optionId:correct}));
  const daily=ranked(uid,{action:'dailyProgress'}).daily.rounds[0];
  const payload=mut('dailyAnswer',{roundIndex:0,expectedVersion:daily.version,optionId:sql(`select correct_option from ranked_private.daily_rounds where user_id=${quote(uid)} and round_index=0`)});
  const response=ranked(uid,payload);
  const second=response.daily.rounds[1];
  ranked(uid,mut('dailyHint',{roundIndex:1,expectedVersion:second.version}));
  upgrade={uid,payload,response,before:snapshot([...GAMEPLAY,'accounts'])};
  for(const f of migrations.filter(f=>f>=NEW_MIGRATION))migrate(f);
  upgrade.after=snapshot([...GAMEPLAY,'accounts']);
  upgrade.replay=ranked(uid,payload);
  sql(`create table public.test_clock(now timestamptz);
       create or replace function ranked_private.utc_now() returns timestamptz language sql volatile set search_path = '' as
       $$ select coalesce((select now from public.test_clock limit 1), clock_timestamp()) $$;`);
  console.log('Real PostgreSQL isolated cluster; Supabase auth schema/roles and the league clock are SIMULATED; no cloud services used.');
});
after(() => {
  if(running)execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'pipe'});
  if(dir)fs.rmSync(dir,{recursive:true,force:true});
});
afterEach(() => { setClock(null); sql('delete from auth.users'); });

test('upgrade from the current predecessor preserves gameplay rows, aliases and exact receipt replay',()=>{
  assert.deepEqual(upgrade.after,upgrade.before);
  assert.deepEqual(upgrade.replay,upgrade.response);
  // The upgraded account can use leagues once its nickname prompt completes.
  assert.equal(code(L(upgrade.uid,mut('create',{name:'Upgraded'}))),'NICKNAME_REQUIRED');
  sql(`update ranked_private.accounts set nickname_prompted=true where user_id=${quote(upgrade.uid)}`);
  assert.ok(L(upgrade.uid,mut('create',{name:'Upgraded'})).leagueId);
  for(const t of ['friend_leagues','friend_league_members','friend_league_member_intervals','friend_league_invites','friend_league_weeks','friend_league_week_entries','friend_league_receipts','friend_league_rate_limits']){
    assert.equal(sql(`select relrowsecurity from pg_class where oid='ranked_private.${t}'::regclass`),'t',t);
    assert.equal(sql(`select has_table_privilege('service_role','ranked_private.${t}','select')`),'f',t);
  }
  assert.equal(sql(`select has_function_privilege('anon','public.private_leagues(uuid,jsonb)','execute')`),'f');
  assert.equal(sql(`select has_function_privilege('authenticated','public.private_leagues(uuid,jsonb)','execute')`),'f');
});

test('identity, field allowlists and names are enforced by the RPC itself',()=>{
  const uid=user();
  assert.equal(code(L(null,{action:'list'})),'UNAUTHORIZED');
  assert.equal(code(L(randomUUID(),{action:'list'})),'UNAUTHORIZED');
  for(const body of [{action:'list',userId:uid},{action:'standings',leagueId:randomUUID(),points:5},{action:'create',name:'Abc',idempotencyKey:randomUUID(),ownerId:uid},
    {action:'standings',leagueId:randomUUID(),limit:51},{action:'standings',leagueId:randomUUID(),period:'month'},{action:'standings',leagueId:'x'},
    {action:'history',leagueId:randomUUID(),offset:-1},{action:'preview',token:'short'},{action:'join',token:'a'.repeat(64)},{action:'award'},
    {action:'standings',leagueId:randomUUID(),date:'2026-10-08'},{action:'create',name:'Valid name',idempotencyKey:randomUUID(),trophies:1}])
    assert.equal(code(L(uid,body)),'INVALID_REQUEST',JSON.stringify(body));
  for(const name of ['ab',' Padded','Padded ','x'.repeat(41),'Bell\u0007s',42])
    assert.equal(code(L(uid,mut('create',{name}))),'INVALID_LEAGUE_NAME',JSON.stringify(name));
  assert.ok(L(uid,mut('create',{name:'Ñandúes ⚽ de la Boca'})).leagueId,'Unicode names accepted');
  assert.equal(code(L(user(false),mut('create',{name:'Unprompted'}))),'NICKNAME_REQUIRED');
});

test('owner, member, outsider and removed access; invite rotation; restore needs an explicit rejoin',()=>{
  const [owner,member,outsider]=[user(),user(),user()];
  const lid=create(owner),token=tokenOf(owner,lid);
  assert.match(token,/^[A-Za-z0-9_-]{64}$/);
  const unavailable=code(L(outsider,{action:'preview',token:'A'.repeat(64)}));
  assert.equal(unavailable,'INVITE_UNAVAILABLE');
  const preview=L(outsider,{action:'preview',token});
  assert.deepEqual(Object.keys(preview.league).sort(),['memberCount','name']);
  assert.equal(preview.member,false);assert.ok(!JSON.stringify(preview).includes(token));
  for(const action of ['standings','history','manage'])assert.equal(code(L(outsider,{action,leagueId:lid})),'LEAGUE_UNAVAILABLE',action);
  // Opening a link alone never changes membership.
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where league_id=${quote(lid)}`),'1');
  assert.deepEqual(join(member,token),{leagueId:lid,joined:true});
  const s=standings(member,lid);assert.equal(s.entries.length,2);assert.ok(!JSON.stringify(s).includes(token));
  assert.equal(code(L(member,{action:'manage',leagueId:lid})),'FORBIDDEN');
  assert.equal(code(L(member,mut('rotateInvite',{leagueId:lid,expectedVersion:0}))),'FORBIDDEN');
  assert.equal(L(member,{action:'preview',token}).league.id,lid,'existing members can open without another join');
  // Replace the invitation: old link dead immediately, memberships intact.
  assert.equal(code(L(owner,mut('rotateInvite',{leagueId:lid,expectedVersion:1}))),'VERSION_CONFLICT');
  assert.deepEqual(L(owner,mut('rotateInvite',{leagueId:lid,expectedVersion:0})),{leagueId:lid,version:1});
  const fresh=tokenOf(owner,lid);assert.notEqual(fresh,token);
  assert.equal(code(L(outsider,{action:'preview',token})),'INVITE_UNAVAILABLE');
  assert.equal(code(join(outsider,token)),'INVITE_UNAVAILABLE');
  assert.equal(standings(member,lid).entries.length,2);
  // Removal: immediate loss of access; both links refused exactly like invalid ones.
  const mid=memberId(lid,member);
  assert.deepEqual(L(owner,mut('remove',{leagueId:lid,memberId:mid,expectedVersion:1})),{leagueId:lid,version:2});
  for(const action of ['standings','history'])assert.equal(code(L(member,{action,leagueId:lid})),'LEAGUE_UNAVAILABLE');
  for(const t of [token,fresh]){assert.equal(code(L(member,{action:'preview',token:t})),'INVITE_UNAVAILABLE');assert.equal(code(join(member,t)),'INVITE_UNAVAILABLE');}
  assert.equal(code(L(owner,mut('remove',{leagueId:lid,memberId:memberId(lid,owner),expectedVersion:2}))),'MEMBER_NOT_FOUND','owner cannot remove self');
  assert.equal(code(L(owner,mut('restore',{leagueId:lid,memberId:randomUUID(),expectedVersion:2}))),'MEMBER_NOT_FOUND');
  assert.equal(manage(owner,lid).members.find(m=>m.memberId===mid).state,'removed');
  L(owner,mut('restore',{leagueId:lid,memberId:mid,expectedVersion:2}));
  assert.equal(code(standings(member,lid)),'LEAGUE_UNAVAILABLE','restore does not silently rejoin');
  assert.equal(L(member,{action:'preview',token:fresh}).member,false);
  assert.deepEqual(join(member,fresh),{leagueId:lid,joined:true});
  assert.equal(sql(`select count(*) from ranked_private.friend_league_member_intervals where member_id=${quote(mid)}`),'2','same identity, new interval');
  // Leaving; owner must delete instead.
  assert.equal(code(L(owner,mut('leave',{leagueId:lid}))),'OWNER_CANNOT_LEAVE');
  assert.deepEqual(L(member,mut('leave',{leagueId:lid})),{left:true});
  assert.equal(code(standings(member,lid)),'LEAGUE_UNAVAILABLE');
  L(owner,mut('rename',{leagueId:lid,name:'Renamed',expectedVersion:3}));
  assert.equal(standings(owner,lid).league.name,'Renamed');
  assert.deepEqual(L(owner,mut('delete',{leagueId:lid,expectedVersion:4})),{deleted:true});
  assert.equal(code(standings(owner,lid)),'LEAGUE_UNAVAILABLE');
  assert.equal(code(L(outsider,{action:'preview',token:fresh})),'INVITE_UNAVAILABLE');
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where league_id=${quote(lid)}`),'0');
});

test('mutation idempotency replays minimal outcomes and rechecks access',()=>{
  const [owner,member]=[user(),user()];
  const createBody=mut('create',{name:'Replay'});const first=L(owner,createBody);
  assert.deepEqual(L(owner,createBody),first);
  assert.equal(sql(`select count(*) from ranked_private.friend_leagues where owner_id=${quote(owner)}`),'1');
  assert.equal(code(L(owner,{...createBody,name:'Different'})),'IDEMPOTENCY_CONFLICT');
  const token=tokenOf(owner,first.leagueId),joinBody=mut('join',{token});
  assert.deepEqual(L(member,joinBody),{leagueId:first.leagueId,joined:true});
  assert.equal(sql(`select count(*)::text||':'||count(distinct response::text) from ranked_private.friend_league_receipts where response::text like '%${token}%'`),'0:0','no tokens in receipts');
  L(owner,mut('remove',{leagueId:first.leagueId,memberId:memberId(first.leagueId,member),expectedVersion:0}));
  assert.equal(code(L(member,joinBody)),'LEAGUE_UNAVAILABLE','removed member cannot recover through an old receipt');
  const leave=mut('leave',{leagueId:first.leagueId});
  assert.deepEqual(L(member,leave),{left:true});assert.deepEqual(L(member,leave),{left:true});
  const del=mut('delete',{leagueId:first.leagueId,expectedVersion:1});
  assert.deepEqual(L(owner,del),{deleted:true});assert.deepEqual(L(owner,del),{deleted:true},'deletion replay acknowledges');
});

test('caps are transactional: 10 leagues per account, 50 members per league, including concurrent joins',async()=>{
  const owner=user();
  const ids=Array.from({length:10},(_,i)=>create(owner,`League ${i+1}`));
  assert.equal(code(L(owner,mut('create',{name:'Eleventh'}))),'LEAGUE_LIMIT');
  const other=user(),otherLeague=create(other,'Other');
  assert.equal(code(join(owner,tokenOf(other,otherLeague))),'LEAGUE_LIMIT');
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where user_id=${quote(owner)}`),'10','no partial rows');
  const lid=ids[0],token=tokenOf(owner,lid),many=users(47);
  for(const uid of many)assert.ok(join(uid,token).joined);
  assert.equal(standings(owner,lid).total,48);
  const racers=users(3);
  const results=await Promise.all(racers.map(uid=>asyncL(uid,mut('join',{token}))));
  assert.deepEqual(results.map(r=>r.joined?'joined':code(r)).sort(),['LEAGUE_FULL','joined','joined']);
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where league_id=${quote(lid)} and state='active'`),'50');
  // One account racing to join several leagues at its cap boundary.
  const solo=user();for(let i=0;i<9;i++)create(solo,`Solo ${i}`);
  const targets=[user(),user(),user()].map(o=>{const l=create(o,'Target');return tokenOf(o,l);});
  const soloResults=await Promise.all(targets.map(t=>asyncL(solo,mut('join',{token:t}))));
  assert.equal(soloResults.filter(r=>r.joined).length,1);
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where user_id=${quote(solo)} and state='active'`),'10');
});

test('a join racing an invite rotation cannot use the revoked token once rotation commits',async()=>{
  const [owner,joiner]=[user(),user()];
  const lid=create(owner),token=tokenOf(owner,lid);
  const rotation=asyncSQL(`begin; ${leagueSQL(owner,mut('rotateInvite',{leagueId:lid,expectedVersion:0}))} select pg_sleep(1); commit;`);
  await new Promise(r=>setTimeout(r,350));
  const attempt=await asyncL(joiner,mut('join',{token}));
  await rotation;
  assert.equal(code(attempt),'INVITE_UNAVAILABLE');
  assert.equal(sql(`select count(*) from ranked_private.friend_league_members where league_id=${quote(lid)}`),'1');
});

test('strict post-join eligibility: zero start, same-day exclusion, partial days, absences and multiple leagues',()=>{
  setClock('2026-10-14T10:00:00Z'); // Wednesday
  const [owner,star,partial,loser,idle,started]=[user(),user(),user(),user(),user(),user()];
  // A high global scorer with earlier results and today's full Daily before joining.
  for(const [date,at] of [['2026-10-12','2026-10-12T08:00:00Z'],['2026-10-13','2026-10-13T08:00:00Z'],['2026-10-14','2026-10-14T08:00:00Z']])
    for(const round of [0,1,2])addResult(star,date,round,100,at.replace('08:00',`08:0${round}`));
  addResult(partial,'2026-10-14',0,90,'2026-10-14T09:00:00Z');
  const globalBefore=ranked(star,{action:'leaderboard',competition:'all',limit:100});
  const progressBefore=ranked(star,{action:'progress'}).progress.totalPoints;
  const resultsBefore=sql('select count(*) from ranked_private.daily_results');
  const lid=create(owner),token=tokenOf(owner,lid);
  const second=create(owner,'Second league'),secondToken=tokenOf(owner,second);
  setClock('2026-10-14T10:05:00Z');
  for(const uid of [star,partial,loser,idle,started])join(uid,token);
  join(partial,secondToken);
  addRound(started,'2026-10-14',0);
  addResult(partial,'2026-10-14',1,80,'2026-10-14T10:10:00Z');
  addResult(partial,'2026-10-14',2,70,'2026-10-14T10:20:00Z');
  addResult(loser,'2026-10-14',0,0,'2026-10-14T10:30:00Z');
  for(const round of [0,1,2])addResult(owner,'2026-10-14',round,[100,0,60][round],`2026-10-14T10:4${round}:00Z`);
  setClock('2026-10-14T12:00:00Z');
  const today=standings(owner,lid,'today');
  assert.deepEqual(today.range,{from:'2026-10-14',to:'2026-10-14',today:'2026-10-14'});
  const row=uid=>entry(today,uid);
  assert.deepEqual([row(partial).rank,row(partial).points,row(partial).results,row(partial).played,row(partial).status],[2,150,2,3,'finished'],'partial eligibility: only post-join rounds');
  assert.deepEqual([row(owner).rank,row(owner).points,row(owner).status],[1,160,'finished']);
  assert.deepEqual([row(loser).rank,row(loser).points,row(loser).results,row(loser).status],[3,0,1,'inProgress'],'zero-point loss ranks');
  assert.deepEqual([row(star).rank,row(star).points,row(star).status],[null,0,'finishedBeforeJoin'],'finished before joining · 0 league points');
  assert.deepEqual([row(idle).rank,row(idle).status],[null,'notPlayed']);
  assert.deepEqual([row(started).rank,row(started).status],[null,'inProgress'],'open Daily rows read as in progress without contents');
  assert.ok(!JSON.stringify(today).match(/options|guesses|correct|hints|email|user_?id/i),'no answers or identities exposed');
  const week=standings(owner,lid,'week');
  assert.equal(week.range.from,'2026-10-14','shortened first week starts at creation');
  assert.equal(entry(week,star).points,0,'global total never carries in');
  assert.equal(entry(week,owner).completedDays,1);assert.equal(entry(week,partial).completedDays,0,'joining day with partial eligibility is not a completed day');
  assert.equal(week.own.me,true);assert.equal(week.own.rank,1);
  // Same stored result appears independently in a second league.
  assert.equal(entry(standings(partial,second,'today'),partial).points,150);
  assert.equal(sql('select count(*) from ranked_private.daily_results'),String(Number(resultsBefore)+6));
  assert.deepEqual(ranked(star,{action:'leaderboard',competition:'all',limit:100}).own,globalBefore.own,'global rank of the star unchanged by leagues');
  assert.equal(ranked(star,{action:'progress'}).progress.totalPoints,progressBefore);
  // Leave Thursday, play while absent, rejoin Friday: no backfill, earlier points kept.
  setClock('2026-10-15T09:00:00Z');
  L(partial,mut('leave',{leagueId:lid}));
  addResult(partial,'2026-10-15',0,100,'2026-10-15T09:30:00Z');
  let w=standings(owner,lid,'week');
  assert.deepEqual([entry(w,partial).points,entry(w,partial).former],[150,true],'former member keeps earned week points, labelled');
  setClock('2026-10-16T09:00:00Z');
  join(partial,token);
  addResult(partial,'2026-10-16',0,60,'2026-10-16T09:10:00Z');
  w=standings(owner,lid,'week');
  assert.deepEqual([entry(w,partial).points,entry(w,partial).results,entry(w,partial).former],[210,3,false]);
  assert.equal(entry(standings(partial,second,'week'),partial).points,150+100+60,'the other league kept counting throughout');
  // Pagination is bounded and keeps the own projection.
  const page=standings(owner,lid,'week',{limit:1,offset:1});
  assert.equal(page.entries.length,1);assert.equal(page.own.me,true);assert.equal(page.total,6);
});

test('weekly finalization: shared and zero-point wins, empty and shortened weeks, bounded catch-up, immutable history',async()=>{
  setClock('2026-10-14T10:00:00Z');
  const [a,b,c,d]=[user(),user(),user(),user()];
  const lid=create(a),token=tokenOf(a,lid);
  for(const uid of [b,c,d])join(uid,token);
  addResult(a,'2026-10-15',0,100,'2026-10-15T10:00:00Z');addResult(a,'2026-10-16',0,100,'2026-10-16T10:00:00Z');
  addResult(b,'2026-10-18',0,100,'2026-10-18T10:00:00Z');addResult(b,'2026-10-18',1,100,'2026-10-18T10:01:00Z');
  addResult(c,'2026-10-18',0,0,'2026-10-18T23:00:00Z');
  setClock('2026-10-18T23:59:00Z');
  let s=standings(a,lid);
  assert.equal(entry(s,a).rank,1);assert.equal(entry(s,b).rank,1);assert.equal(entry(s,a).trophies,0,'current leaders get no premature trophy');
  assert.equal(history(a,lid).total,0);
  setClock('2026-10-19T00:00:01Z');
  s=standings(a,lid);
  assert.equal(s.pending,false);
  assert.ok(s.entries.every(e=>e.points===0),'everyone restarts at zero on Monday');
  assert.deepEqual([entry(s,a).trophies,entry(s,b).trophies,entry(s,c).trophies],[1,1,0]);
  let h=history(a,lid);
  assert.equal(h.total,1);
  assert.deepEqual({...h.weeks[0],winners:h.weeks[0].winners.length},{weekStart:'2026-10-12',startsOn:'2026-10-14',endsOn:'2026-10-18',participants:3,winningPoints:200,shared:true,winners:2});
  const wins=L(b,{action:'memberWins',leagueId:lid,memberId:memberId(lid,a)});
  assert.deepEqual(wins.weeks,[{weekStart:'2026-10-12',startsOn:'2026-10-14',endsOn:'2026-10-18',points:200,shared:true}]);
  assert.equal(code(L(b,{action:'memberWins',leagueId:lid,memberId:randomUUID()})),'MEMBER_NOT_FOUND');
  // Zero-point tie week, then an empty week.
  addResult(c,'2026-10-20',0,0,'2026-10-20T10:00:00Z');addResult(d,'2026-10-21',0,0,'2026-10-21T10:00:00Z');
  setClock('2026-11-02T00:00:01Z');
  s=standings(a,lid);
  h=history(a,lid);
  assert.deepEqual(h.weeks.map(w=>[w.weekStart,w.participants,w.winningPoints,w.winners.length]),[['2026-10-26',0,null,0],['2026-10-19',2,0,2],['2026-10-12',3,200,2]]);
  assert.deepEqual([entry(s,c).trophies,entry(s,d).trophies],[1,1]);
  // Ordinary departures, removals, renames and rejoins never rewrite history.
  const frozen=snapshot(['friend_league_weeks','friend_league_week_entries'],`where league_id=${quote(lid)}`);
  L(a,mut('remove',{leagueId:lid,memberId:memberId(lid,b),expectedVersion:0}));
  L(c,mut('leave',{leagueId:lid}));
  L(a,mut('rename',{leagueId:lid,name:'New name',expectedVersion:1}));
  L(a,mut('restore',{leagueId:lid,memberId:memberId(lid,b),expectedVersion:2}));join(b,token);
  assert.deepEqual(snapshot(['friend_league_weeks','friend_league_week_entries'],`where league_id=${quote(lid)}`),frozen);
  assert.throws(()=>sql(`update ranked_private.friend_league_week_entries set winner=false where league_id=${quote(lid)}`),/RESULT_IMMUTABLE/);
  // Many skipped weeks: bounded batches of 8 with a pending flag.
  setClock('2027-03-01T00:00:01Z');
  const batches=[];
  do { s=standings(a,lid); batches.push(s.pending); } while(s.pending && batches.length<10);
  assert.deepEqual(batches,[true,true,false]);
  assert.equal(history(a,lid).total,3+17);
  assert.equal(history(a,lid,{limit:50}).weeks[0].weekStart,'2027-02-22');
  assert.equal(entry(standings(a,lid),a).trophies,1,'trophies are league-specific and stable');
  // Concurrent finalization awards once.
  const e=user(),other=create(e,'Concurrent');
  addResult(e,'2027-03-02',0,40,'2027-03-02T10:00:00Z');
  setClock('2027-03-08T00:00:01Z');
  await Promise.all(Array.from({length:5},()=>asyncL(e,{action:'standings',leagueId:other})));
  assert.equal(sql(`select count(*)||'/'||sum(case when winner then 1 else 0 end) from ranked_private.friend_league_week_entries where league_id=${quote(other)}`),'1/1');
  assert.equal(entry(standings(e,other),e).trophies,1);
  assert.equal(sql(`select count(*) from ranked_private.friend_league_weeks where league_id=${quote(other)}`),'1');
  assert.deepEqual([entry(standings(a,lid),a).trophies,entry(standings(a,lid),d).trophies],[1,1],'wins in another league do not leak in');
});

test('Daily cutoff barrier: in-flight writes are included, writes that waited past Monday are rejected',async()=>{
  const sunday='2026-10-18',key=sql(`select ranked_private.week_lock_key(date '2026-10-12')`);
  setClock('2026-10-14T10:00:00Z');
  const [owner,player2]=[user(),user()];
  const lid=create(owner);join(player2,tokenOf(owner,lid));
  // (a) A Daily answer holding the shared lock is waited for and counted.
  setClock('2026-10-18T23:59:50Z');
  const correct=randomUUID();addRound(player2,sunday,0,correct);
  const answer=asyncSQL(`begin; ${rankedSQL(player2,mut('dailyAnswer',{roundIndex:0,expectedVersion:0,optionId:correct}))} select pg_sleep(1.5); commit;`);
  await new Promise(r=>setTimeout(r,400));
  setClock('2026-10-19T00:00:05Z');
  const started=Date.now();
  const s=await asyncL(owner,{action:'standings',leagueId:lid});
  await answer;
  assert.ok(Date.now()-started>500,'finalization waited for the in-flight Daily write');
  const won=sql(`select points from ranked_private.daily_results where user_id=${quote(player2)} and date='${sunday}'`);
  assert.ok(Number(won)>0);
  assert.equal(sql(`select points||':'||winner from ranked_private.friend_league_week_entries e join ranked_private.friend_league_members m on m.id=e.member_id where m.user_id=${quote(player2)}`),`${won}:true`);
  assert.equal(entry(s,player2).trophies,1);
  // (b) A write still waiting when the week rolls over is rejected, not back-dated.
  setClock('2026-10-25T23:59:58Z');
  const late=randomUUID();addRound(player2,'2026-10-25',0,late);
  const key2=sql(`select ranked_private.week_lock_key(date '2026-10-19')`);
  const holder=asyncSQL(`begin; select pg_advisory_xact_lock(20261008,${key2}); select pg_sleep(1.2); commit;`);
  await new Promise(r=>setTimeout(r,250));
  const waiting=asyncSQL(rankedSQL(player2,mut('dailyAnswer',{roundIndex:0,expectedVersion:0,optionId:late})));
  await new Promise(r=>setTimeout(r,300));
  setClock('2026-10-26T00:00:01Z');
  await holder;
  assert.equal(JSON.parse(await waiting).error.code,'ROUND_NOT_FOUND');
  assert.equal(sql(`select count(*) from ranked_private.daily_results where user_id=${quote(player2)} and date='2026-10-25'`),'0');
  assert.equal(sql(`select status||':'||version from ranked_private.daily_rounds where user_id=${quote(player2)} and date='2026-10-25'`),'playing:0');
  assert.ok(key);
});

test('account deletion: owned leagues deleted, pending weeks frozen first, winners anonymized without promotion',()=>{
  setClock('2026-10-14T10:00:00Z');
  const [owner,winner,runner,ownerElsewhere]=[user(),user(),user(),user()];
  const lid=create(owner),token=tokenOf(owner,lid);join(winner,token);join(runner,token);
  const owned=create(ownerElsewhere,'Doomed');join(winner,tokenOf(ownerElsewhere,owned));
  addResult(winner,'2026-10-15',0,100,'2026-10-15T10:00:00Z');addResult(runner,'2026-10-15',0,50,'2026-10-15T10:00:00Z');
  // Week 2: the winner earns again, but nobody reads the league before deletion.
  setClock('2026-10-20T10:00:00Z');standings(owner,lid);
  addResult(winner,'2026-10-21',0,90,'2026-10-21T10:00:00Z');addResult(runner,'2026-10-21',0,10,'2026-10-21T10:00:00Z');
  setClock('2026-10-27T10:00:00Z');
  assert.equal(sql(`select count(*) from ranked_private.friend_league_weeks where league_id=${quote(lid)}`),'1');
  sql(`delete from auth.users where id=${quote(winner)}`);
  assert.equal(sql(`select count(*) from ranked_private.daily_results where user_id=${quote(winner)}`),'0');
  const h=history(owner,lid);
  assert.deepEqual(h.weeks.map(w=>[w.weekStart,w.winningPoints,w.winners.map(x=>[x.nickname,x.deleted])]),
    [['2026-10-19',90,[[null,true]]],['2026-10-12',100,[[null,true]]]],'ended week finalized before results were deleted');
  const s=standings(owner,lid);
  assert.equal(entry(s,runner).trophies,0,'no runner-up promotion');
  assert.equal(s.entries.length,2,'deleted member leaves current standings');
  sql(`delete from auth.users where id=${quote(ownerElsewhere)}`);
  assert.equal(sql(`select count(*) from ranked_private.friend_leagues where id=${quote(owned)}`),'0','owner deletion deletes the league');
  sql(`delete from auth.users where id=${quote(owner)}`);
  for(const t of ['friend_leagues','friend_league_members','friend_league_invites','friend_league_weeks','friend_league_week_entries'])
    assert.equal(sql(`select count(*) from ranked_private.${t}`),'0',t);
  assert.equal(sql(`select count(*) from ranked_private.daily_results where user_id=${quote(runner)}`),'2','league deletion never deletes others\' Daily results');
});

test('every league action leaves gameplay rows, clocks and receipts byte-identical',()=>{
  const [owner,member]=[user(),user()];
  for(const uid of [owner,member]){ranked(uid,mut('start',{competition:'all'}));ranked(uid,{action:'dailyProgress'});}
  const fresh=user();
  const before=snapshot(GAMEPLAY);
  L(owner,{action:'list'});
  const lid=create(owner),token=tokenOf(owner,lid);
  L(member,{action:'preview',token});L(fresh,{action:'preview',token});
  join(member,token);join(fresh,token);
  for(const period of ['today','week'])for(const uid of [owner,member,fresh])standings(uid,lid,period);
  history(member,lid);L(member,{action:'memberWins',leagueId:lid,memberId:memberId(lid,owner)});L(member,{action:'list'});
  L(owner,mut('rename',{leagueId:lid,name:'Still read-only',expectedVersion:0}));
  L(owner,mut('rotateInvite',{leagueId:lid,expectedVersion:1}));
  L(member,mut('leave',{leagueId:lid}));
  L(owner,mut('delete',{leagueId:lid,expectedVersion:2}));
  assert.deepEqual(snapshot(GAMEPLAY),before);
  assert.equal(sql(`select count(*) from ranked_private.daily_rounds where user_id=${quote(fresh)}`),'0');
  assert.equal(sql(`select count(*) from ranked_private.rounds where user_id=${quote(fresh)}`),'0');
});

test('league requests have their own 60/minute bucket and never consume the gameplay bucket',()=>{
  const uid=user();
  const gameplay=sql(`select requests from ranked_private.rate_limits where user_id=${quote(uid)}`);
  for(let i=0;i<60;i++)assert.ok(Array.isArray(L(uid,{action:'list'}).leagues));
  assert.equal(code(L(uid,{action:'list'})),'RATE_LIMITED');
  assert.equal(sql(`select requests from ranked_private.rate_limits where user_id=${quote(uid)}`),gameplay);
});
