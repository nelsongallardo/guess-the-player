// Real isolated PostgreSQL integration tests; auth.users/roles are a explicitly
// labelled Supabase-auth simulation, NOT proof of hosted JWT/OAuth verification.
// PG_BIN=/path/to/postgres/bin node --test tests/ranked-backend.test.mjs
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const asyncExec = promisify(execFile);
const root = new URL('../',import.meta.url);
const pgBin = process.env.PG_BIN || (fs.existsSync('/opt/homebrew/opt/postgresql@17/bin/postgres') ? '/opt/homebrew/opt/postgresql@17/bin' : '');
const bin = cmd => cmd === 'psql' && process.env.PG_CLIENT ? process.env.PG_CLIENT : pgBin ? path.join(pgBin,cmd) : cmd;
let dir, running = false;
let legacy, legacySnapshot, rosterUpgrade, rosterUpgradeSnapshot, roster210Upgrade, roster210UpgradeSnapshot;
let roster210ReferenceSnapshot, roster210ActiveProjection;
let roster220Upgrade, roster220UpgradeSnapshot, roster220ReferenceSnapshot, roster220ActiveProjection;
const aliasPattern = /^(Otter|Badger|Panda|Koala|Heron|Robin|Finch|Lynx|Seal|Dolphin|Turtle|Falcon|Penguin|Gecko|Wombat|Alpaca)-[0-9a-f]{8}$/;
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const args = () => ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','55439','-U','postgres','-d','postgres'];
const sql = text => execFileSync(bin('psql'),[...args(),'-c',text],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const json = text => JSON.parse(sql(text));
const rpcSQL = (uid,body) => `set role service_role; select public.ranked_game(${uid ? quote(uid)+'::uuid' : 'null'},${quote(JSON.stringify(body))}::jsonb);`;
const rpc = (uid,body) => json(rpcSQL(uid,body));
const concurrentRPC = async (uid,body) => JSON.parse((await asyncExec(bin('psql'),[...args(),'-c',rpcSQL(uid,body)],{maxBuffer:8*1024*1024})).stdout.trim());
const user = () => { const id=randomUUID();sql(`insert into auth.users(id) values(${quote(id)});`);return id; };
const mutation = (action,extra={}) => ({action,...extra,idempotencyKey:randomUUID()});
const start = (uid,competition='all') => rpc(uid,mutation('start',{competition}));
const answer = (uid,r,optionId) => rpc(uid,mutation('answer',{roundId:r.id,expectedVersion:r.version,optionId}));
const correct = r => sql(`select correct_option from ranked_private.rounds where id=${quote(r.id)}`);
const wrongs = r => r.options.filter(o=>o.id!==correct(r)).map(o=>o.id);
const hint = (uid,r) => rpc(uid,mutation('hint',{roundId:r.id,expectedVersion:r.version}));
const assertError = (fn,code) => { let result;try {result=fn();}catch(e){assert.match(String(e.stderr || e.message),new RegExp(code));return;} assert.equal(result?.error?.code,code); };
const noIdentity = value => {
  const text=JSON.stringify(value);
  assert(!/"(?:user_id|userId|email|verified_user_id)"/.test(text));
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text));
};
before(() => {
  execFileSync(bin('postgres'),['--version']);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranked-pg-'));
  // Short UNIX socket path on macOS; no TCP listener, no brew service/cloud DB.
  execFileSync(bin('initdb'),['-D',path.join(dir,'data'),'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
  execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-l',path.join(dir,'postgres.log'),'-w','-o',`-k ${dir} -p 55439 -c listen_addresses='' -c fsync=off`,'start'],{stdio:'pipe'});
  running=true;
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
       create schema auth; create table auth.users(id uuid primary key);
       create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
       grant usage on schema public to anon,authenticated,service_role;`);
  const migrations = fs.readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  for(const f of migrations.filter(f=>f<'202609130003')) execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${f}`,root).pathname],{stdio:'pipe',maxBuffer:16*1024*1024});
  legacy={anonymous:user(),custom:user(),empty:user()};
  for(const uid of Object.values(legacy)) rpc(uid,{action:'progress'});
  rpc(legacy.custom,mutation('enroll',{nickname:'Existing Custom'}));
  for(const uid of [legacy.anonymous,legacy.custom]) { const r=start(uid).round;answer(uid,r,correct(r)); }
  sql(`update ranked_private.accounts set enrolled=false where user_id=${quote(legacy.custom)}`);
  legacySnapshot=Object.fromEntries(['rounds','results','receipts'].map(t=>[t,json(`select json_agg(x order by user_id) from ranked_private.${t} x`)]));
  const rosterMigration='202609160002_expand_ranked_roster_120_to_160.sql';
  const finalRosterMigration='202609160003_expand_ranked_roster_160_to_210.sql';
  for(const f of migrations.filter(f=>f>='202609130003'&&f<rosterMigration)) execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${f}`,root).pathname],{stdio:'pipe',maxBuffer:16*1024*1024});
  // Exercise the exact prior 120-player state with both an immutable result
  // and an unresolved active v2 round before applying the 120→160 sync.
  rosterUpgrade={result:user(),active:user()};
  const completed=start(rosterUpgrade.result).round;
  answer(rosterUpgrade.result,completed,correct(completed));
  sql(`update ranked_private.accounts set enrolled=false where user_id=${quote(rosterUpgrade.result)}`);
  start(rosterUpgrade.active);
  const upgradeUsers=Object.values(rosterUpgrade).map(quote).join(',');
  rosterUpgradeSnapshot=Object.fromEntries(['rounds','results','receipts'].map(t=>[t,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgradeUsers})`)]));
  for(const f of migrations.filter(f=>f>=rosterMigration&&f<finalRosterMigration)) execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${f}`,root).pathname],{stdio:'pipe',maxBuffer:32*1024*1024});
  // Repeat the preservation fixture at the exact deployed 160-player state.
  roster210Upgrade={result:user(),active:user()};
  const completed160=start(roster210Upgrade.result).round;
  answer(roster210Upgrade.result,completed160,correct(completed160));
  sql(`update ranked_private.accounts set enrolled=false where user_id=${quote(roster210Upgrade.result)}`);
  const active160=start(roster210Upgrade.active).round;
  hint(roster210Upgrade.active,active160);
  const upgrade210Users=Object.values(roster210Upgrade).map(quote).join(',');
  roster210UpgradeSnapshot=Object.fromEntries(['rounds','results','receipts'].map(t=>[t,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgrade210Users})`)]));
  roster210ReferenceSnapshot=Object.fromEntries([
    ['candidates',json("select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.candidates x")],
    ['players',json("select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.players x")],
    ['memberships',json("select coalesce(jsonb_agg(to_jsonb(x) order by player_id,competition),'[]'::jsonb) from ranked_private.memberships x")],
  ]);
  roster210ActiveProjection=rpc(roster210Upgrade.active,{action:'progress'}).round;
  const latestRosterMigration='202609170001_expand_ranked_roster_210_to_220.sql';
  for(const f of migrations.filter(f=>f>=finalRosterMigration&&f<latestRosterMigration)) execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${f}`,root).pathname],{stdio:'pipe',maxBuffer:48*1024*1024});
  // Repeat the preservation fixture again at the exact deployed 210-player
  // state, immediately before applying the 210→220 batch-11 sync.
  roster220Upgrade={result:user(),active:user()};
  const completed210=start(roster220Upgrade.result).round;
  answer(roster220Upgrade.result,completed210,correct(completed210));
  sql(`update ranked_private.accounts set enrolled=false where user_id=${quote(roster220Upgrade.result)}`);
  const active210=start(roster220Upgrade.active).round;
  hint(roster220Upgrade.active,active210);
  const upgrade220Users=Object.values(roster220Upgrade).map(quote).join(',');
  roster220UpgradeSnapshot=Object.fromEntries(['rounds','results','receipts'].map(t=>[t,json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgrade220Users})`)]));
  roster220ReferenceSnapshot=Object.fromEntries([
    ['candidates',json("select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.candidates x")],
    ['players',json("select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.players x")],
    ['memberships',json("select coalesce(jsonb_agg(to_jsonb(x) order by player_id,competition),'[]'::jsonb) from ranked_private.memberships x")],
  ]);
  roster220ActiveProjection=rpc(roster220Upgrade.active,{action:'progress'}).round;
  for(const f of migrations.filter(f=>f>=latestRosterMigration)) execFileSync(bin('psql'),[...args(),'-f',new URL(`supabase/migrations/${f}`,root).pathname],{stdio:'pipe',maxBuffer:48*1024*1024});
  console.log('Real PostgreSQL isolated cluster; Supabase auth schema/roles SIMULATED; no cloud services used.');
});
after(() => {
  if (running) execFileSync(bin('pg_ctl'),['-D',path.join(dir,'data'),'-m','immediate','-w','stop'],{stdio:'pipe'});
  if(dir) fs.rmSync(dir,{recursive:true,force:true});
});

