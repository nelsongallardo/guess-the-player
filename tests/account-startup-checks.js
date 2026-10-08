// Real Supabase SDK, synthetic stored session and mocked API responses.
// Exercises INITIAL_SESSION timing; never contacts hosted Auth or gameplay.
async page => {
  const browser=page.context().browser(),origin='http://127.0.0.1:4173',api='https://startup-api.invalid';
  const context=await browser.newContext(),checks=[],errors=[],calls=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const user='00000000-0000-4000-8000-000000004321';
  let count=0,failAll=false;
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
      if(body.action!=='overview')throw Error('Unexpected startup request '+body.action);
      const nth=++count;
      // A successful first response must not be discarded in favour of a
      // redundant second request that can independently fail.
      if(failAll||nth>1)return route.fulfill({status:503,headers,contentType:'application/json',body:'{"error":{"code":"UNAVAILABLE"}}'});
      await req.frame().page().waitForTimeout(250);
      return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({profile:{nickname:'Otter-12345678',enrolled:true,nicknamePrompted:false},progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:{all:{answered:0,total:221}}},daily:{date:new Date().toISOString().slice(0,10),status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null},career:{status:'ready',competition:null}})});
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const settled=()=>p.waitForFunction(()=>document.getElementById('nickname-prompt-dialog').open||!document.getElementById('play-retry').hidden);
    await p.goto(origin+'/index.html?lang=en');await settled();
    ok(await p.locator('#nickname-prompt-dialog').isVisible(),'Successful initial overview survives the real SDK INITIAL_SESSION event');
    ok(count===1,'Startup sends one overview request');
    ok(await p.locator('#play-retry').isHidden(),'No spurious game-load error after successful overview');
    count=0;failAll=true;await p.reload();await settled();
    ok(await p.locator('#play-retry').isVisible()&&await p.locator('#round-panel').isHidden(),'Genuine startup failure offers retry without exposing guest gameplay');
    ok(count===1,'Failed startup does not trigger a second competing request');
    count=0;failAll=false;await p.locator('#play-retry').click();await p.locator('#nickname-prompt-dialog').waitFor();
    ok(count===1,'Explicit retry recovers using one request');
    ok(calls.every(action=>['overview','list'].includes(action)),'Startup never bypasses nickname enrollment or starts a puzzle');
    ok(errors.length===0,'Startup and recovery produce no JavaScript exceptions');
    return {passed:true,checks:checks.length,labels:checks,requests:calls,errors};
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
}
