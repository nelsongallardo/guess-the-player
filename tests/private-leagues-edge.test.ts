// Private-leagues HTTP contract with explicitly injected/mock Auth + RPC.
// NOT hosted JWT/OAuth or database verification (see the PostgreSQL suite).
import { handler, validateLeague, validate, type Dependencies } from '../supabase/functions/_shared/http.ts';
const uid='11111111-1111-4111-8111-111111111111';
const key='22222222-2222-4222-8222-222222222222';
const league='33333333-3333-4333-8333-333333333333';
const token='A'.repeat(64);
function equal(a:unknown,b:unknown) { if(JSON.stringify(a)!==JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function fixture(overrides:Partial<Dependencies>={}) {
  const calls:unknown[]=[];
  const deps:Dependencies={
    getUser:async t=>{calls.push(['auth',t]);return t==='valid'?{id:uid}:null;},
    rpc:async(id,body)=>{calls.push(['ranked',id,body]);return {data:{ok:true},error:null};},
    leagueRpc:async(id,body)=>{calls.push(['league',id,body]);return {data:{ok:true},error:null};},
    deleteUser:async id=>{calls.push(['delete',id]);return true;},...overrides,
  };
  return {calls,run:handler(deps,'private-leagues'),ranked:handler(deps)};
}
function request(body:unknown,auth:string|null='Bearer valid',origin='https://derabona.club') {
  const headers:Record<string,string>={'content-type':'application/json',origin};if(auth)headers.authorization=auth;
  return new Request('http://localhost/functions/v1/private-leagues',{method:'POST',headers,body:JSON.stringify(body)});
}
Deno.test('every league action, including invitation preview, requires a verified non-anonymous user',async()=>{
  for(const body of [{action:'list'},{action:'preview',token},{action:'standings',leagueId:league}]) {
    for(const auth of [null,'Bearer forged','Basic valid']) {
      const f=fixture();equal((await f.run(request(body,auth))).status,401);equal(f.calls.filter((c:any)=>c[0]!=='auth'),[]);
    }
    const f=fixture({getUser:async()=>({id:uid,is_anonymous:true})});equal((await f.run(request(body))).status,401);
  }
  const f=fixture();const res=await f.run(request({action:'list'}));
  equal(res.status,200);equal(res.headers.get('cache-control'),'no-store');
  equal(f.calls,[['auth','valid'],['league',uid,{action:'list'}]]);
});
Deno.test('league requests reach only the league RPC, gameplay requests only the gameplay RPC',async()=>{
  const f=fixture();await f.run(request({action:'list'}));await f.ranked(request({action:'progress'}));
  equal(f.calls.filter((c:any)=>c[0]!=='auth').map((c:any)=>c[0]),['league','ranked']);
  equal((await f.run(request({action:'dailyProgress'}))).status,400);
  equal((await f.run(request({action:'start',competition:'all',idempotencyKey:key}))).status,400);
  equal((await f.ranked(request({action:'list'}))).status,400);
  equal((await fixture({leagueRpc:undefined}).run(request({action:'list'}))).status,500);
});
Deno.test('strict per-action league schemas reject identity, score, clock, date, trophy and owner injection',()=>{
  for(const body of [
    {action:'list'},{action:'preview',token},{action:'standings',leagueId:league},{action:'standings',leagueId:league,period:'today',limit:50,offset:0},
    {action:'history',leagueId:league,limit:1},{action:'memberWins',leagueId:league,memberId:uid},{action:'manage',leagueId:league},
    {action:'create',name:'Los Pibes',idempotencyKey:key},{action:'create',name:'Ñandúes ⚽',idempotencyKey:key},
    {action:'rename',leagueId:league,name:'New',expectedVersion:0,idempotencyKey:key},{action:'join',token,idempotencyKey:key},
    {action:'leave',leagueId:league,idempotencyKey:key},{action:'remove',leagueId:league,memberId:uid,expectedVersion:3,idempotencyKey:key},
    {action:'restore',leagueId:league,memberId:uid,expectedVersion:3,idempotencyKey:key},
    {action:'rotateInvite',leagueId:league,expectedVersion:0,idempotencyKey:key},{action:'delete',leagueId:league,expectedVersion:0,idempotencyKey:key},
  ]) equal([body.action,validateLeague(body)],[body.action,true]);
  for(const field of ['userId','user_id','verified_user_id','ownerId','points','score','elapsedMs','date','weekStart','trophies','winner','rank'])
    for(const body of [{action:'list'},{action:'standings',leagueId:league},{action:'join',token,idempotencyKey:key}])
      equal([field,validateLeague({...body,[field]:1})],[field,false]);
  for(const body of [
    {action:'reset'},{action:'standings'},{action:'standings',leagueId:'not-a-uuid'},{action:'standings',leagueId:league,period:'month'},
    {action:'standings',leagueId:league,limit:51},{action:'standings',leagueId:league,limit:0},{action:'history',leagueId:league,offset:-1},{action:'history',leagueId:league,offset:1.5},
    {action:'preview'},{action:'preview',token:'short'},{action:'preview',token:'A'.repeat(63)+'+'},{action:'preview',token:'A'.repeat(129)},
    {action:'join',token},{action:'join',token,idempotencyKey:key.replaceAll('-','')},
    {action:'create',name:'ab',idempotencyKey:key},{action:'create',name:' Padded',idempotencyKey:key},{action:'create',name:'x'.repeat(41),idempotencyKey:key},
    {action:'create',name:'Bell\u0007s',idempotencyKey:key},{action:'create',name:42,idempotencyKey:key},{action:'create',idempotencyKey:key},
    {action:'rename',leagueId:league,name:'New',idempotencyKey:key},{action:'remove',leagueId:league,expectedVersion:0,idempotencyKey:key},
    {action:'delete',leagueId:league,expectedVersion:'0',idempotencyKey:key},{action:'rotateInvite',leagueId:league,expectedVersion:-1,idempotencyKey:key},
  ]) equal([JSON.stringify(body),validateLeague(body)],[JSON.stringify(body),false]);
  equal(validateLeague({action:'create',name:'😀'.repeat(40),idempotencyKey:key}),true);
  equal(validateLeague({action:'create',name:'😀'.repeat(41),idempotencyKey:key}),false);
  equal(validate({action:'progress'}),true);
});
Deno.test('bounded body, media type, origin and method checks apply to the league endpoint',async()=>{
  const f=fixture();
  equal((await f.run(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',name:'x'.repeat(8200),idempotencyKey:key})}))).status,400);
  equal((await f.run(new Request('http://localhost',{method:'POST',body:'{"action":"list"}'}))).status,400);
  equal((await f.run(request({action:'list'},'Bearer valid','https://evil.test'))).status,403);
  equal((await f.run(new Request('http://localhost',{method:'GET'}))).status,405);
  equal(f.calls,[]);
});
Deno.test('league RPC errors map to bounded public codes without internal detail',async()=>{
  for(const [code,status] of [['LEAGUE_UNAVAILABLE',404],['INVITE_UNAVAILABLE',404],['MEMBER_NOT_FOUND',404],['FORBIDDEN',403],['OWNER_CANNOT_LEAVE',409],
    ['LEAGUE_LIMIT',409],['LEAGUE_FULL',409],['NICKNAME_REQUIRED',409],['VERSION_CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['INVALID_LEAGUE_NAME',400],
    ['RATE_LIMITED',429],['secret relation ranked_private.friend_league_invites',500]] as const) {
    for(const leagueRpc of [async()=>({data:null,error:{message:code}}),async()=>({data:{error:{code}},error:null})]) {
      const res=await fixture({leagueRpc}).run(request({action:'list'}));equal(res.status,status);
      const body=await res.json();equal(body.error.code,status===500?'INTERNAL_ERROR':code);
      if(status===429)equal(res.headers.get('retry-after'),'60');
      if(JSON.stringify(body).includes('secret'))throw Error('Internal detail leaked');
    }
  }
});