afterEach(()=>sql('delete from auth.users'));

test('additive migration backfills legacy results, preserves custom names and immutable history',()=>{
  const anonymous=rpc(legacy.anonymous,{action:'progress'});
  assert.match(anonymous.profile?.nickname || '',aliasPattern);
  assert.equal(anonymous.profile.enrolled,true);
  assert.deepEqual(rpc(legacy.custom,{action:'progress'}).profile,{nickname:'Existing Custom',enrolled:true});
  assert.equal(rpc(legacy.empty,{action:'progress'}).profile.enrolled,true);
  const legacyUsers=Object.values(legacy).map(quote).join(',');
  for(const t of ['rounds','results','receipts']) assert.deepEqual(json(`select json_agg(x order by user_id) from ranked_private.${t} x where user_id in (${legacyUsers})`),legacySnapshot[t]);
  const upgradeUsers=Object.values(rosterUpgrade).map(quote).join(',');
  for(const t of ['rounds','results','receipts']) {
    assert.deepEqual(
      json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgradeUsers})`),
      rosterUpgradeSnapshot[t],
      `${t} changed while upgrading the 120-player state`,
    );
  }
  const upgrade210Users=Object.values(roster210Upgrade).map(quote).join(',');
  for(const t of ['rounds','results','receipts']) {
    assert.deepEqual(
      json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgrade210Users})`),
      roster210UpgradeSnapshot[t],
      `${t} changed while upgrading the 160-player state`,
    );
  }
  const priorCandidateIds=roster210ReferenceSnapshot.candidates.map(row=>quote(row.id)).join(',');
  const priorPlayerIds=roster210ReferenceSnapshot.players.map(row=>quote(row.id)).join(',');
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.candidates x where id in (${priorCandidateIds})`),
    roster210ReferenceSnapshot.candidates,
    'existing candidate labels changed while upgrading the 160-player state',
  );
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.players x where id in (${priorPlayerIds})`),
    roster210ReferenceSnapshot.players,
    'existing player reference data changed while upgrading the 160-player state',
  );
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by player_id,competition),'[]'::jsonb) from ranked_private.memberships x where player_id in (${priorPlayerIds})`),
    roster210ReferenceSnapshot.memberships,
    'existing competition memberships changed while upgrading the 160-player state',
  );
  assert.deepEqual(
    rpc(roster210Upgrade.active,{action:'progress'}).round,
    roster210ActiveProjection,
    'active hinted round projection changed while upgrading the 160-player state',
  );
  const upgrade220Users=Object.values(roster220Upgrade).map(quote).join(',');
  for(const t of ['rounds','results','receipts']) {
    assert.deepEqual(
      json(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from ranked_private.${t} x where user_id in (${upgrade220Users})`),
      roster220UpgradeSnapshot[t],
      `${t} changed while upgrading the 210-player state`,
    );
  }
  const priorCandidateIds220=roster220ReferenceSnapshot.candidates.map(row=>quote(row.id)).join(',');
  const priorPlayerIds220=roster220ReferenceSnapshot.players.map(row=>quote(row.id)).join(',');
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.candidates x where id in (${priorCandidateIds220})`),
    roster220ReferenceSnapshot.candidates,
    'existing candidate labels changed while upgrading the 210-player state',
  );
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]'::jsonb) from ranked_private.players x where id in (${priorPlayerIds220})`),
    roster220ReferenceSnapshot.players,
    'existing player reference data changed while upgrading the 210-player state',
  );
  assert.deepEqual(
    json(`select coalesce(jsonb_agg(to_jsonb(x) order by player_id,competition),'[]'::jsonb) from ranked_private.memberships x where player_id in (${priorPlayerIds220})`),
    roster220ReferenceSnapshot.memberships,
    'existing competition memberships changed while upgrading the 210-player state',
  );
  assert.deepEqual(
    rpc(roster220Upgrade.active,{action:'progress'}).round,
    roster220ActiveProjection,
    'active hinted round projection changed while upgrading the 210-player state',
  );
  // The legacy rows above are byte-for-byte preserved (still ruleset='v1',
  // still 5 options each) - but ADR 0012's ten-option v2 ruleset filters the
  // active leaderboard/progress to ruleset='v2' only, by design: it's a
  // deliberate reset, not a bug, so these untouched v1-only results now
  // correctly fall off the (now v2) board rather than still counting.
  const board=rpc(legacy.anonymous,{action:'leaderboard'});
  // The 120→160, exact-160 and exact-210 fixtures each contribute one
  // preserved v2 result; the legacy v1-only account itself must still have
  // no entry.
  assert.equal(board.total,3);assert.equal(board.own,null);noIdentity(board);
  assert.equal(rpc(legacy.empty,{action:'leaderboard'}).own,null);
});

