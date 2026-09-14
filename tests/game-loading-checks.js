// Real Chromium; deferred SDK/API mocks, NOT live sign-in timing.
async page => {
  const browser=page.context().browser(), checks=[], contexts=[], releases=[];
  const ok=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
  const gate=()=>{let release;const promise=new Promise(r=>release=r);releases.push(release);return {promise,release};};
  const origin='http://127.0.0.1:4173/index.html?lang=en';
  const context=await browser.newContext({viewport:{width:375,height:667},reducedMotion:'reduce'});contexts.push(context);
  let sdk=gate(),progress=gate(),start=gate(),verify=gate(),calls=[],projection,fail=false,hold=null;
  try {
    await context.addInitScript(()=>localStorage.setItem('derabona.auth.v1','EXPLICIT_MOCK'));
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',async route=>{await sdk.promise;await route.fulfill({contentType:'application/javascript',body:`window.mockSession={access_token:'MOCK',user:{id:'00000000-0000-4000-8000-000000009999'}};window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.mockSession}}),onAuthStateChange:fn=>{window.mockChange=fn;return {data:{subscription:{unsubscribe(){}}}}}}})};`});});
    await context.route('https://*.supabase.co/**',async route=>{
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=route.request().postDataJSON();calls.push(body);
      const snapshot=JSON.parse(JSON.stringify(projection));
      if(body.action==='start')await start.promise;
      else if(calls.length===1)await progress.promise;
      else if(calls.length===3)await verify.promise;
      else if(hold)await hold.promise;
      await route.fulfill({status:fail?500:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(fail?{error:{code:'UNAVAILABLE'}}:snapshot)});
    });
    const p=await context.newPage();await p.goto(origin,{waitUntil:'domcontentloaded'});
    const loading=async label=>{ok(await p.locator('#game-loading-status').isVisible(),label);ok(await p.locator('#round-panel').getAttribute('aria-busy')==='true',label+' aria-busy');};
    await loading('SDK wait shows branded loader');
    ok(await p.locator('.loading-spinner').evaluate(el=>getComputedStyle(el).animationName)==='none','Reduced motion disables spinner animation');
    const players=await p.evaluate(()=>PLAYERS.slice(0,5).map(x=>({id:x.id,name:x.name})));
    projection={profile:{nickname:'Otter-4821'},progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:{all:{answered:0,total:60}}},round:null};
    sdk.release();await p.waitForFunction(()=>!!Accounts.session);await loading('Progress wait keeps loader');
    const saved=await p.evaluate(()=>JSON.stringify(state));await p.evaluate(()=>document.querySelector('#hint').click());ok(await p.evaluate(s=>JSON.stringify(state)===s,saved),'Loading cannot mutate guest state');
    projection={...projection,round:{id:'00000000-0000-4000-8000-000000000100',version:0,playerId:players[0].id,competition:'all',options:players.map((x,i)=>({id:'option-'+i,label:x.name})),guesses:[],hints:0,status:'playing',points:0,startedAt:'2026-09-13T12:00:00Z'}};
    progress.release();await p.waitForFunction(()=>document.querySelector('#game-loading-status').textContent.includes('Preparing'));await loading('Start wait remains visible');
    ok(await p.locator('#account-notice').isHidden(),'No phantom completed notice during start');
    start.release();await p.locator('#timeline .crest-disc img').first().waitFor({state:'visible'});await loading('Confirmation wait shows loader and authoritative career');
    ok(await p.locator('.loading-skeleton').isHidden()&&await p.locator('.loading-brand').isHidden(),'Confirmation preview hides decorative loader content');
    const geometry=await p.evaluate(()=>{const strip=document.querySelector('#game-loading-status').getBoundingClientRect(),row=document.querySelector('#timeline li').getBoundingClientRect();return {stripHeight:strip.height,rowTop:row.top,rowBottom:row.bottom,viewport:innerHeight};});
    ok(geometry.stripHeight>=44&&geometry.stripHeight<=60,'Confirmation strip stays within 44–60px');
    ok(geometry.rowTop>=0&&geometry.rowBottom<=geometry.viewport,'First career row fully visible in short 667px viewport');
    ok(await p.locator('#hint').isDisabled()&&await p.locator('#options button:enabled').count()===0,'Preview remains locked until exact progress readback');
    await p.locator('#language').selectOption('es');ok((await p.locator('#game-loading-status').textContent()).includes('Confirmando'),'Pending confirmation is bilingual');
    verify.release();await p.waitForFunction(()=>!document.querySelector('#hint').disabled);ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#round-panel').getAttribute('aria-busy')==='false','Ready clears loader and busy');
    ok(calls.map(x=>x.action).join(',')==='progress,start,progress','Exact authoritative readback retained without extra requests');
    hold=gate();await p.evaluate(()=>{window.mockSession={access_token:'SECOND',user:{id:'00000000-0000-4000-8000-000000008888'}};window.mockChange('SIGNED_IN',window.mockSession);});await loading('Identity change clears old career behind loader');ok(await p.locator('#round-panel').isHidden(),'Old identity career is hidden');
    fail=true;hold.release();await p.locator('#practice').waitFor({state:'visible'});ok(await p.locator('#game-loading-status').isHidden(),'Failure clears loader');await p.locator('#practice').click();ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#hint').isEnabled(),'Explicit practice clears loader and enables guest play');
    fail=false;hold=null;projection={...projection,round:null,completed:true,progress:{...projection.progress,competitionCounts:{all:{answered:60,total:60}}}};await p.locator('#ranked-retry').click();await p.waitForFunction(()=>document.querySelector('#play-mode').textContent==='CLASIFICADO · NUBE');ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#account-notice').isVisible()&&await p.locator('#round-panel').isHidden(),'Completed projection clears loader without reviving career');
    hold=gate();await p.evaluate(()=>{window.mockSession={access_token:'THIRD',user:{id:'00000000-0000-4000-8000-000000007777'}};window.mockChange('SIGNED_IN',window.mockSession);});await loading('New identity waits independently');await p.waitForFunction(()=>document.querySelector('#play-mode').textContent.includes('Comprobando'));await p.evaluate(()=>{window.mockSession=null;window.mockChange('SIGNED_OUT',null);});hold.release();await p.waitForFunction(()=>document.querySelector('#play-mode').textContent==='INVITADO · SIN CLASIFICACIÓN');ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#hint').isEnabled(),'Signout clears loader; late private result cannot revive account');
    // An HTML-only response proves the loader exists before embedded scripts finish.
    const early=await browser.newContext();contexts.push(early);await early.route('**/index.html*',async route=>{const response=await route.fetch();const html=await response.text();await route.fulfill({response,body:html.slice(0,html.indexOf('<script id="roster-data">'))+'</body></html>'});});const ep=await early.newPage();await ep.goto(origin);ok(await ep.locator('#game-loading-status').isVisible(),'Early HTML paints loader before data/model/UI');
    const nojs=await browser.newContext({javaScriptEnabled:false});contexts.push(nojs);const np=await nojs.newPage();await np.goto(origin);ok(await np.locator('#game-loading-status').isHidden()&&await np.locator('noscript').isVisible(),'No-JS does not display endless loading');
    const offline=await browser.newContext({offline:true});contexts.push(offline);const op=await offline.newPage();await op.goto(__FILE_URL__);await op.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));ok(await op.locator('#game-loading-status').isHidden()&&await op.locator('#hint').isEnabled(),'Actual offline file guest remains playable');await op.locator('#hint').click();ok(await op.locator('#hint-count').textContent()==='1 / 3','Offline guest interaction works');
    return {passed:true,checks,geometry,backend:'Explicit deferred SDK/API mocks; no live signed-in measurement'};
  } finally {releases.forEach(r=>r());for(const c of contexts)await c.close();}
}
