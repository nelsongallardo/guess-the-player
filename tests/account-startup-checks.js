// Real Supabase SDK, synthetic stored session and mocked API responses.
// Exercises INITIAL_SESSION timing; never contacts hosted Auth or gameplay.
async page => {
  const browser=page.context().browser(),origin='http://127.0.0.1:4173',api='https://startup-api.invalid';
  const context=await browser.newContext(),checks=[],errors=[],calls=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const user='00000000-0000-4000-8000-000000004321';
  let count=0,failAll=false,nicknamePrompted=false,rounds=[],overviewHold=null,dailyHold=null,failDaily=false;
  const gate=()=>{let release,seen;const wait=new Promise(r=>release=r),entered=new Promise(r=>seen=r);return {wait,entered,release,seen};};
  try{
    await context.addInitScript(user=>localStorage.setItem('derabona.auth.v1',JSON.stringify({access_token:'EXPLICIT_SYNTHETIC_TOKEN',refresh_token:'EXPLICIT_SYNTHETIC_REFRESH',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user}})),user);
    await context.route('**/index.html*',async route=>{
      const response=await route.fetch();
      const html=(await response.text()).replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_PUBLIC_KEY'})`);
      await route.fulfill({response,body:html});
    });
    await context.route(api+'/**',async route=>{
      const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      const body=req.postDataJSON();calls.push(body.action);
      if(body.action==='list')return route.fulfill({headers,contentType:'application/json',body:'{"leagues":[]}'});
      if(body.action==='dailyProgress'){
        if(dailyHold){dailyHold.seen();await dailyHold.wait;}
        if(failDaily)return route.fulfill({status:503,headers,contentType:'application/json',body:'{"error":{"code":"UNAVAILABLE"}}'});
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({profile:{nickname:'Otter-12345678',enrolled:true,nicknamePrompted:true},totalPoints:75,streak:{current:1,best:1},daily:{date:new Date().toISOString().slice(0,10),challengeNumber:1,finished:true,rounds}})});
      }
      if(body.action!=='overview')throw Error('Unexpected startup request '+body.action);
      if(overviewHold){overviewHold.seen();await overviewHold.wait;}
      const nth=++count;
      // A successful first response must not be discarded in favour of a
      // redundant second request that can independently fail.
      if(failAll||nth>1)return route.fulfill({status:503,headers,contentType:'application/json',body:'{"error":{"code":"UNAVAILABLE"}}'});
      await req.frame().page().waitForTimeout(250);
      return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({profile:{nickname:'Otter-12345678',enrolled:true,nicknamePrompted},progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:{all:{answered:0,total:221}}},daily:{date:new Date().toISOString().slice(0,10),status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null},career:{status:'ready',competition:null}})});
    });
    // Sample every frame of the first load: a stored session must never be
    // painted as signed out ("Sign in") while the SDK is still reading it.
    await context.addInitScript(()=>{
      window.__accountFrames=[];const start=performance.now();
      const frame=()=>{const b=document.getElementById('account-open');if(b)window.__accountFrames.push({visible:getComputedStyle(b).visibility==='visible'&&!!b.getClientRects().length,label:document.getElementById('account-open-label').textContent});
        if(performance.now()-start<5000)requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const settled=()=>p.waitForFunction(()=>document.getElementById('nickname-prompt-dialog').open||!document.getElementById('play-retry').hidden);
    await p.goto(origin+'/index.html?lang=en');await settled();
    {const frames=await p.evaluate(()=>window.__accountFrames);
      ok(frames.length>0&&frames.every(f=>!f.visible||f.label==='Account'),'Account control stays hidden, never "Sign in", until the stored session resolves');
      ok(frames.some(f=>!f.visible)&&frames.at(-1).visible&&frames.at(-1).label==='Account','Account control appears once the session is known');}
    ok(await p.locator('#nickname-prompt-dialog').isVisible(),'Successful initial overview survives the real SDK INITIAL_SESSION event');
    ok(count===1,'Startup sends one overview request');
    ok(await p.locator('#play-retry').isHidden(),'No spurious game-load error after successful overview');
    count=0;failAll=true;await p.reload();await settled();
    ok(await p.locator('#play-retry').isVisible()&&await p.locator('#round-panel').isHidden(),'Genuine startup failure offers retry without exposing guest gameplay');
    ok(count===1,'Failed startup does not trigger a second competing request');
    count=0;failAll=false;await p.locator('#play-retry').click();await p.locator('#nickname-prompt-dialog').waitFor();
    ok(count===1,'Explicit retry recovers using one request');
    ok(calls.every(action=>['overview','list'].includes(action)),'Startup never bypasses nickname enrollment or starts a puzzle');
    // Returning to a finished Daily must remain one loading scene until the
    // authoritative Daily response, even though overview resolves earlier.
    rounds=await p.evaluate(()=>DailyChallenge.forDate(new Date().toISOString().slice(0,10)).payloads.map((p,i)=>({roundIndex:i,version:1,playerId:p.player.id,options:p.options,guesses:[p.options.find(o=>o.label===p.player.name).id],hints:0,clueCountry:null,cluePosition:null,status:'won',points:25,startedAt:new Date().toISOString()})));
    await context.addInitScript(()=>{
      window.__dailyLoadFrames=[];const start=performance.now();
      const frame=()=>{const visible=id=>!!document.getElementById(id)?.getClientRects().length;
        if(document.getElementById('game-loading-status'))window.__dailyLoadFrames.push({loader:visible('game-loading-status'),daily:visible('daily-card'),round:visible('round-panel'),summary:visible('daily-summary')});
        if(performance.now()-start<10000)requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
    nicknamePrompted=true;count=0;overviewHold=gate();dailyHold=gate();
    await p.reload();await overviewHold.entered;
    ok(await p.locator('#game-loading-status').isVisible(),'Spinner remains visible while account overview is pending');
    ok(await p.locator('#daily-card').isHidden()&&await p.locator('#round-panel').isHidden(),'No incomplete Daily content during account loading');
    overviewHold.release();await dailyHold.entered;
    ok(await p.locator('#game-loading-status').isVisible(),'The same spinner remains while the Daily response is pending');
    ok(await p.locator('#daily-card').isHidden()&&await p.locator('#round-panel').isHidden()&&await p.locator('#daily-summary').isHidden(),'Daily loading exposes neither a placeholder game nor a premature summary');
    await p.locator('#account-open').click();await p.locator('#account-dialog').press('Escape');
    ok(await p.locator('#game-loading-status').isVisible(),'Opening and closing Account preserves the pending Daily spinner');
    await p.evaluate(()=>{PlayOverview.show('daily',false);});
    ok(await p.locator('#game-loading-status').isVisible()&&await p.locator('#daily-card').isHidden()&&await p.locator('#round-panel').isHidden(),'Re-entering during an existing request restores the loading view');
    await p.locator('#language').selectOption('es');
    ok(await p.locator('#game-loading-status').isVisible()&&(await p.locator('#game-loading-text').innerText()).includes('Preparando'),'Language change preserves and translates the pending spinner');
    dailyHold.release();await p.locator('#daily-summary').waitFor();await p.waitForTimeout(80);
    ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#round-panel').isHidden(),'Completed response switches directly from spinner to summary');
    ok((await p.locator('#daily-summary-line').innerText()).includes('75'),'Summary uses authoritative completed points');
    const frames=await p.evaluate(()=>window.__dailyLoadFrames);
    ok(frames.length>0&&frames.every(f=>!f.round&&(f.loader?!f.daily&&!f.summary:f.summary)),'Every rendered frame shows either the spinner or the completed summary');
    ok(count===1&&calls.filter(a=>a==='dailyProgress').length===1,'Completed arrival adds no duplicate account or Daily requests');
    // Re-enter through the same controller as mode/Back navigation, with the
    // completed result cached and a fresh Daily read still outstanding.
    dailyHold=gate();await p.evaluate(()=>{PlayOverview.show('daily',false);});await dailyHold.entered;
    ok(await p.locator('#game-loading-status').isVisible()&&await p.locator('#round-panel').isHidden()&&await p.locator('#daily-summary').isHidden(),'Re-entry waits for the fresh response without exposing a cached last round');
    dailyHold.release();await p.locator('#daily-summary').waitFor();
    dailyHold=null;failDaily=true;await p.evaluate(()=>{PlayOverview.show('daily',false);});await p.locator('#daily-retry').waitFor();
    ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#round-panel').isHidden()&&await p.locator('#daily-summary').isHidden(),'Failed re-entry offers recovery without falling back to cached final-round gameplay');
    failDaily=false;await p.locator('#daily-retry').click();await p.locator('#daily-summary').waitFor();
    overviewHold=null;dailyHold=null;count=0;failDaily=true;await p.reload();await p.locator('#daily-retry').waitFor();
    ok(await p.locator('#game-loading-status').isHidden()&&await p.locator('#daily-summary').isHidden(),'Failed Daily ends the spinner and offers retry without stale results');
    failDaily=false;await p.locator('#daily-retry').click();await p.locator('#daily-summary').waitFor();
    ok(await p.locator('#round-panel').isHidden()&&await p.locator('#game-loading-status').isHidden(),'Retry of a completed Daily also opens its summary directly');
    ok(errors.length===0,'Startup and recovery produce no JavaScript exceptions');
    return {passed:true,checks:checks.length,labels:checks,requests:calls,errors};
  }finally{overviewHold?.release();dailyHold?.release();await context.unrouteAll({behavior:'wait'});await context.close();}
}