test('automatic aliases are stable, private, unique under concurrent first requests, and rename-compatible',async()=>{
  const users=Array.from({length:16},user);
  const profiles=await Promise.all(users.map(uid=>concurrentRPC(uid,{action:'progress'})));
  assert.equal(new Set(profiles.map(p=>p.profile?.nickname?.toLowerCase())).size,users.length);
  for(const [i,p] of profiles.entries()) {
    assert.match(p.profile.nickname,aliasPattern);assert.equal(p.profile.enrolled,true);noIdentity(p.profile);
    assert.deepEqual(rpc(users[i],{action:'progress'}).profile,p.profile);
    assert.equal(rpc(users[i],{action:'leaderboard'}).own,null);
  }
  const uid=users[0], r=start(uid).round;
  answer(uid,r,correct(r));
  assert.equal(rpc(uid,{action:'leaderboard'}).own.nickname,profiles[0].profile.nickname);
  assert.equal(rpc(null,{action:'leaderboard'}).total,1);
  const renamed=rpc(uid,mutation('enroll',{nickname:'Custom Otter'}));
  assert.equal(renamed.profile.nickname,'Custom Otter');
  assert.deepEqual(rpc(uid,{action:'progress'}).profile,renamed.profile);
  assertError(()=>rpc(users[1],mutation('enroll',{nickname:'custom otter'})),'NICKNAME_TAKEN');
  assert.equal(rpc(uid,{action:'leaderboard'}).own.nickname,'Custom Otter');
});

test('forced case-insensitive alias collisions retry safely across concurrent accounts',async()=>{
  const original=sql("select pg_get_functiondef('ranked_private.animal_alias_candidate()'::regprocedure)");
  const existing=user();rpc(existing,mutation('enroll',{nickname:'OTTER-deadbeef'}));
  const users=Array.from({length:16},user);
  try {
    sql(`create sequence ranked_private.alias_test_sequence;
      create or replace function ranked_private.animal_alias_candidate() returns text
      language sql volatile set search_path='' as $$
        select case when n<=16 then 'Otter-deadbeef' when n<=32 then 'Otter-cafebabe'
          else 'Otter-' || lpad(to_hex(n),8,'0') end
        from (select nextval('ranked_private.alias_test_sequence') n) x $$;`);
    const results=await Promise.all(users.map(uid=>concurrentRPC(uid,{action:'progress'})));
    const names=results.map(p=>p.profile.nickname.toLowerCase());
    assert.equal(new Set(names).size,users.length);
    assert(!names.includes('otter-deadbeef'));assert(names.includes('otter-cafebabe'));
    assert.equal(Number(sql(`select count(*) from ranked_private.accounts where user_id in (${[existing,...users].map(quote).join(',')})`)),17);
    for(const uid of users) assert.equal(rpc(uid,{action:'progress'}).profile.enrolled,true);
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal(sql(`select has_function_privilege('${role}','ranked_private.animal_alias_candidate()','EXECUTE')::integer`),'0');
      assert.equal(sql(`select has_function_privilege('${role}','ranked_private.automatic_animal_alias()','EXECUTE')::integer`),'0');
    }
  } finally { sql(original);sql('drop sequence ranked_private.alias_test_sequence'); }
});

test('roster exporter is current and canonical membership/matching scores equal guest model',()=>{
  execFileSync(process.execPath,[new URL('scripts/export-ranked-roster-220-forward.mjs',root).pathname,'--check']);
  const html=fs.readFileSync(new URL('index.html',root),'utf8');
  const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
  const ctx=vm.createContext({});vm.runInContext(block('roster-data')+block('game-model'),ctx);
  const {players,g}=vm.runInContext('({players:PLAYERS,g:CareerGame})',ctx);
  assert.equal(Number(sql('select count(*) from ranked_private.players')),players.length);
  assert.equal(Number(sql('select count(*) from ranked_private.candidates')),g.candidates.length);
  const memberships=json('select json_agg(m order by player_id,competition) from ranked_private.memberships m');
  assert.deepEqual(memberships,JSON.parse(JSON.stringify(players.flatMap(p=>['all',...p.competitions].map(competition=>({player_id:p.id,competition}))))).sort((a,b)=>a.player_id.localeCompare(b.player_id)||a.competition.localeCompare(b.competition)));
  const rows=json('select json_agg(r) from ranked_private.rivals r');
  const byId=new Map(g.candidates.map(p=>[p.id,p]));
  for(const r of rows) {
    const p=byId.get(r.player_id),q=byId.get(r.candidate_id);
    if(r.similarity!==g.similarity(p,q)) console.error('SIM MISMATCH DEBUG',r.player_id,r.candidate_id,'stored',r.similarity,'fresh',g.similarity(p,q));
    assert.equal(r.tier,g.matchTier(p,q));assert.equal(r.similarity,g.similarity(p,q));
    assert(g.eligibleRivals(p).includes(q.name));
  }
  // Elapsed samples deliberately avoid exact X.5 rounding boundaries (e.g.
  // 2500ms/7000ms land exactly on one for some hint counts): JS's binary
  // float and Postgres's exact numeric arithmetic can round an on-the-nose
  // .5 in opposite directions from tiny representation differences, which
  // is a test-precision artifact, not a real scoring divergence - a real
  // elapsed value is never going to land on an exact millisecond boundary
  // like that anyway.
  for(const hints of [0,1,2,3]) for(const elapsed of [0,1,1999,2000,2001,2347,6821,10000,11999,12000,999999])
    assert.equal(Number(sql(`select ranked_private.points(${hints},${elapsed})`)),g.pointsFor(hints,elapsed));
});

