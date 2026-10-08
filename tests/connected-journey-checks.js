// Real Chromium + REAL Edge handler + REAL PostgreSQL through tests/leagues-bridge.mjs
// (start it first on 127.0.0.1:54330). Supabase Auth/OAuth and the SDK are
// SIMULATED: a scripted SDK stands in for Google, so this is not hosted OAuth evidence.
async page => {
 const BRIDGE='http://127.0.0.1:54330',SUPA='https://iaebecfxjwjzkapqdeha.supabase.co',SITE='http://127.0.0.1:4173';
 const browser=page.context().browser(),checks=[],errors=[],contexts=[];
 const ok=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
 const db=async sql=>(await page.context().request.post(BRIDGE+'/__test/sql',{data:{sql}})).json();
 const q=v=>"'"+String(v).replaceAll("'","''")+"'";
 const uuid=async()=>(await db('select gen_random_uuid()::text id'))[0].id;
 const account=async(nickname,prompted=true)=>{const id=await uuid();await db(`insert into auth.users(id) values(${q(id)}); insert into ranked_private.accounts(user_id,nickname,nickname_prompted) values(${q(id)},${q(nickname)},${prompted})`);return id;};
 const session=id=>({access_token:'test-'+id,user:{id,user_metadata:{}}});
 const sdk=state=>`(()=>{const listeners=[];window.supabase={createClient:(u,k,c)=>{const key=c.auth.storageKey;const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};return {auth:{
   getSession:async()=>({data:{session:read()},error:null}),
   onAuthStateChange:fn=>{listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
   signInWithOAuth:async({options})=>{const u=new URL(options.redirectTo);${state.oauthUser?`u.searchParams.set('code','CODE-${state.oauthUser}')`:`u.searchParams.set('error','access_denied')`};setTimeout(()=>location.assign(u.href),50);return {error:null};},
   exchangeCodeForSession:async code=>{const id=code.slice(5),s={access_token:'test-'+id,user:{id,user_metadata:{}}};localStorage.setItem(key,JSON.stringify(s));return {data:{session:s},error:null};},
   signOut:async()=>{localStorage.removeItem(key);return {error:null};}}};}};})();`;
 async function makeContext({signedIn=null,oauthUser=null,denySession=false,viewport={width:1280,height:900}}={}){
   const ctx=await browser.newContext({viewport});contexts.push(ctx);
   const state={oauthUser,fail:0,requests:[],urls:[]};
   await ctx.addInitScript(([s,deny])=>{
     if(s&&!localStorage.getItem('mock-seeded')){localStorage.setItem('derabona.auth.v1',JSON.stringify(s));localStorage.setItem('mock-seeded','1');}
     if(deny)Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('denied','SecurityError');}});
   },[signedIn?session(signedIn):null,denySession]);
   await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({contentType:'application/javascript',body:sdk(state)}));
   await ctx.route('https://*.posthog.com/**',r=>r.abort());
   await ctx.route(SUPA+'/functions/v1/**',async r=>{
     const req=r.request(),body=req.postData();
     if(req.method()==='POST')state.requests.push({endpoint:req.url().split('/').pop(),body:body?JSON.parse(body):null});
     if(state.fail&&req.url().endsWith('private-leagues')&&req.method()==='POST'){state.fail--;return r.abort('failed');}
     const response=await r.fetch({url:req.url().replace(SUPA,BRIDGE)});await r.fulfill({response});
   });
   ctx.on('request',req=>state.urls.push(req.url()));
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
   return {ctx,p,state};
 }
 const visible=(p,sel,timeout=8000)=>p.locator(sel).waitFor({state:'visible',timeout});
 const text=async(p,sel)=>(await p.locator(sel).textContent()).trim();
 try{
  await db('delete from public.test_clock');
  const name='Journey '+Date.now().toString().slice(-7),id=await account(name),user=await makeContext({signedIn:id});
  await user.p.goto(SITE+'/index.html?lang=en');
  await user.p.locator('#options button').first().waitFor();
  ok((await db(`select count(*)::int n from ranked_private.daily_rounds where user_id=${q(id)}`))[0].n===3,'Real authenticated arrival automatically loads the three Daily rounds');
  ok(!user.state.requests.some(r=>r.body?.action==='start'),'Daily arrival never starts an unrelated Unlimited round');
  await user.p.getByRole('link',{name:'Create a group',exact:true}).click();
  await visible(user.p,'#league-name-input');await user.p.locator('#league-name-input').fill(name);await user.p.locator('#league-create').click();
  await visible(user.p,'#league-invite-dialog');await user.p.locator('#invite-dialog-close').click();
  ok((await db(`select count(*)::int n from ranked_private.daily_rounds where user_id=${q(id)}`))[0].n===3,'Creating and viewing a group adds no extra Daily rows');
  await user.p.locator('#nav-play').click();await user.p.locator('#options button').first().waitFor();
  ok(await user.p.getByRole('link',{name:new RegExp(name)}).isVisible(),'New group is discoverable on real authenticated Play overview');
  await user.p.locator('#options button').first().waitFor({state:'visible'});
  ok((await db(`select count(*)::int n from ranked_private.daily_rounds where user_id=${q(id)}`))[0].n===3,'Return to Play reuses the actual server Daily rounds');
  for(let i=0;i<3;i++){
    const answer=await user.p.evaluate(i=>DailyChallenge.forDate(new Date().toISOString().slice(0,10)).payloads[i].player.name,i);
    await user.p.locator('#options button').filter({hasText:answer}).click();
    await user.p.waitForFunction(()=>!document.querySelector('#next').disabled&&!document.querySelector('#next').hidden);
    if(i<2)await user.p.locator('#next').click();
  }
  ok(await user.p.locator('#daily-summary').isHidden(),'Actual server final answer keeps feedback before result action');
  await user.p.locator('#next').click();await visible(user.p,'#daily-summary');
  const scores=(await db(`select count(*)::int n,sum(points)::int total from ranked_private.daily_results where user_id=${q(id)}`))[0];
  ok(scores.n===3&&scores.total>0,'Three UI answers create authoritative server results');
  await user.p.getByRole('link',{name:new RegExp(name)}).click();await visible(user.p,'#league-view');
  ok((await user.p.locator('#league-entries tr').first().locator('td').nth(2).innerText()).trim()===String(scores.total),'Result group link opens weekly standings with actual earned Daily points');
  await user.p.locator('#nav-play').click();await user.p.locator('#daily-summary').waitFor();
  ok(await user.p.locator('#daily-summary').isVisible(),'Return to Play directly shows the actual completed Daily');
  ok(errors.length===0,'Integrated real API journey has no browser errors');
  return {passed:true,checks,points:scores.total,evidence:'Real local PostgreSQL and Edge; Auth SDK simulated; browser UI creates group and completes Daily'};
 }finally{for(const ctx of contexts)await ctx.close();}
}
