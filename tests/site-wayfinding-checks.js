// Real Chromium journeys; all account APIs are explicit local mocks.
async page=>{
  const browser=page.context().browser(),origin='http://127.0.0.1:4173',checks=[],errors=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const context=await browser.newContext({viewport:{width:375,height:667}});
  try{
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(origin+'/index.html?lang=en');
    ok(await p.locator('#play-overview').isVisible()&&await p.locator('#round-panel').isHidden(),'Arrival presents Play overview');
    ok(await p.evaluate(()=>!sessionStorage.getItem('touchline.clock.v1')&&!sessionStorage.getItem('derabona.daily-clock.v1')&&!document.querySelector('.club')&&!localStorage.getItem('derabona.daily.v2')),'Browsing does not create guest clocks or show clues');
    await p.locator('#language').selectOption('es');
    ok(await p.locator('#nav-groups').textContent()==='Grupos'&&await p.locator('#play-daily-start').textContent()==='Empezar la diaria','Ready screen translates without activating');
    await p.locator('#site-help').click();
    ok(!/Son gratis|iniciales|filas numeradas/.test(await p.locator('#rules').innerText()),'Help removes contradictory hint and timeline copy');
    await p.locator('#rules button').click();
    await p.locator('#play-daily-start').click();await p.waitForFunction(()=>sessionStorage.getItem('derabona.daily-clock.v1'));
    const clock=await p.evaluate(()=>sessionStorage.getItem('derabona.daily-clock.v1'));
    ok(await p.locator('#options button').count()===10,'Explicit start opens ten-choice Daily');
    await p.locator('#play-home').click();
    ok(await p.locator('#play-overview').isVisible()&&await p.evaluate(()=>document.querySelectorAll('.club').length===0),'Back to Play removes active clues');
    await p.reload();await p.locator('#play-daily-start').click();
    ok(await p.evaluate(()=>sessionStorage.getItem('derabona.daily-clock.v1'))===clock,'Continue after reload preserves Daily clock');
    for(let i=0;i<3;i++){
      const answer=await p.evaluate(()=>{const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10));return d.payloads[Number(document.getElementById('round-number').textContent.match(/(\d)\/3/)[1])-1].player.name;});
      await p.locator('#options button').filter({hasText:answer}).click();
      if(i<2)await p.locator('#next').click();
    }
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Ver resultado','Third player retains terminal feedback with an explicit result action');await p.locator('#next').click();
    ok(await p.locator('#daily-summary').isVisible()&&await p.locator('#result-create').isVisible(),'Completed Daily offers explicit group creation');
    await p.goto(origin+'/index.html?lang=en');
    ok(await p.locator('#play-daily-start').textContent()==='View today’s result','Bare URL retains completed Daily instead of switching modes');
    await p.locator('#play-daily-start').click();ok(await p.locator('#daily-summary').isVisible(),'View result reopens today’s summary');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw Error('EXPLICIT_TEST_FAILURE');}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='Could not share this result','Share failure never announces success');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='','Share cancellation remains silent');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='Result shared','Successful share announces the actual outcome');
    await p.evaluate(()=>{window.__originalDate=Date;window.Date=class extends window.__originalDate{constructor(...args){super(...(args.length?args:[window.__originalDate.now()+86400000]));}static now(){return window.__originalDate.now()+86400000;}};DailyUI.checkRollover();});await p.locator('#daily-load-new').click();
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isVisible(),'Guest direct UTC rollover replaces yesterday’s summary with today’s round');
    for(let i=0;i<3;i++){const answer=await p.evaluate(()=>{const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10));return d.payloads[Number(document.getElementById('round-number').textContent.match(/(\d)\/3/)[1])-1].player.name;});await p.locator('#options button').filter({hasText:answer}).click();if(i<2)await p.locator('#next').click();}
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Show result','Guest direct rollover clears prior result intent and preserves Show result after player three');await p.locator('#next').click();await p.evaluate(()=>{window.Date=window.__originalDate;});
    await p.locator('#daily-summary-keep-playing').click();
    ok(await p.locator('#play-overview').isVisible()&&p.url().includes('unlimited=1'),'Play Unlimited resolves to explicit ready state');
    await p.locator('#play-unlimited-start').click();await p.waitForFunction(()=>sessionStorage.getItem('touchline.clock.v1'));
    const career=await p.evaluate(()=>({clock:sessionStorage.getItem('touchline.clock.v1'),player:CareerGame.playerAt(state).id}));
    await p.locator('#hint').click();await p.locator('#nav-groups').click();await p.goBack();await p.locator('#play-overview').waitFor({state:'visible'});
    ok(await p.locator('#play-overview').isVisible(),'Browser Back returns to ready view');
    await p.locator('#play-unlimited-start').click();
    ok(await p.evaluate(old=>sessionStorage.getItem('touchline.clock.v1')===old.clock&&CareerGame.playerAt(state).id===old.player&&CareerGame.roundAt(state).hints===1,career),'Engaged Unlimited clock/player/hint survive group navigation and Back');
    await p.locator('#play-home').click();
    for(const width of [320,375,1100]){await p.setViewportSize({width,height:667});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Ready layout fits ${width}px`);ok(await p.locator('#account-open-label').isVisible()&&await p.locator('#nav-groups').isVisible(),`Labeled utilities and navigation remain visible at ${width}px`);}
    // Portable file: no backend and no asset dependencies.
    const file=await context.newPage();file.on('pageerror',e=>errors.push(e.message));await file.goto(__FILE_URL__);
    ok(await file.locator('#play-overview').isVisible()&&await file.locator('#play-friends-detail').textContent().then(t=>t.includes('online site')),'Offline ready screen explains online destinations');
    await file.locator('#play-daily-start').click();ok(await file.locator('#options button').count()===10,'Portable file starts its complete guest game');await file.close();
    // Denied storage remains usable in memory, including ready -> timed activation.
    const denied=await browser.newContext();try{await denied.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('DENIED');}});});const d=await denied.newPage();d.on('pageerror',e=>errors.push(e.message));await d.goto(origin+'/index.html?lang=en');await d.locator('#play-daily-start').click();ok(await d.locator('#options button').count()===10,'Blocked storage retains guest play');}finally{await denied.close();}
    ok(errors.length===0,'Guest journeys have no JavaScript exceptions');
  }finally{await context.close();}
  const account=await browser.newContext({viewport:{width:375,height:667}}),calls=[],api='https://wayfinding-account-mock.invalid',user='00000000-0000-4000-8000-000000000123';
  let nicknamePrompted=false,round=null,failOverview=false,failDaily=false,rounds=[],enrolls=0,roundCounter=0,serverDate=new Date().toISOString().slice(0,10);
  const profile=()=>({nickname:'Otter-12345678',enrolled:true,nicknamePrompted});
  const progress=()=>({totalPoints:29,answered:1,correct:1,seenPlayerIds:[],competitionCounts:{all:{answered:1,total:221}}});
  const overview=()=>({profile:profile(),progress:progress(),daily:{date:serverDate,status:'ready',completed:0,totalPoints:0,correctCount:0,previous:null},career:{status:round?.status==='playing'?'playing':round?'resolved':'ready',competition:round?.competition||null}});
  try{
    await account.addInitScript(user=>{localStorage.setItem('derabona.auth.v1','EXPLICIT_MOCK_SESSION');window.__wayAuth={session:{access_token:'EXPLICIT_TOKEN',user:{id:user}},listener:null};},user);
    await account.route('**/index.html*',async route=>{const response=await route.fetch();const html=(await response.text()).replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_PUBLIC_MOCK_KEY'})`);await route.fulfill({response,body:html});});
    await account.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__wayAuth.session},error:null}),onAuthStateChange:fn=>{window.__wayAuth.listener=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{const m=window.__wayAuth;m.session=null;localStorage.removeItem('derabona.auth.v1');m.listener?.('SIGNED_OUT',null);return {error:null}}}})};`}));
    await account.route(api+'/**',async route=>{
      const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=req.postDataJSON();calls.push(body);let result,status=200;
      if(body.action==='overview'){result=overview();if(failOverview){result={error:{code:'UNAVAILABLE'}};status=503;}}
      else if(body.action==='list')result={leagues:[{id:'00000000-0000-4000-8000-000000000111',name:'Thursday football',memberCount:2}]};
      else if(body.action==='enroll'){nicknamePrompted=true;enrolls++;result={profile:profile(),progress:progress(),round};}
      else if(body.action==='progress')result={profile:profile(),progress:progress(),round};
      else if(body.action==='start'){if(!round||round.status!=='playing')round={...rounds[0],id:'00000000-0000-4000-8000-'+String(++roundCounter).padStart(12,'0'),status:'playing',competition:body.competition};result={profile:profile(),progress:progress(),round};}
      else if(body.action==='dailyAnswer'){const r=rounds[body.roundIndex];r.guesses.push(body.optionId);r.status='won';r.points=11;r.version++;result={profile:profile(),totalPoints:29,streak:{current:0,best:0},daily:{date:serverDate,rounds,finished:rounds.every(r=>r.status!=='playing'),challengeNumber:1}};}
      else if(body.action==='dailyProgress'){result={profile:profile(),totalPoints:29,streak:{current:0,best:0},daily:{date:serverDate,rounds,finished:rounds.length===3&&rounds.every(r=>r.status!=='playing'),challengeNumber:1}};if(failDaily){failDaily=false;result={error:{code:'UNAVAILABLE'}};status=503;}}
      else throw Error('Unexpected account request '+body.action);
      await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
    });
    const p=await account.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/index.html?lang=en');await p.locator('#nickname-prompt-dialog').waitFor({state:'visible'});
    ok(calls.every(c=>['overview','list'].includes(c.action)),'Account arrival uses overview/list only, never start/progress/dailyProgress');
    await p.evaluate(()=>document.getElementById('play-daily-start').click());ok(!calls.some(c=>c.action==='dailyProgress'),'Mandatory nickname blocks timed activation');
    await p.locator('#nickname-prompt-submit').click();await p.locator('#nickname-prompt-dialog').waitFor({state:'hidden'});await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);
    ok(enrolls===1&&!calls.some(c=>['start','dailyProgress'].includes(c.action)),'Enrollment finishes in ready state without starting gameplay');
    ok(await p.locator('#play-groups').textContent().then(t=>t.includes('Thursday football')),'Member group is visible before playing');
    rounds=await p.evaluate(()=>DailyChallenge.forDate(new Date().toISOString().slice(0,10)).payloads.map((p,i)=>({roundIndex:i,version:0,playerId:p.player.id,options:p.options,guesses:[],hints:0,status:'playing',points:0,startedAt:new Date(Date.now()-45000).toISOString()})));
    await p.locator('#play-unlimited-start').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);const started=round.startedAt,roundId=round.id;
    ok(calls.filter(c=>c.action==='start').length===1,'Explicit Unlimited start creates one ranked round');
    await p.reload();await p.waitForFunction(()=>!document.getElementById('play-unlimited-start').disabled);
    ok(calls.filter(c=>c.action==='start').length===1&&await p.locator('#round-panel').isHidden(),'Reload reads overview without starting or showing a round');
    await p.locator('#play-unlimited-start').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(round.id===roundId&&round.startedAt===started&&calls.filter(c=>c.action==='start').length===1,'Continue preserves server round and timestamp');
    await p.locator('#play-home').click();await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);await p.locator('#play-competition').click();ok(await p.locator('#competition-options button').filter({hasText:'La Liga'}).isDisabled(),'Overview playing-round metadata blocks incompatible competition selection');await p.locator('#competitions-close').click();
    round.status='won';round.points=29;await p.evaluate(()=>PlayOverview.load());await p.locator('#play-competition').click();await p.locator('#competition-options button').filter({hasText:'La Liga'}).click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(round.competition==='la-liga'&&round.status==='playing'&&calls.filter(c=>c.action==='start').at(-1).competition==='la-liga','Choosing competition after a resolved round explicitly starts the chosen competition');
    await p.locator('#play-home').click();await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);failDaily=true;await p.locator('#play-daily-start').click();await p.locator('#daily-retry').waitFor({state:'visible'});
    ok(await p.locator('#round-panel').isHidden(),'Daily failure hides stale Unlimited clues');await p.locator('#daily-retry').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(await p.locator('#round-panel').isVisible(),'Daily direct Retry recovers without mode switching');
    ok(await p.locator('#daily-card').isVisible()&&await p.locator('#change-competition').isHidden(),'Unlimited to Daily restores mode-specific card and hides competition picker');
    await p.locator('#play-home').click();await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);await p.locator('#play-daily-start').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);ok(await p.locator('#daily-card').isVisible(),'Daily re-entry restores its hidden context card');
    for(let i=0;i<3;i++){await p.locator('#options button').first().click();await p.locator('#next').waitFor({state:'visible'});if(i<2)await p.locator('#next').click();}
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Show result','Ranked third player also waits for explicit Show result');await p.locator('#next').click();ok(await p.locator('#daily-summary').isVisible(),'Ranked Show result opens the completed summary');
    const directOriginalDate=serverDate;serverDate=new Date(Date.parse(serverDate+'T12:00:00Z')+86400000).toISOString().slice(0,10);rounds=rounds.map(r=>({...r,status:'playing',guesses:[],points:0,version:0}));
    await p.evaluate(()=>{window.__originalDate=Date;window.Date=class extends window.__originalDate{constructor(...args){super(...(args.length?args:[window.__originalDate.now()+86400000]));}static now(){return window.__originalDate.now()+86400000;}};DailyUI.checkRollover();});failDaily=true;await p.locator('#daily-load-new').click();await p.locator('#daily-retry').waitFor({state:'visible'});
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isHidden(),'Ranked direct UTC rollover failure hides yesterday’s summary and clues');await p.locator('#daily-retry').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isVisible(),'Ranked direct UTC rollover retry shows only today’s round');
    await p.evaluate(()=>{window.Date=window.__originalDate;});serverDate=directOriginalDate;await p.evaluate(()=>DailyRankedUI.sync());
    await p.locator('#play-home').click();await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);
    const originalDate=serverDate;rounds=rounds.map(r=>({...r,status:'playing',guesses:[],points:0,version:0}));serverDate=new Date(Date.parse(serverDate+'T12:00:00Z')+86400000).toISOString().slice(0,10);
    await p.evaluate(()=>{window.__originalDate=Date;window.Date=class extends window.__originalDate{constructor(...args){super(...(args.length?args:[window.__originalDate.now()+86400000]));}static now(){return window.__originalDate.now()+86400000;}};});await p.evaluate(()=>PlayOverview.load());failDaily=true;await p.locator('#play-daily-start').click();await p.locator('#daily-retry').waitFor({state:'visible'});
    ok(await p.locator('#round-panel').isHidden()&&await p.locator('#daily-summary').isHidden(),'UTC rollover failure cannot display yesterday’s cached clues or label its result today');
    await p.locator('#daily-retry').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);ok(await p.locator('#round-panel').isVisible(),'UTC rollover failure has direct retry for the new day');
    await p.evaluate(()=>{window.Date=window.__originalDate;});serverDate=originalDate;

    await p.locator('#play-home').click();failOverview=true;await p.reload();await p.locator('#play-retry').waitFor({state:'visible'});
    ok(await p.locator('#play-daily-start').isDisabled()&&await p.locator('#round-panel').isHidden(),'Account overview failure cannot expose guest gameplay');failOverview=false;await p.locator('#play-retry').click();await p.waitForFunction(()=>!document.getElementById('play-daily-start').disabled);
    await p.locator('#account-open').click();ok(await p.locator('#stat-points-label').textContent()==='Lifetime points','Account identifies cumulative points');await p.setViewportSize({width:1100,height:800});await p.locator('#public-nickname').focus();await p.locator('#alias-help').hover();const tooltip=await p.locator('#alias-tooltip').boundingBox();await p.mouse.move(tooltip.x+tooltip.width/2,tooltip.y+tooltip.height/2,{steps:20});ok(await p.locator('#alias-tooltip').isVisible(),'Pointer can cross into the nickname tooltip without dismissing it');await p.locator('#logout').click();ok(await p.locator('#play-overview').isVisible()&&await p.locator('#play-groups').textContent()==='','Sign-out discards previous identity group data');
    ok(errors.length===0,'Account journeys have no JavaScript exceptions');
  }finally{await account.close();}
  return {passed:true,checks:checks.length,labels:checks,requests:calls.map(c=>c.action),errors};
}