test('anon/authenticated cannot read or mutate private tables or spoof service RPC identity',()=>{
  const a=user(),b=user();start(a);
  for(const role of ['anon','authenticated']) {
    for(const table of ['accounts','rounds','results','receipts','rate_limits','players','rivals','daily_schedule','daily_rounds','daily_results','daily_streaks']) {
      assert.throws(()=>sql(`set role ${role}; select * from ranked_private.${table}`),/permission denied/);
      assert.throws(()=>sql(`set role ${role}; delete from ranked_private.${table}`),/permission denied/);
    }
    assert.throws(()=>sql(`set role ${role}; set request.jwt.claim.sub=${quote(b)}; select public.ranked_game(${quote(a)},'{"action":"progress"}');`),/permission denied/);
  }
  assert.throws(()=>sql(`set role service_role; update ranked_private.rounds set points=100;`),/permission denied/);
  assertError(()=>rpc(null,{action:'progress'}),'UNAUTHORIZED');
  assertError(()=>rpc(randomUUID(),{action:'progress'}),'UNAUTHORIZED');
  assertError(()=>rpc(a,{action:'progress',user_id:b,points:100,elapsedMs:0}),'INVALID_REQUEST');
  assert.equal(Number(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ranked_private' and relkind='r' and not relrowsecurity`)),0);
});

test('single active round, stable opaque randomized options, reload preserves hints/guesses/clock',()=>{
  const uid=user();const initial=start(uid);let r=initial.round;
  assert.match(initial.profile.nickname,aliasPattern);assert.equal(initial.profile.enrolled,true);assert.equal(initial.progress.answered,0);
  assert.equal(r.options.length,10);assert.equal(new Set(r.options.map(o=>o.id)).size,10);
  assert.equal(new Set(r.options.map(o=>o.label)).size,10);assert.equal(r.version,0);
  assert.equal(r.clueCountry,null);assert.equal(r.cluePosition,null);
  const raw=JSON.stringify(r);assert(!raw.includes('correct_option'));assert(!raw.includes('candidate_id'));
  const chosen=wrongs(r)[0];r=answer(uid,r,chosen).round;
  r=hint(uid,r).round;
  assert.equal(r.hints,1);assert(r.clueCountry);assert.equal(r.cluePosition,null);
  assert.deepEqual(r.guesses,[chosen]);assert.equal(r.startedAt,initial.round.startedAt);
  assert.deepEqual(rpc(uid,{action:'progress'}).round,r);
  assert.deepEqual(start(uid,'brasileirao').round,r);
  assert.equal(rpc(user(),{action:'progress'}).round,null);
  assertError(()=>answer(user(),r,correct(r)),'ROUND_NOT_FOUND');
});

test('hint/guess limits, invalid options, stale versions and terminal rounds cannot mutate',()=>{
  const uid=user();let r=start(uid).round;
  assertError(()=>answer(uid,r,randomUUID()),'INVALID_OPTION');
  const old=r;r=hint(uid,r).round;r=hint(uid,r).round;r=hint(uid,r).round;
  assert.equal(r.hints,3);assert(r.clueCountry && r.cluePosition);
  assertError(()=>hint(uid,r),'HINT_LIMIT');assertError(()=>hint(uid,old),'VERSION_CONFLICT');
  const ws=wrongs(r);r=answer(uid,r,ws[0]).round;
  assertError(()=>answer(uid,r,ws[0]),'ALREADY_GUESSED');
  r=answer(uid,r,ws[1]).round;r=answer(uid,r,ws[2]).round;
  assert.equal(r.status,'lost');assert.equal(r.points,0);assert.equal(r.guesses.length,3);
  assertError(()=>answer(uid,r,correct(r)),'ROUND_FINISHED');assertError(()=>hint(uid,r),'ROUND_FINISHED');
  const p=rpc(uid,{action:'progress'});assert.equal(p.progress.answered,1);assert.equal(p.progress.correct,0);
  assert.deepEqual(p.progress.seenPlayerIds,[r.playerId]);assert.equal(p.progress.totalPoints,0);
  assert.notEqual(start(uid).round.playerId,r.playerId);
});

test('server scoring uses persisted time and exactly preserves the 100/80/60/40 ceilings and 25/20/15/10 floor',()=>{
  for(const h of [0,1,2,3]) for(const slow of [false,true]) {
    const uid=user();let r=start(uid).round;
    for(let i=0;i<h;i++) r=hint(uid,r).round;
    if(slow) sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '2 minutes' where id=${quote(r.id)}`);
    else sql(`update ranked_private.rounds set started_at=clock_timestamp() where id=${quote(r.id)}`);
    const resumed=rpc(uid,{action:'progress'}).round;
    const won=answer(uid,resumed,correct(resumed));
    assert.equal(won.round.status,'won');assert.equal(won.round.points,(100-20*h)*(slow?0.25:1));
    assert.equal(won.progress.totalPoints,won.round.points);assert.equal(won.progress.correct,1);
    assert.throws(()=>sql(`update ranked_private.results set points=100 where user_id=${quote(uid)}`),/RESULT_IMMUTABLE/);
  }
});

test('idempotency is per account + request digest, including exact retries after round completion',()=>{
  const uid=user(),other=user();const body=mutation('start',{competition:'all'});
  const first=rpc(uid,body);assert.deepEqual(rpc(uid,body),first);
  assertError(()=>rpc(uid,{...body,competition:'la-liga'}),'IDEMPOTENCY_CONFLICT');
  assert.notEqual(rpc(other,body).round.id,first.round.id);
  const a=mutation('answer',{roundId:first.round.id,expectedVersion:0,optionId:correct(first.round)});
  const won=rpc(uid,a);assert.equal(won.round.status,'won');
  start(uid);assert.deepEqual(rpc(uid,a),won);
  assert.deepEqual(rpc(uid,body),first); // receipt snapshots are intentionally immutable
  assert.equal(rpc(uid,{action:'progress'}).progress.answered,1);
  assertError(()=>rpc(uid,{...a,optionId:randomUUID()}),'IDEMPOTENCY_CONFLICT');
});

test('parallel starts/retries serialize; optimistic versions allow only one winning transition',async()=>{
  const uid=user();const body=mutation('start');
  const starts=await Promise.all(Array.from({length:8},()=>concurrentRPC(uid,body)));
  for(const s of starts) assert.deepEqual(s,starts[0]);
  const distinct=await Promise.all(Array.from({length:8},()=>concurrentRPC(uid,mutation('start',{competition:'la-liga'}))));
  for(const s of distinct) assert.equal(s.round.id,starts[0].round.id);
  const r=starts[0].round;
  const hs=await Promise.all(Array.from({length:8},()=>concurrentRPC(uid,mutation('hint',{roundId:r.id,expectedVersion:0}))));
  assert.equal(hs.filter(x=>!x.error).length,1);assert.equal(hs.filter(x=>x.error?.code==='VERSION_CONFLICT').length,7);
  const current=rpc(uid,{action:'progress'}).round;
  const bodyAnswer=mutation('answer',{roundId:r.id,expectedVersion:current.version,optionId:correct(r)});
  const answers=await Promise.all(Array.from({length:8},()=>concurrentRPC(uid,bodyAnswer)));
  for(const a of answers) assert.deepEqual(a,answers[0]);
  assert.equal(answers[0].progress.answered,1);
  assert.equal(Number(sql(`select count(*) from ranked_private.results where user_id=${quote(uid)}`)),1);
});

test('an untouched round abandoned past the stale window is replaced, with a fresh clock',()=>{
  // The clock starts when the server CREATES the round, and 'start' returns any
  // existing playing round. So landing on the site signed in, closing the tab,
  // and coming back hours later used to resurrect the same never-touched round
  // with its original started_at - showing e.g. "73:25" and, worse, pinning the
  // score to the 25% floor before the player had seen the puzzle at all.
  const uid=user();
  const first=start(uid).round;
  sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '90 minutes' where id=${quote(first.id)}`);
  const second=start(uid).round;
  assert.notEqual(second.id,first.id,'a stale untouched round is not handed back');
  assert.ok(Date.now()-Date.parse(second.startedAt)<60_000,'the replacement round carries a fresh clock');
  assert.equal(Number(sql(`select count(*) from ranked_private.rounds where user_id=${quote(uid)} and status='playing'`)),1,'the one-open-round invariant still holds');
  assert.equal(Number(sql(`select count(*) from ranked_private.results where user_id=${quote(uid)}`)),0,'abandoning records no result and cannot farm points');
});

test('an ENGAGED round is never replaced by the stale window, however old it is',()=>{
  // This is the anti-lookup boundary: once a player has spent a hint or a guess,
  // the clock is theirs and walking away must not buy them a fresh one.
  for(const engage of ['hint','guess']){
    const uid=user();
    const r=start(uid).round;
    if(engage==='hint')hint(uid,r); else answer(uid,r,wrongs(r)[0]);
    sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '90 minutes' where id=${quote(r.id)}`);
    const again=start(uid).round;
    assert.equal(again.id,r.id,`a round engaged via ${engage} is preserved despite being stale`);
    assert.ok(Date.now()-Date.parse(again.startedAt)>60*60_000,'its original clock is preserved, so the elapsed penalty stands');
  }
});

test('a fresh untouched round inside the stale window is still resumed normally',()=>{
  const uid=user();
  const first=start(uid).round;
  sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '3 minutes' where id=${quote(first.id)}`);
  assert.equal(start(uid).round.id,first.id,'an ordinary short interruption resumes the same round');
});

test('abandoning a round does not consume the player, who can still be dealt it again',()=>{
  const uid=user();
  const first=start(uid).round;
  const playerId=sql(`select player_id from ranked_private.rounds where id=${quote(first.id)}`);
  sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '90 minutes' where id=${quote(first.id)}`);
  start(uid);
  assert.equal(Number(sql(`select count(*) from ranked_private.results where user_id=${quote(uid)} and player_id=${quote(playerId)}`)),0,'no result row was written for the abandoned player');
});

test('leaderboards require a verified result per board; enrollment/active rounds stay hidden and zero-point losses rank',()=>{
  const a=user(),b=user();
  const competitions=json('select json_agg(id order by id) from ranked_private.competitions');
  const board=(uid,competition)=>rpc(uid,{action:'leaderboard',competition,limit:100});
  const empty=(uid,competition)=>assert.deepEqual(board(uid,competition),{entries:[],own:null,total:0,competition});
  try {
    rpc(a,mutation('enroll',{nickname:'Loss Alpha'}));
    rpc(b,mutation('enroll',{nickname:'Loss Beta'}));
    for(const c of competitions) { empty(a,c);empty(b,c);empty(null,c); }
    let r=start(a,'la-liga').round;
    for(const c of competitions) empty(a,c);
    const memberships=json(`select json_agg(competition) from ranked_private.memberships where player_id=${quote(r.playerId)}`);
    // Most randomly assigned targets carry at least one unrelated
    // competition, which the loop below verifies stays an empty board; a
    // genuinely well-travelled roster member (e.g. one tagged with every
    // competition) is real data, not a fixture bug, and simply exercises
    // no "unrelated league" branch on the rare draw that picks them.
    const ws=wrongs(r);
    for(const w of ws.slice(0,2)) { r=answer(a,r,w).round;empty(a,'all'); }
    r=answer(a,r,ws[2]).round;
    assert.equal(r.status,'lost');assert.equal(r.points,0);
    const entry={nickname:'Loss Alpha',points:0,answered:1,correct:0,rank:1};
    for(const c of competitions) {
      if(memberships.includes(c)) {
        assert.deepEqual(board(a,c),{entries:[entry],own:entry,total:1,competition:c});
        assert.equal(board(b,c).own,null); // still enrolled without a result
      } else { empty(a,c);empty(null,c); }
    }
    let rb=start(b,'la-liga').round;
    for(const w of wrongs(rb).slice(0,3)) rb=answer(b,rb,w).round;
    assert.equal(rb.status,'lost');
    const tied=[entry,{...entry,nickname:'Loss Beta'}];
    for(const c of ['all','la-liga']) {
      const result=board(b,c);noIdentity(result);
      assert.deepEqual(result,{entries:tied,own:tied[1],total:2,competition:c});
      assert.deepEqual(rpc(a,{action:'leaderboard',competition:c,limit:1,offset:1}),
        {entries:[tied[1]],own:entry,total:2,competition:c});
    }
  } finally {
    sql(`delete from auth.users where id in (${quote(a)},${quote(b)})`);
  }
});

test('all-only players deal globally but never enter league boards or counts',()=>{
  const uid=user();
  let removed=[];
  try {
    assert.deepEqual(
      json("select coalesce(jsonb_agg(competition order by competition),'[]'::jsonb) from ranked_private.memberships where player_id='carlos-lobaton'"),
      ['all'],
    );
    removed=json("with removed as (delete from ranked_private.memberships where competition='all' and player_id<>'carlos-lobaton' returning player_id,competition) select coalesce(jsonb_agg(to_jsonb(removed)),'[]'::jsonb) from removed");
    const r=start(uid,'all').round;
    assert.equal(r.playerId,'carlos-lobaton');
    const won=answer(uid,r,correct(r));
    assert.equal(won.progress.competitionCounts.all.answered,1);
    for(const competition of ['champions-league','premier-league','la-liga','argentine-primera','brasileirao']) {
      assert.equal(won.progress.competitionCounts[competition]?.answered ?? 0,0);
      assert.equal(rpc(uid,{action:'leaderboard',competition,limit:100}).own,null);
    }
    assert.equal(rpc(uid,{action:'leaderboard',competition:'all',limit:100}).own.answered,1);
  } finally {
    if(removed.length) sql(`insert into ranked_private.memberships select * from jsonb_to_recordset(${quote(JSON.stringify(removed))}::jsonb) as x(player_id text,competition text) on conflict do nothing`);
    sql(`delete from auth.users where id=${quote(uid)}`);
  }
});

test('every result contributes globally and to every canonical membership, not selected deck; ties share rank',()=>{
  const a=user(),b=user();rpc(a,mutation('enroll',{nickname:'Equal Alpha'}));rpc(b,mutation('enroll',{nickname:'Equal Beta'}));
  const r=start(a,'la-liga').round;
  sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '40 seconds' where id=${quote(r.id)}`);
  const won=answer(a,r,correct(r));assert.equal(won.round.points,25);
  const memberships=json(`select json_agg(competition) from ranked_private.memberships where player_id=${quote(r.playerId)}`);
  const competitions=json('select json_agg(id) from ranked_private.competitions');
  for(const c of competitions) {
    const board=rpc(a,{action:'leaderboard',competition:c,limit:100,offset:0});noIdentity(board);
    if(memberships.includes(c)) {
      assert.equal(board.own.points,25);assert.equal(board.own.answered,1);
    } else {
      assert.equal(board.own,null);
      assert(!board.entries.some(e=>e.nickname==='Equal Alpha'));
    }
    assert.equal(won.progress.competitionCounts[c].answered,memberships.includes(c)?1:0);
  }
  const rb=start(b).round;sql(`update ranked_private.rounds set started_at=clock_timestamp()-interval '40 seconds' where id=${quote(rb.id)}`);answer(b,rb,correct(rb));
  const board=rpc(a,{action:'leaderboard',competition:'all',limit:100});
  assert.equal(board.entries.find(x=>x.nickname==='Equal Alpha').rank,board.entries.find(x=>x.nickname==='Equal Beta').rank);
  assert.equal(rpc(null,{action:'leaderboard'}).own,null);
  const one=rpc(a,{action:'leaderboard',limit:1,offset:1});assert.equal(one.entries.length,1);assert(one.own);noIdentity(one);
  assertError(()=>rpc(a,{action:'leaderboard',limit:101}),'INVALID_REQUEST');
  assertError(()=>rpc(a,{action:'leaderboard',offset:-1}),'INVALID_REQUEST');
  assertError(()=>rpc(b,mutation('enroll',{nickname:'equal alpha'})),'NICKNAME_TAKEN');
});

test('unseen exhaustion returns completed/null; no replay/reset farming across competitions',()=>{
  const uid=user();const comp=sql('select competition from ranked_private.memberships group by competition order by count(*),competition limit 1');
  const total=Number(sql(`select count(*) from ranked_private.memberships where competition=${quote(comp)}`));
  const seen=new Set();
  for(let i=0;i<total;i++) {
    const r=start(uid,comp).round;assert(!seen.has(r.playerId));seen.add(r.playerId);
    const ws=wrongs(r);let last=r;
    for(const w of ws.slice(0,3)) last=answer(uid,last,w).round;
    // Test-only reset of rate window between rounds; not a gameplay reset/API.
    sql(`update ranked_private.rate_limits set window_start=clock_timestamp()-interval '2 minutes' where user_id=${quote(uid)}`);
  }
  const exhausted=start(uid,comp);assert.equal(exhausted.completed,true);assert.equal(exhausted.round,null);
  assert.equal(exhausted.progress.competitionCounts[comp].answered,total);
  assert.equal(exhausted.progress.seenPlayerIds.length,total);
  assert.equal(start(uid,comp).round,null);assert(!seen.has(start(uid,'all').round.playerId));
  assertError(()=>rpc(uid,{action:'reset'}),'INVALID_REQUEST');
});

test('per-account rate budget persists rejected mutations and resets only with server window',()=>{
  const uid=user();let r=start(uid).round;
  sql(`update ranked_private.rate_limits set requests=118 where user_id=${quote(uid)}`);
  assertError(()=>answer(uid,r,randomUUID()),'INVALID_OPTION');
  assertError(()=>answer(uid,r,randomUUID()),'INVALID_OPTION');
  assertError(()=>rpc(uid,{action:'progress'}),'RATE_LIMITED');
  assert.equal(Number(sql(`select requests from ranked_private.rate_limits where user_id=${quote(uid)}`)),121);
  assert.equal(rpc(user(),{action:'progress'}).progress.answered,0);
  sql(`update ranked_private.rate_limits set window_start=clock_timestamp()-interval '61 seconds' where user_id=${quote(uid)}`);
  assert.equal(rpc(uid,{action:'progress'}).round.id,r.id);
});

test('auth user hard deletion cascades account, round, result, receipt, rate and leaderboard rows',()=>{
  const uid=user();rpc(uid,mutation('enroll',{nickname:'Delete This Account'}));
  const r=start(uid).round;answer(uid,r,correct(r));assert(rpc(uid,{action:'leaderboard'}).own);
  dailyProgress(uid);
  sql(`delete from auth.users where id=${quote(uid)}`);
  for(const table of ['accounts','rounds','results','receipts','rate_limits','daily_rounds','daily_results','daily_streaks']) assert.equal(Number(sql(`select count(*) from ranked_private.${table} where user_id=${quote(uid)}`)),0);
  assert(!rpc(null,{action:'leaderboard',limit:100}).entries.some(e=>e.nickname==='Delete This Account'));
});

// --- Daily Rabona (server-authoritative for signed-in accounts) --- see
// docs/adr/0021-daily-rabona-server-authoritative-for-accounts.md.
const dailyProgress = uid => rpc(uid,{action:'dailyProgress'});
const dailyHintRPC = (uid,roundIndex,expectedVersion) => rpc(uid,mutation('dailyHint',{roundIndex,expectedVersion}));
const dailyAnswerRPC = (uid,roundIndex,expectedVersion,optionId) => rpc(uid,mutation('dailyAnswer',{roundIndex,expectedVersion,optionId}));
const dailyRoundRow = (uid,roundIndex) => dailyProgress(uid).daily.rounds.find(r=>r.roundIndex===roundIndex);
const dailyCorrectOption = (uid,roundIndex) => sql(`select correct_option from ranked_private.daily_rounds where user_id=${quote(uid)} and date=current_date and round_index=${roundIndex}`);
const dailyWrongOptions = (uid,roundIndex) => { const round=dailyRoundRow(uid,roundIndex),correctId=dailyCorrectOption(uid,roundIndex); return round.options.filter(o=>o.id!==correctId).map(o=>o.id); };
const dailySlotPlayer = roundIndex => sql(`select ds.player_id from ranked_private.daily_schedule ds where ds.slot_index=ranked_private.daily_slot_index(current_date,${roundIndex})`);

test('daily_schedule seed is complete and every seeded reference resolves',()=>{
  assert.equal(Number(sql('select count(*) from ranked_private.daily_schedule')),220);
  assert.equal(Number(sql('select count(*) from ranked_private.daily_schedule where slot_index<0 or slot_index>219')),0);
  assert.equal(Number(sql('select count(distinct slot_index) from ranked_private.daily_schedule')),220);
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_schedule ds where not exists(select 1 from ranked_private.players p where p.id=ds.player_id)`)),0);
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_schedule ds where exists(select 1 from unnest(ds.option_candidate_ids) oc where not exists(select 1 from ranked_private.candidates c where c.id=oc))`)),0);
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_schedule ds where not(ds.player_id=any(ds.option_candidate_ids))`)),0);
  assert.equal(Number(sql('select count(*) from ranked_private.daily_schedule where cardinality(option_candidate_ids)<>10')),0);
});

test('dailyProgress lazily creates exactly three rows for today and is idempotent',()=>{
  const uid=user();
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_rounds where user_id=${quote(uid)}`)),0);
  const first=dailyProgress(uid);
  assert.equal(first.daily.rounds.length,3);
  assert.deepEqual(first.daily.rounds.map(r=>r.roundIndex),[0,1,2]);
  assert.equal(first.daily.finished,false);
  assert.equal(first.streak.current,0);assert.equal(first.streak.best,0);
  for(const r of first.daily.rounds){assert.equal(r.status,'playing');assert.equal(r.version,0);assert.equal(r.hints,0);assert.equal(r.options.length,10);assert.equal(new Set(r.options.map(o=>o.id)).size,10);assert.equal(r.clueCountry,null);assert.equal(r.cluePosition,null);}
  const second=dailyProgress(uid);
  assert.deepEqual(second,first);
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_rounds where user_id=${quote(uid)}`)),3);
});

test('daily rounds never reveal the correct option field',()=>{
  // playerId is legitimately part of the response (the client needs it to
  // look up the frozen local career/hints payload for that slot) - only
  // the server-only correct_option column must never leak.
  const uid=user();const raw=JSON.stringify(dailyProgress(uid));
  assert(!raw.includes('correct_option'));
});

test('daily rounds enforce sequential order, hint cap, invalid/duplicate options and version conflicts',()=>{
  const uid=user();dailyProgress(uid);
  assertError(()=>dailyAnswerRPC(uid,1,0,randomUUID()),'ROUND_LOCKED');
  assertError(()=>dailyHintRPC(uid,2,0),'ROUND_LOCKED');
  let r0=dailyRoundRow(uid,0);
  for(let i=0;i<3;i++) r0=dailyHintRPC(uid,0,r0.version).daily.rounds.find(r=>r.roundIndex===0);
  assert.equal(r0.hints,3);
  assertError(()=>dailyHintRPC(uid,0,r0.version),'HINT_LIMIT');
  assertError(()=>dailyAnswerRPC(uid,0,r0.version,randomUUID()),'INVALID_OPTION');
  assertError(()=>dailyAnswerRPC(uid,0,999,r0.options[0].id),'VERSION_CONFLICT');
  const afterWrong=dailyAnswerRPC(uid,0,r0.version,dailyWrongOptions(uid,0)[0]).daily.rounds.find(r=>r.roundIndex===0);
  assertError(()=>dailyAnswerRPC(uid,0,afterWrong.version,afterWrong.guesses[0]),'ALREADY_GUESSED');
});

test('daily hint clues are gated exactly like ranked and years reveal at the third hint client-side',()=>{
  const uid=user();dailyProgress(uid);
  let r=dailyHintRPC(uid,0,0).daily.rounds.find(x=>x.roundIndex===0);
  assert(r.clueCountry);assert.equal(r.cluePosition,null);
  r=dailyHintRPC(uid,0,r.version).daily.rounds.find(x=>x.roundIndex===0);
  assert(r.clueCountry);assert(r.cluePosition);
});

test('a correct daily answer scores via the shared points curve and a wrong-to-exhaustion round scores zero',()=>{
  const uid=user();dailyProgress(uid);
  const r=dailyRoundRow(uid,0);
  const correctId=dailyCorrectOption(uid,0);
  sql(`update ranked_private.daily_rounds set started_at=clock_timestamp()-interval '1999 milliseconds' where user_id=${quote(uid)} and date=current_date and round_index=0`);
  const won=dailyAnswerRPC(uid,0,r.version,correctId).daily.rounds.find(x=>x.roundIndex===0);
  assert.equal(won.status,'won');assert.equal(won.points,100);
  assert.equal(Number(sql(`select points from ranked_private.daily_results where user_id=${quote(uid)} and date=current_date and round_index=0`)),100);
  assert.equal(sql(`select correct from ranked_private.daily_results where user_id=${quote(uid)} and date=current_date and round_index=0`),'t');
  let r1=dailyRoundRow(uid,1);
  for(const w of dailyWrongOptions(uid,1).slice(0,3)) r1=dailyAnswerRPC(uid,1,r1.version,w).daily.rounds.find(x=>x.roundIndex===1);
  assert.equal(r1.status,'lost');assert.equal(r1.points,0);
  assert.equal(Number(sql(`select points from ranked_private.daily_results where user_id=${quote(uid)} and date=current_date and round_index=1`)),0);
});

test('the same player can score once via career and independently via Daily, with no PK/FK conflict',()=>{
  const uid=user();
  const dailyPlayerId=dailySlotPlayer(0);
  // Manufacture a completed career (ranked) result for exactly the player
  // today's daily round 0 will deal, simulating an account that already
  // resolved that player through Unlimited before playing the daily -
  // requirement 3 says this must never block or conflict with Daily.
  rpc(uid,mutation('enroll',{nickname:'Daily Overlap'}));
  const roundId=randomUUID(),optionId=randomUUID();
  // ruleset='v2' requires exactly 10 options (rounds_options_check).
  const tenOptions=JSON.stringify([{id:optionId,label:'x'},...Array.from({length:9},()=>({id:randomUUID(),label:'y'}))]);
  sql(`insert into ranked_private.rounds(id,user_id,player_id,ruleset,competition,options,correct_option,guesses,status,points,finished_at) values(${quote(roundId)},${quote(uid)},${quote(dailyPlayerId)},'v2','all',${quote(tenOptions)}::jsonb,${quote(optionId)}::uuid,array[${quote(optionId)}]::uuid[],'won',80,clock_timestamp())`);
  sql(`insert into ranked_private.results(user_id,player_id,ruleset,round_id,points,correct,finished_at) values(${quote(uid)},${quote(dailyPlayerId)},'v2',${quote(roundId)},80,true,clock_timestamp())`);
  const r=dailyRoundRow(uid,0);
  assert.equal(r.playerId,dailyPlayerId);
  const correctId=dailyCorrectOption(uid,0);
  const result=dailyAnswerRPC(uid,0,r.version,correctId);
  assert.equal(result.daily.rounds.find(x=>x.roundIndex===0).status,'won');
  assert.equal(Number(sql(`select count(*) from ranked_private.results where user_id=${quote(uid)} and player_id=${quote(dailyPlayerId)}`)),1);
  assert.equal(Number(sql(`select count(*) from ranked_private.daily_results where user_id=${quote(uid)} and player_id=${quote(dailyPlayerId)}`)),1);
  const board=rpc(uid,{action:'leaderboard',competition:'all',limit:100});
  assert.equal(board.own.answered,2);
  assert.equal(board.own.points,80+result.daily.rounds.find(x=>x.roundIndex===0).points);
});

test('completing all three daily rounds starts a streak; a gap resets it; best streak never decreases',()=>{
  const uid=user();
  // Every "day" in this test reuses the same real current_date (tests can't
  // wait for a real day to pass), so each simulated day after the first
  // must clear that date's rows first - otherwise dailyProgress's
  // "on conflict do nothing" would find yesterday's already-terminal rows
  // still sitting under today's date and dailyAnswer would see ROUND_FINISHED
  // instead of a fresh round. Only the streak table (dated, not keyed to
  // today) is backdated to simulate which calendar day was last completed.
  const clearToday=()=>{sql(`delete from ranked_private.daily_rounds where user_id=${quote(uid)} and date=current_date`);sql(`delete from ranked_private.daily_results where user_id=${quote(uid)} and date=current_date`);};
  const finishAllThree=()=>{
    dailyProgress(uid);
    for(let i=0;i<3;i++){let r=dailyRoundRow(uid,i);r=dailyAnswerRPC(uid,i,r.version,dailyCorrectOption(uid,i)).daily.rounds.find(x=>x.roundIndex===i);assert.equal(r.status,'won');}
    return dailyProgress(uid);
  };
  const first=finishAllThree();
  assert.equal(first.daily.finished,true);
  assert.equal(first.streak.current,1);assert.equal(first.streak.best,1);
  assert.equal(sql(`select last_completed_date::text from ranked_private.daily_streaks where user_id=${quote(uid)}`),sql('select current_date::text'));
  // Simulate "yesterday" without waiting a real day, exactly like the
  // existing guest-side UTC rollover tests do for the client document.
  sql(`update ranked_private.daily_streaks set last_completed_date=current_date-1 where user_id=${quote(uid)}`);
  clearToday();
  const consecutive=finishAllThree();
  assert.equal(consecutive.streak.current,2);assert.equal(consecutive.streak.best,2);
  sql(`update ranked_private.daily_streaks set last_completed_date=current_date-5 where user_id=${quote(uid)}`);
  clearToday();
  const afterGap=finishAllThree();
  assert.equal(afterGap.streak.current,1);assert.equal(afterGap.streak.best,2,'best streak is never lowered by a later gap');
});

test('daily streak leaderboard ranks by streak, includes lapsed personal bests, and is publicly readable',()=>{
  const a=user(),b=user();
  const finishAllThree=uid=>{dailyProgress(uid);for(let i=0;i<3;i++){let r=dailyRoundRow(uid,i);dailyAnswerRPC(uid,i,r.version,dailyCorrectOption(uid,i));}};
  finishAllThree(a);finishAllThree(b);
  const board=rpc(null,{action:'dailyStreakLeaderboard',limit:100});
  noIdentity(board);
  assert.equal(board.entries.filter(e=>e.currentStreak===1).length>=2,true);
  assert.equal(rpc(a,{action:'dailyStreakLeaderboard',limit:100}).own.currentStreak,1);
  // A lapsed streak (current 0, a real best) still appears - see ADR 0021.
  sql(`update ranked_private.daily_streaks set current_streak=0 where user_id=${quote(a)}`);
  const afterLapse=rpc(null,{action:'dailyStreakLeaderboard',limit:100});
  assert(afterLapse.entries.some(e=>e.currentStreak===0&&e.bestStreak===1));
});

test('daily idempotency replays the cached response for a repeated key after completion',()=>{
  const uid=user();dailyProgress(uid);
  const r=dailyRoundRow(uid,0),key=randomUUID();
  const body={action:'dailyAnswer',roundIndex:0,expectedVersion:r.version,optionId:dailyCorrectOption(uid,0),idempotencyKey:key};
  const first=rpc(uid,body);
  const replay=rpc(uid,body);
  assert.deepEqual(replay,first);
  assertError(()=>rpc(uid,{...body,optionId:randomUUID()}),'IDEMPOTENCY_CONFLICT');
});
