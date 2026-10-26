// Real browser + real PostHog SDK; ingestion intercepted, account API explicitly simulated.
async page => {
 const browser=page.context().browser(),base='http://127.0.0.1:4173',checks=[];
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const game=await (await page.request.get(base+'/index.html')).text(),board=await (await page.request.get(base+'/leaderboard.html')).text();
 await page.goto(base+'/index.html');
 const fixture=await page.evaluate(()=>({players:PLAYERS.slice(0,10).map(p=>({id:p.id,name:p.name})),daily:DailyChallenge.forDate(new Date().toISOString().slice(0,10))}));
 const sdk=await (await page.request.get('https://eu-assets.i.posthog.com/static/array.js')).text();
 for(const scenario of ['daily-guest','daily-ranked','unlimited-ranked','groups','leaderboard']){
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage(),errors=[],posts=[];
  const boardPage=['groups','leaderboard'].includes(scenario),ranked=scenario.endsWith('ranked'),daily=scenario.startsWith('daily');
  const api='https://analytics-account-fixture.invalid',profile={nickname:'Otter-12345678',nicknamePrompted:true,enrolled:true},date=new Date().toISOString().slice(0,10);
  const rounds=fixture.daily.payloads.map((payload,i)=>({roundIndex:i,version:0,playerId:payload.player.id,options:payload.options.map((o,n)=>({id:'option-'+i+'-'+n,label:o.label})),answer:payload.player.name,guesses:[],hints:0,status:'playing',points:0,startedAt:new Date().toISOString()}));
  const round={id:'00000000-0000-4000-8000-000000000001',version:0,playerId:fixture.players[0].id,competition:'all',options:fixture.players.map((v,i)=>({id:'option-'+i,label:v.name})),guesses:[],hints:0,status:'playing',points:0,startedAt:new Date().toISOString()};
  const progress={totalPoints:0,answered:0,correct:0,competitionCounts:{all:{answered:0,total:221}},seenPlayerIds:[]};let dropAnswer=ranked;
  const receipts=new Map();
  p.setDefaultTimeout(8000);
  p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(ranked=>{window.coverageEvents=[];if(ranked)localStorage.setItem('derabona.auth.v1','EXPLICIT_FIXTURE');},ranked);
  await ctx.route('https://derabona.club/**',r=>r.fulfill({contentType:'text/html',body:(boardPage?board:game).replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'TEST_PUBLIC_KEY'})`)}));
  await ctx.route(/https:\/\/[^/]*posthog\.com\//,r=>{
   if(r.request().url().includes('/static/array.js'))return r.fulfill({contentType:'application/javascript',body:sdk+`
;{const original=posthog.init.bind(posthog);posthog.init=(token,c)=>original(token,{...c,opt_out_useragent_filter:true,before_send:e=>{const clean=c.before_send(e);if(clean)coverageEvents.push(clean);return clean;}});}`});
   if(r.request().method()==='POST')posts.push(r.request().url());return r.fulfill({status:200,contentType:'application/json',body:'{"status":1}'});
  });
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:${ranked?"{access_token:'PRIVATE_FIXTURE_TOKEN',user:{id:'PRIVATE_ACCOUNT_ID'}}":"null"}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};`}));
  await ctx.route(api+'/**',async r=>{
   if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   const b=r.request().postDataJSON(),reply=data=>r.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(data)});
   if(receipts.has(b.idempotencyKey))return reply(receipts.get(b.idempotencyKey));
   if(b.action==='list')return reply({leagues:[]});
   if(b.action==='leaderboard')return reply({entries:[],total:0,own:null,competition:'all'});
   if(b.action==='overview')return reply({profile,progress,daily:{date,status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null},career:{status:'ready',competition:null}});
   const target=daily?rounds[b.roundIndex??0]:round;
   if(['hint','dailyHint'].includes(b.action)){target.hints++;target.version++;}
   if(['answer','dailyAnswer'].includes(b.action)){target.guesses.push(b.optionId);target.version++;target.status='won';target.points=73;}
   const data=daily?{profile,totalPoints:73,streak:{current:0,best:0},daily:{date,challengeNumber:fixture.daily.challengeNumber,rounds,finished:false}}:{profile,progress,round};
   if(b.idempotencyKey)receipts.set(b.idempotencyKey,JSON.parse(JSON.stringify(data)));
   if(['answer','dailyAnswer'].includes(b.action)&&dropAnswer){dropAnswer=false;return r.abort('failed');}
   return reply(data);
  });
  try{
   const url=boardPage?'https://derabona.club/leaderboard.html?lang=en'+(scenario==='groups'?'&view=friends&league=PRIVATE_LEAGUE':''):'https://derabona.club/?lang=en'+(!daily?'&unlimited=1':'');
   await p.goto(url+'&utm_source=reddit&utm_medium=social&utm_campaign=coverage#PRIVATE_FRAGMENT',{referer:'https://www.reddit.com/private/path?secret=NEVER'});
   await p.locator('#analytics-banner:visible').waitFor();assert(posts.length===0,'No ingestion before consent '+scenario);
   await p.locator('#analytics-banner [data-analytics-consent="accepted"]').click();
   await p.waitForFunction(()=>coverageEvents.some(e=>e.event==='$pageview'));
   if(boardPage){
    let events=await p.evaluate(()=>coverageEvents);assert(events.length===1&&events[0].event==='$pageview','Board never invents gameplay');
    const props=events[0].properties;assert(props.page===scenario&&props.$pathname==='/leaderboard.html'&&props.$current_url==='https://derabona.club/leaderboard.html','Board safe category/path');
    assert(props.utm_source==='reddit','Campaign survives early invite URL scrub');
    await p.locator('#analytics-settings').click();await p.locator('#privacy-dialog [data-analytics-consent="declined"]').click();
    const n=posts.length;await p.locator('#language').selectOption('es');assert(posts.length===n,'Board withdrawal stops ingestion');
   }else{
    await p.waitForFunction(()=>!document.querySelector('#hint').disabled);
    await p.locator('#hint').click();await p.waitForFunction(()=>coverageEvents.some(e=>e.event==='hint_used'));
    const answer=daily?fixture.daily.payloads[0].player.name:fixture.players[0].name;
    await p.locator('#options button').filter({hasText:answer}).click();
    if(ranked){
     await p.waitForFunction(()=>document.querySelector('#account-notice').textContent.includes('Retry')||document.querySelector('#account-retry')&&!document.querySelector('#account-retry').hidden);
     assert(await p.evaluate(()=>coverageEvents.filter(e=>e.event==='round_completed').length)===0,'Uncertain mutation does not record success');
     if(daily)await p.locator('#daily-retry').click();
     else {await p.locator('#account-open').click();await p.waitForFunction(()=>coverageEvents.some(e=>e.event==='round_completed'));await p.locator('#account-close').click();}
    }
    await p.waitForFunction(()=>coverageEvents.some(e=>e.event==='round_completed'));
    const events=await p.evaluate(()=>coverageEvents),done=events.filter(e=>e.event==='round_completed');
    assert(done.length===1&&events.filter(e=>e.event==='answer_submitted').length===1,'Exactly one accepted answer/completion '+scenario);
    assert(done[0].properties.mode===(daily?'daily':'unlimited')&&done[0].properties.access===(ranked?'ranked':'guest'),'Correct gameplay context '+scenario);
    await p.evaluate(()=>{render(false,true);render(false,true);});assert(await p.evaluate(()=>coverageEvents.filter(e=>e.event==='round_completed').length)===1,'Renders do not duplicate completion');
    await p.reload();await p.waitForFunction(()=>coverageEvents.some(e=>e.event==='$pageview'));assert(await p.evaluate(()=>coverageEvents.filter(e=>e.event==='round_completed').length)===0,'Reload never replays a completion');
   }
   const clean=JSON.stringify(await p.evaluate(()=>coverageEvents));
   for(const secret of ['PRIVATE_FIXTURE_TOKEN','PRIVATE_ACCOUNT_ID','PRIVATE_LEAGUE','PRIVATE_FRAGMENT','NEVER','/private/path'])assert(!clean.includes(secret),'No secrets '+secret);
   assert(posts.length>0,'Actual SDK transport observed '+scenario);assert(errors.length===0,errors.join('; '));checks.push(scenario);
  }catch(error){throw Error(scenario+': '+error.message+'; captured='+JSON.stringify(await p.evaluate(()=>coverageEvents.map(e=>({event:e.event,mode:e.properties.mode,access:e.properties.access}))))+'; errors='+errors.join(';')+'; sdk='+await p.evaluate(()=>JSON.stringify({loaded:window.posthog?.__loaded,consent:Analytics.getConsent(),scripts:[...document.scripts].map(s=>s.src).filter(Boolean),filter:window.posthog?.config?.opt_out_useragent_filter,opted:window.posthog?.has_opted_in_capturing?.(),context:typeof analyticsContext==='function'?analyticsContext():null,renderError:(()=>{try{if(typeof render==='function')render();return null}catch(e){return e.message}})()}))+'; notice='+await p.locator('#account-notice').textContent().catch(()=>''));}finally{await ctx.unrouteAll({behavior:'ignoreErrors'});await ctx.close();}
 }
 return {passed:true,checks,evidence:'Real SDK, intercepted ingestion, simulated accounts; no hosted backend claim'};
}
