// HTTP contract tests with explicitly injected/mock Auth + RPC transport.
// NOT hosted Google OAuth/JWT or database verification (see SQL suite).
import { handler, validate, type Dependencies } from '../supabase/functions/_shared/http.ts';
const uid='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
function equal(a:unknown,b:unknown) { if(JSON.stringify(a)!==JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function fixture(overrides:Partial<Dependencies>={}) {
  const calls:unknown[]=[];
  const deps:Dependencies={
    getUser:async token=>{calls.push(['auth',token]);return token==='valid'?{id:uid}:null;},
    rpc:async(id,body)=>{calls.push(['rpc',id,body]);return {data:{ok:true},error:null};},
    deleteUser:async id=>{calls.push(['delete',id]);return true;},...overrides,
  };
  return {calls,run:handler(deps),remove:handler(deps,'account-delete')};
}
function request(body:unknown,auth:string|null='Bearer valid',origin='https://derabona.club') {
  const headers:Record<string,string>={'content-type':'application/json',origin};if(auth)headers.authorization=auth;
  return new Request('http://localhost/functions/v1/ranked-game',{method:'POST',headers,body:JSON.stringify(body)});
}
Deno.test('JWT verifier determines identity; forged/expired/missing/anonymous credentials never reach RPC',async()=>{
  for(const auth of [null,'Bearer forged.payload.sig','Bearer expired','Basic valid','Bearer valid extra']) {
    const f=fixture();equal((await f.run(request({action:'progress'},auth))).status,401);
    equal(f.calls.filter((x:any)=>x[0]==='rpc').length,0);
  }
  for(const getUser of [async()=>({id:uid,is_anonymous:true}),async()=>({id:'bad'}),async()=>{throw Error('offline');}]) {
    const f=fixture({getUser});equal((await f.run(request({action:'progress'}))).status,401);equal(f.calls.length,0);
  }
  const f=fixture();equal((await f.run(request({action:'progress'}))).status,200);
  equal(f.calls,[['auth','valid'],['rpc',uid,{action:'progress'}]]);
});
Deno.test('public leaderboard only is anonymous; private identity/score/time injection rejected',async()=>{
  const f=fixture();equal((await f.run(request({action:'leaderboard'},null))).status,200);
  equal(f.calls,[['rpc',null,{action:'leaderboard'}]]);
  for(const field of ['user_id','verified_user_id','userId','points','elapsedMs','hints','playerId','correctOption']) {
    const f=fixture();equal((await f.run(request({action:'progress',[field]:uid}))).status,400);equal(f.calls,[]);
  }
});
Deno.test('daily streak leaderboard is also anonymous-readable; every other daily action requires identity',async()=>{
  const f=fixture();equal((await f.run(request({action:'dailyStreakLeaderboard'},null))).status,200);
  equal(f.calls,[['rpc',null,{action:'dailyStreakLeaderboard'}]]);
  for(const body of [{action:'dailyProgress'},{action:'dailyHint',idempotencyKey:key,roundIndex:0,expectedVersion:0},{action:'dailyAnswer',idempotencyKey:key,roundIndex:0,expectedVersion:0,optionId:key}]) {
    const f=fixture();equal((await f.run(request(body,null))).status,401);equal(f.calls,[]);
  }
});
Deno.test('origin/preflight/method limits and no-store responses',async()=>{
  const f=fixture();equal((await f.run(request({action:'progress'},'Bearer valid','https://evil.test'))).status,403);
  equal((await f.run(request({action:'progress'},'Bearer valid','https://derabona.club.evil.test'))).status,403);
  equal(f.calls,[]);
  for(const origin of ['https://derabona.club','http://localhost:4173','http://127.0.0.1:4173','http://[::1]:4173']) {
    const res=await f.run(new Request('http://localhost',{method:'OPTIONS',headers:{origin}}));
    equal(res.status,204);equal(res.headers.get('access-control-allow-origin'),origin);
  }
  const res=await f.run(new Request('http://localhost'));equal(res.status,405);equal(res.headers.get('cache-control'),'no-store');
});
Deno.test('malformed JSON, media types, arrays and streamed oversized bodies are rejected',async()=>{
  const f=fixture();
  for(const body of ['null','[]','{','"text"',' '.repeat(8193)+'{}']) {
    const res=await f.run(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body}));equal(res.status,400);
  }
  equal((await f.run(new Request('http://localhost',{method:'POST',body:'{}'}))).status,400);equal(f.calls,[]);
});
Deno.test('strict request schemas, literal identifiers, pagination and nicknames',()=>{
  equal(validate({action:'start',idempotencyKey:key}),true);
  equal(validate({action:'answer',idempotencyKey:key,roundId:uid,optionId:key,expectedVersion:0}),true);
  equal(validate({action:'dailyProgress'}),true);
  equal(validate({action:'dailyHint',idempotencyKey:key,roundIndex:0,expectedVersion:0}),true);
  equal(validate({action:'dailyAnswer',idempotencyKey:key,roundIndex:2,expectedVersion:3,optionId:key}),true);
  equal(validate({action:'dailyStreakLeaderboard'}),true);
  equal(validate({action:'dailyStreakLeaderboard',limit:50,offset:0}),true);
  for(const body of [
    {action:'reset'},{action:'start',idempotencyKey:key.replaceAll('-','')},
    {action:'start',idempotencyKey:key,competition:'unknown'},
    {action:'hint',idempotencyKey:key,roundId:uid,expectedVersion:'0'},
    {action:'hint',idempotencyKey:key,roundId:uid,expectedVersion:-1},
    {action:'answer',idempotencyKey:key,roundId:uid,expectedVersion:0,optionId:'fixed'},
    {action:'leaderboard',limit:101},{action:'leaderboard',offset:-1},{action:'leaderboard',limit:1.5},
    {action:'enroll',idempotencyKey:key,nickname:'<script>'},
    {action:'enroll',idempotencyKey:key,nickname:' abc'},
    {action:'dailyProgress',idempotencyKey:key},
    {action:'dailyHint',idempotencyKey:key,roundIndex:3,expectedVersion:0},
    {action:'dailyHint',idempotencyKey:key,roundIndex:-1,expectedVersion:0},
    {action:'dailyHint',idempotencyKey:key,roundIndex:0,expectedVersion:0,roundId:uid},
    {action:'dailyHint',idempotencyKey:key.replaceAll('-',''),roundIndex:0,expectedVersion:0},
    {action:'dailyAnswer',idempotencyKey:key,roundIndex:0,expectedVersion:0,optionId:'fixed'},
    {action:'dailyAnswer',idempotencyKey:key,roundIndex:0,optionId:key},
    {action:'dailyStreakLeaderboard',limit:101},{action:'dailyStreakLeaderboard',offset:-1},
  ]) equal(validate(body),false);
});
Deno.test('RPC errors have bounded public codes, 429 retry headers and no internal details',async()=>{
  for(const [code,status] of [['VERSION_CONFLICT',409],['RATE_LIMITED',429],['ROUND_NOT_FOUND',404],['ROUND_LOCKED',409],['secret db detail',500]] as const) {
    for(const rpc of [async()=>({data:null,error:{message:code}}),async()=>({data:{error:{code}},error:null})]) {
      const res=await fixture({rpc}).run(request({action:'progress'}));equal(res.status,status);
      const body=await res.json();equal(body.error.code,status===500?'INTERNAL_ERROR':code);
      if(status===429)equal(res.headers.get('retry-after'),'60');
      if(JSON.stringify(body).includes('secret'))throw Error('Internal detail leaked');
    }
  }
});
Deno.test('account hard deletion needs verified identity and exact confirmation; caller cannot choose another user',async()=>{
  for(const body of [{},{confirmation:'delete'},{confirmation:'DELETE',userId:key}]) {
    const f=fixture();equal((await f.remove(request(body))).status,400);equal(f.calls,[]);
  }
  const f=fixture();equal((await f.remove(request({confirmation:'DELETE'},null))).status,401);
  const res=await f.remove(request({confirmation:'DELETE'}));equal(res.status,200);equal(await res.json(),{deleted:true});
  equal(f.calls,[['auth','valid'],['delete',uid]]);
  equal((await fixture({deleteUser:async()=>false}).remove(request({confirmation:'DELETE'}))).status,500);
});
