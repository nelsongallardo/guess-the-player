// Real Chromium journeys; all account APIs are explicit local mocks.
async page=>{
  const browser=page.context().browser(),origin='http://127.0.0.1:4173',checks=[],errors=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const context=await browser.newContext({viewport:{width:375,height:667}});
  try{
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(origin+'/index.html?lang=en');
    await p.locator('#options button').first().waitFor();
    ok(await p.locator('#play-overview').isHidden()&&await p.locator('#round-panel').isVisible(),'Arrival immediately presents the playable Daily');
    ok(await p.locator('#nav-groups').textContent()==='Create group'&&await p.locator('#nav-groups').getAttribute('href').then(h=>h.includes('create=1')),'Group creation is directly discoverable without exploring');
    const clock=await p.evaluate(()=>sessionStorage.getItem('derabona.daily-clock.v1'));
    await p.locator('#language').selectOption('es');
    ok(await p.locator('#nav-groups').textContent()==='Crear grupo'&&await p.evaluate(()=>sessionStorage.getItem('derabona.daily-clock.v1'))===clock,'Language change preserves active game clock');
    await p.locator('#help').click();
    ok(!/Son gratis|iniciales|filas numeradas/.test(await p.locator('#rules').innerText()),'Help removes contradictory hint and timeline copy');
    await p.locator('#rules button').click();
    ok(await p.locator('#options button').count()===10,'Daily opens ten answer choices without a Start click');
    await p.reload();await p.locator('#options button').first().waitFor();
    ok(await p.evaluate(()=>sessionStorage.getItem('derabona.daily-clock.v1'))===clock,'Reload immediately resumes the same Daily clock');
    for(let i=0;i<3;i++){
      const answer=await p.evaluate(()=>{const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10));return d.payloads[Number(document.getElementById('round-number').textContent.match(/(\d)\/3/)[1])-1].player.name;});
      await p.locator('#options button').filter({hasText:answer}).click();
      if(i<2)await p.locator('#next').click();
    }
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Ver resultado','Third player retains terminal feedback with an explicit result action');await p.locator('#next').click();
    ok(await p.locator('#daily-summary').isVisible()&&await p.locator('#result-create').isVisible(),'Completed Daily offers explicit group creation');
    await p.goto(origin+'/index.html?lang=en');
    await p.locator('#daily-summary').waitFor();ok(await p.locator('#daily-summary').isVisible()&&await p.locator('#round-panel').isHidden(),'Returning after completion opens the result directly');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw Error('EXPLICIT_TEST_FAILURE');}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='Could not share this result','Share failure never announces success');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='','Share cancellation remains silent');
    await p.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}}));await p.locator('#daily-summary-share').click();ok(await p.locator('#daily-summary-share-status').textContent()==='Result shared','Successful share announces the actual outcome');
    await p.evaluate(()=>{window.__originalDate=Date;window.Date=class extends window.__originalDate{constructor(...args){super(...(args.length?args:[window.__originalDate.now()+86400000]));}static now(){return window.__originalDate.now()+86400000;}};DailyUI.checkRollover();});await p.locator('#daily-load-new').click();
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isVisible(),'Guest direct UTC rollover replaces yesterday’s summary with today’s round');
    for(let i=0;i<3;i++){const answer=await p.evaluate(()=>{const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10));return d.payloads[Number(document.getElementById('round-number').textContent.match(/(\d)\/3/)[1])-1].player.name;});await p.locator('#options button').filter({hasText:answer}).click();if(i<2)await p.locator('#next').click();}
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Show result','Guest direct rollover clears prior result intent and preserves Show result after player three');await p.locator('#next').click();await p.evaluate(()=>{window.Date=window.__originalDate;});
    await p.locator('#daily-summary-keep-playing').click();
    await p.waitForFunction(()=>sessionStorage.getItem('touchline.clock.v1'));ok(await p.locator('#round-panel').isVisible()&&await p.locator('#daily-summary').isHidden()&&p.url().includes('unlimited=1'),'Play Unlimited immediately opens its puzzle and removes Daily result');
    const career=await p.evaluate(()=>({clock:sessionStorage.getItem('touchline.clock.v1'),player:CareerGame.playerAt(state).id}));
    await p.locator('#hint').click();await p.locator('#nav-groups').click();await p.goBack();await p.locator('#options button').first().waitFor();
    ok(await p.locator('#round-panel').isVisible(),'Browser Back directly resumes the game');
    ok(await p.evaluate(old=>sessionStorage.getItem('touchline.clock.v1')===old.clock&&CareerGame.playerAt(state).id===old.player&&CareerGame.roundAt(state).hints===1,career),'Engaged Unlimited clock/player/hint survive group navigation and Back');
    for(const width of [320,375,1100]){await p.setViewportSize({width,height:667});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Game layout fits ${width}px`);ok(await p.locator('#account-open-label').isVisible()&&await p.locator('#nav-groups').isVisible(),`Labeled utilities and navigation remain visible at ${width}px`);}
    // Portable file: no backend and no asset dependencies.
    const file=await context.newPage();file.on('pageerror',e=>errors.push(e.message));await file.goto(__FILE_URL__);
    await file.locator('#options button').first().waitFor();ok(await file.locator('#play-overview').isHidden()&&await file.locator('#play-friends-detail').textContent().then(t=>t.includes('derabona.club')),'Offline game opens immediately with online group destination explained');
    ok(await file.locator('#options button').count()===10,'Portable file starts its complete guest game');await file.close();
    // Denied storage remains usable in memory, including ready -> timed activation.
    const denied=await browser.newContext();try{await denied.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('DENIED');}});});const d=await denied.newPage();d.on('pageerror',e=>errors.push(e.message));await d.goto(origin+'/index.html?lang=en');await d.locator('#options button').first().waitFor();ok(await d.locator('#options button').count()===10,'Blocked storage retains guest play');}finally{await denied.close();}
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
    await p.evaluate(()=>PlayOverview.activate('daily'));ok(!calls.some(c=>c.action==='dailyProgress'),'Mandatory nickname blocks timed activation');
    rounds=await p.evaluate(()=>DailyChallenge.forDate(new Date().toISOString().slice(0,10)).payloads.map((p,i)=>({roundIndex:i,version:0,playerId:p.player.id,options:p.options,guesses:[],hints:0,status:'playing',points:0,startedAt:new Date(Date.now()-45000).toISOString()})));
    await p.locator('#nickname-prompt-submit').click();await p.locator('#nickname-prompt-dialog').waitFor({state:'hidden'});await p.locator('#options button').first().waitFor();
    ok(enrolls===1&&calls.filter(c=>c.action==='dailyProgress').length===1&&!calls.some(c=>c.action==='start'),'Enrollment opens the chosen Daily automatically without starting Unlimited');
    ok(await p.locator('#play-groups').textContent().then(t=>t.includes('Thursday football')),'Existing group is discoverable below the game');
    await p.locator('#unlimited-mode').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10&&!document.getElementById('hint').disabled);const started=round.startedAt,roundId=round.id;
    ok(calls.filter(c=>c.action==='start').length===1,'One Unlimited click creates one ranked round');
    await p.reload();await p.waitForFunction(()=>document.getElementById('options').children.length===10&&!document.getElementById('hint').disabled);
    ok(round.id===roundId&&round.startedAt===started&&calls.filter(c=>c.action==='start').length===1,'Reload immediately resumes the same server round and timestamp');
    await p.locator('#change-competition').click();ok(await p.locator('#competition-options button').filter({hasText:'La Liga'}).isDisabled(),'Overview playing-round metadata blocks incompatible competition selection');await p.locator('#competitions-close').click();
    round.status='won';round.points=29;await p.evaluate(()=>RankedUI.sync());await p.locator('#change-competition').click();await p.locator('#competition-options button').filter({hasText:'La Liga'}).click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(round.competition==='la-liga'&&round.status==='playing'&&calls.filter(c=>c.action==='start').at(-1).competition==='la-liga','Choosing competition after a resolved round explicitly starts the chosen competition');
    failDaily=true;await p.locator('#daily-mode').click();await p.locator('#daily-retry').waitFor({state:'visible'});
    ok(await p.locator('#round-panel').isHidden(),'Daily failure hides stale Unlimited clues');await p.locator('#daily-retry').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(await p.locator('#round-panel').isVisible(),'Daily direct Retry recovers without mode switching');
    ok(await p.locator('#daily-card').isVisible()&&await p.locator('#change-competition').isHidden(),'Unlimited to Daily restores mode-specific card and hides competition picker');
    await p.locator('#unlimited-mode').click();await p.locator('#daily-mode').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);ok(await p.locator('#daily-card').isVisible(),'Daily re-entry restores its hidden context card');
    for(let i=0;i<3;i++){await p.locator('#options button').first().click();await p.locator('#next').waitFor({state:'visible'});if(i<2)await p.locator('#next').click();}
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#next-label').textContent()==='Show result','Ranked third player also waits for explicit Show result');await p.locator('#next').click();ok(await p.locator('#daily-summary').isVisible(),'Ranked Show result opens the completed summary');
    const directOriginalDate=serverDate;serverDate=new Date(Date.parse(serverDate+'T12:00:00Z')+86400000).toISOString().slice(0,10);rounds=rounds.map(r=>({...r,status:'playing',guesses:[],points:0,version:0}));
    await p.evaluate(()=>{window.__originalDate=Date;window.Date=class extends window.__originalDate{constructor(...args){super(...(args.length?args:[window.__originalDate.now()+86400000]));}static now(){return window.__originalDate.now()+86400000;}};DailyUI.checkRollover();});failDaily=true;await p.locator('#daily-load-new').click();await p.locator('#daily-retry').waitFor({state:'visible'});
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isHidden(),'Ranked direct UTC rollover failure hides yesterday’s summary and clues');await p.locator('#daily-retry').click();await p.waitForFunction(()=>document.getElementById('options').children.length===10);
    ok(await p.locator('#daily-summary').isHidden()&&await p.locator('#round-panel').isVisible(),'Ranked direct UTC rollover retry shows only today’s round');
    await p.evaluate(()=>{window.Date=window.__originalDate;});serverDate=directOriginalDate;await p.evaluate(()=>DailyRankedUI.sync());

    failOverview=true;await p.reload();await p.locator('#play-retry').waitFor({state:'visible'});
    ok(await p.locator('#play-overview').isVisible()&&await p.locator('#round-panel').isHidden(),'Account overview failure cannot expose guest gameplay');await p.locator('#play-practice').click();await p.locator('#options button').first().waitFor();ok(await p.locator('#unlimited-mode').getAttribute('aria-pressed')==='true','Failed account can explicitly enter guest Unlimited practice');
    await p.locator('#daily-mode').click();await p.locator('#play-retry').waitFor();ok(await p.locator('#round-panel').isHidden()&&await p.locator('#daily-retry').isHidden(),'Daily from practice retries account loading without a fabricated Daily failure');
    failOverview=false;await p.locator('#play-retry').click();await p.locator('#options button').first().waitFor();
    await p.locator('#account-open').click();ok(await p.locator('#stat-points-label').textContent()==='Lifetime points','Account identifies cumulative points');await p.setViewportSize({width:1100,height:800});await p.locator('#public-nickname').focus();await p.locator('#alias-help').hover();const tooltip=await p.locator('#alias-tooltip').boundingBox();await p.mouse.move(tooltip.x+tooltip.width/2,tooltip.y+tooltip.height/2,{steps:20});ok(await p.locator('#alias-tooltip').isVisible(),'Pointer can cross into the nickname tooltip without dismissing it');await p.locator('#logout').click();await p.locator('#options button').first().waitFor();ok(await p.locator('#play-overview').isHidden()&&await p.locator('#play-groups').textContent()==='','Sign-out opens guest play and discards previous identity group data');
    ok(errors.length===0,'Account journeys have no JavaScript exceptions');
  }finally{await account.close();}
  return {passed:true,checks:checks.length,labels:checks,requests:calls.map(c=>c.action),errors};
}
