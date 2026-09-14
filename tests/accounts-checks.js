// REAL Chromium UI tests with EXPLICIT route-mocked Supabase SDK + API.
// These prove frontend behavior, NOT hosted Google OAuth or database correctness.
async page => {
  const browser=page.context().browser(),checks=[],errors=[],calls=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const origin='http://127.0.0.1:4173',api='https://explicit-account-mock.invalid';
  const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const competitions=['all','champions-league','premier-league','la-liga','argentine-primera','brasileirao'];
  let projection={profile:{nickname:'Otter-4821',enrolled:true},progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:Object.fromEntries(competitions.map(id=>[id,{answered:0,total:60}]))},round:null};
  let failAction=null,dropAnswer=false,boardFail=false,nicknameTaken=false,deleteFail=false,holdProgress=false,releaseProgress;
  let players=[],roundCounter=0;const receipts=new Map();
  const createRound=competition=>{const p=players[roundCounter++%players.length];return {id:uuid(100+roundCounter),version:0,playerId:p.id,competition,options:players.slice(0,5).map((p,i)=>({id:uuid(i+1),label:p.name})),guesses:[],hints:0,clueCountry:null,cluePosition:null,status:'playing',points:0,startedAt:new Date().toISOString()};};
  const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});
  try{
    await context.addInitScript(()=>{window.__mockAuth={session:null,calls:[],listener:null};window.__mockLogin=()=>{const m=window.__mockAuth;m.session={access_token:'EXPLICIT_TEST_TOKEN',user:{id:'00000000-0000-4000-8000-000000009999',user_metadata:{full_name:'MUST NEVER PUBLISH',avatar_url:'https://private.invalid/photo'}}};localStorage.setItem('derabona.auth.v1','EXPLICIT_TEST_SESSION');m.listener?.('SIGNED_IN',m.session);};});
    await context.route('**/index.html*',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_PUBLIC_MOCK_KEY'})`);await route.fulfill({response,body:html});});
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:(url,key,config)=>{const m=window.__mockAuth;m.config=config; if(localStorage.getItem('derabona.auth.v1')) window.__mockLogin();return {auth:{getSession:async()=>{if(m.refreshError)throw Error('EXPIRED_REFRESH_TOKEN');return {data:{session:m.session},error:null}},onAuthStateChange:fn=>{m.listener=fn;return {data:{subscription:{unsubscribe(){}}}}},exchangeCodeForSession:async code=>{m.calls.push(['exchange',code,location.href]);if(code==='EXPIRED_PKCE_CODE')return {data:{session:null},error:Error('OTP_EXPIRED')};window.__mockLogin();return {data:{session:m.session},error:null}},setSession:async tokens=>{m.calls.push(['setSession',tokens,location.href]);window.__mockLogin();return {data:{session:m.session},error:null}},signInWithOAuth:async value=>{m.calls.push(['oauth',value]);return {error:Error('EXPLICIT_MOCK_CANCELLED')}},signOut:async value=>{m.calls.push(['logout',value]);m.session=null;localStorage.removeItem('derabona.auth.v1');m.listener?.('SIGNED_OUT',null);return {error:null}}}}}};` }));
    await context.route(api+'/**',async route=>{
      const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=req.postDataJSON();calls.push({body:JSON.parse(JSON.stringify(body)),headers:req.headers(),url:req.url()});
      const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      const error=(code,status=409)=>respond({error:{code,message:code}},status);
      if(req.headers().authorization==='Bearer EXPIRED_TEST_TOKEN')return error('AUTH_REQUIRED',401);
      if(req.url().endsWith('account-delete')){if(deleteFail)return error('INTERNAL_ERROR',500);projection={...projection,profile:null,round:null,progress:{...projection.progress,totalPoints:0,answered:0}};return respond({deleted:true});}
      if(body.action==='leaderboard'){
        if(boardFail){boardFail=false;return error('INTERNAL_ERROR',500);}
        const all=Array.from({length:23},(_,i)=>({rank:i<2?1:i+1,nickname:i===0?'<img src=x onerror=alert(1)>':'Neutral '+i,points:500-i,answered:7,correct:5}));
        const entries=body.competition==='brasileirao'?[]:all.slice(body.offset,body.offset+body.limit);
        return respond({entries,total:body.competition==='brasileirao'?0:23,own:projection.profile?.enrolled&&projection.progress.answered>0?{rank:22,points:projection.progress.totalPoints}:null,competition:body.competition});
      }
      if(body.action==='progress'){if(!projection.profile)projection.profile={nickname:'Otter-4821',enrolled:true};if(holdProgress){holdProgress=false;await new Promise(r=>releaseProgress=r);}return respond(projection);}
      if(body.action===failAction){failAction=null;return error('VERSION_CONFLICT');}
      if(body.action==='enroll'&&nicknameTaken&&body.nickname==='Neutral Falcon')return error('NICKNAME_TAKEN');
      if(receipts.has(body.idempotencyKey))return respond(receipts.get(body.idempotencyKey));
      if(body.action==='start'&&body.competition==='la-liga'&&projection.progress.answered===2)return respond({...projection,round:null,completed:true});
      if(body.action==='start'&&projection.round?.status!=='playing')projection.round=createRound(body.competition);
      if(body.action==='enroll')projection.profile={nickname:body.nickname,enrolled:true};
      if(body.action==='hint'){projection.round.hints++;projection.round.version++;projection.round.clueCountry='Portugal';if(projection.round.hints===2)projection.round.cluePosition='Forward';}
      if(body.action==='answer'){
        const r=projection.round;r.guesses.push(body.optionId);r.version++;
        if(r.options.find(o=>o.id===body.optionId).label===players.find(p=>p.id===r.playerId).name){r.status='won';r.points=73;}else if(r.guesses.length===3)r.status='lost';
        if(r.status!=='playing'&&!projection.progress.seenPlayerIds.includes(r.playerId)){projection.progress.seenPlayerIds.push(r.playerId);projection.progress.totalPoints+=r.points;projection.progress.answered++;if(r.status==='won')projection.progress.correct++;for(const c of competitions)projection.progress.competitionCounts[c].answered++;}
      }
      receipts.set(body.idempotencyKey,JSON.parse(JSON.stringify(projection)));
      if(body.action==='answer'&&dropAnswer){dropAnswer=false;return route.abort('failed');}
      return respond(projection);
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const ready=()=>p.waitForFunction(()=>document.querySelector('#play-mode').textContent==='RANKED · CLOUD'&&!document.querySelector('#hint').disabled);
    await p.goto(origin+'/index.html?lang=en#access_token=ATTACKER&refresh_token=ATTACKER_REFRESH');
    ok(await p.evaluate(()=>!Accounts.session&&window.__mockAuth.calls.length===0)&&p.url()===origin+'/index.html?lang=en','Unsolicited implicit tokens are scrubbed without importing an account');
    await p.goto(origin+'/index.html?lang=en');players=await p.evaluate(()=>PLAYERS.slice(0,5).map(p=>({id:p.id,name:p.name})));
    await p.locator('#hint').click();const guest=await p.evaluate(()=>JSON.stringify({state,lifetime,seen:[...seen]}));
    await p.locator('#account-open').click();p.once('dialog',d=>d.dismiss());await p.locator('#google-login').click();
    ok(await p.evaluate(()=>window.__mockAuth.calls.length===0),'Pre-login warning cancellation never contacts OAuth');
    p.once('dialog',d=>d.accept());await p.locator('#google-login').click();await p.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('did not complete'));
    ok(await p.evaluate(value=>JSON.stringify({state,lifetime,seen:[...seen]})===value,guest),'Mock OAuth cancellation preserves guest progress');
    ok(await p.evaluate(()=>window.__mockAuth.calls[0][1].provider==='google'&&window.__mockAuth.calls[0][1].options.redirectTo.endsWith('?lang=en')),'Google provider uses sanitized language redirect');
    await p.locator('#account-close').click();
    // Explicit mocked callback, never a real Google login.
    holdProgress=true;await p.goto(origin+'/index.html?lang=en&code=EXPLICIT_SECRET&state=EXPLICIT_STATE#access_token=EXPLICIT_FRAGMENT&refresh_token=EXPLICIT_REFRESH');
    while(!releaseProgress)await p.waitForTimeout(10);
    const loadingGuest=await p.evaluate(()=>JSON.stringify({state,lifetime,seen:[...seen]}));
    await p.evaluate(()=>{for(const id of ['hint','next','replay','reset-progress'])document.getElementById(id).click();document.querySelector('#options button')?.click();});
    ok(await p.evaluate(value=>JSON.stringify({state,lifetime,seen:[...seen]})===value,loadingGuest),'Auth loading guards every gameplay handler against guest leakage');
    ok(await p.locator('#round-panel').isHidden()&&await p.locator('#score').textContent()==='—','Auth loading hides stale guest career and score');releaseProgress();releaseProgress=null;await ready();
    ok(p.url()===origin+'/index.html?lang=en','Callback code, state and tokens scrub before SDK initialization');
    ok(await p.evaluate(()=>window.__mockAuth.calls[0][2]===location.href&&window.__mockAuth.config.auth.persistSession===true),'Mock auth observes clean URL and persistent account configuration');
    ok(await p.locator('#score').textContent()==='0','Ranked score comes from server, never guest');
    await p.locator('#account-open').click();
    ok(await p.locator('#enrolled-status').textContent()==='Public alias: Otter-4821'&&await p.locator('#nickname-consent').count()===0,'Automatic server animal alias is visible without enrollment gate');
    await p.locator('#enroll').click();ok(!calls.some(c=>c.body.action==='enroll'),'Blank optional nickname keeps animal alias without a mutation');
    await p.locator('#alias-help').tap();ok(await p.locator('#alias-tooltip').isVisible()&&(await p.locator('#alias-tooltip').textContent()).includes('random animal'),'Mobile tap exposes animal alias tooltip');
    await p.locator('#public-nickname').focus();ok(await p.locator('#alias-tooltip').isHidden(),'Tooltip dismisses on blur');
    await p.setViewportSize({width:1280,height:900});await p.locator('#alias-help').focus();ok(await p.locator('#alias-tooltip').isVisible(),'Desktop keyboard focus exposes tooltip');
    await p.locator('#alias-help').hover();await p.mouse.move(0,0);
    ok(await p.locator('#alias-help').evaluate(el=>el===document.activeElement)&&await p.locator('#alias-tooltip').isVisible(),'Pointer leaving focused trigger preserves tooltip');
    await p.keyboard.press('Escape');ok(await p.locator('#alias-tooltip').isHidden()&&await p.locator('#account-dialog').isVisible(),'Escape dismisses tooltip without closing Account');
    await p.locator('#public-nickname').focus();await p.locator('#alias-help').hover();ok(await p.locator('#alias-tooltip').isVisible(),'Desktop hover exposes tooltip');
    const tooltipBox=await p.locator('#alias-tooltip').boundingBox();
    await p.mouse.move(tooltipBox.x+tooltipBox.width/2,tooltipBox.y+tooltipBox.height/2,{steps:20});
    ok(await p.locator('#alias-tooltip').isVisible()&&await p.locator('#alias-tooltip').evaluate(el=>el.matches(':hover')),'Pointer crosses trigger to hoverable tooltip content');
    await p.mouse.move(0,0);ok(await p.locator('#alias-tooltip').isHidden(),'Leaving shared region without trigger focus dismisses tooltip');
    await p.locator('#alias-help').tap();ok(await p.locator('#alias-tooltip').isVisible(),'Touch opens tooltip after pointer departure');
    await p.locator('#alias-help').tap();ok(await p.locator('#alias-tooltip').isHidden(),'Second touch toggles tooltip closed');
    await p.locator('#alias-help').tap();ok(await p.locator('#alias-tooltip').isVisible(),'Third touch reopens tooltip');
    await p.locator('#public-nickname').tap();ok(await p.locator('#alias-tooltip').isHidden(),'Outside touch dismisses tooltip');
    await p.locator('#account-close').click();await p.setViewportSize({width:375,height:667});
    await p.locator('#language').selectOption('es');await p.locator('#account-open').click();await p.locator('#alias-help').tap();
    ok((await p.locator('#alias-tooltip').textContent()).includes('nombre de animal al azar')&&await p.locator('#enroll').textContent()==='Guardar apodo'&&(await p.locator('#nickname-label').textContent()).includes('opcional')&&(await p.locator('#enrolled-status').textContent()).includes('Otter-4821'),'Spanish tooltip, optional rename and alias are translated without changing identity');
    await p.locator('#account-close').click();await p.locator('#language').selectOption('en');
    await p.evaluate(()=>{window.__mockAuth.session={...window.__mockAuth.session,access_token:'REFRESHED_TEST_TOKEN'};});
    await p.evaluate(()=>Accounts.request({action:'leaderboard',competition:'all',limit:20,offset:0},'ranked-game',true));
    ok(calls.at(-1).headers.authorization==='Bearer REFRESHED_TEST_TOKEN','Public read refreshes SDK session instead of reusing cached token');
    ok(await p.evaluate(async()=>(await Accounts.request({action:'leaderboard',competition:'all',limit:20,offset:0},'ranked-game',true)).own===null),'Automatic alias alone does not create a rank before a verified result');
    await p.evaluate(()=>{window.__mockAuth.session={...window.__mockAuth.session,access_token:'EXPIRED_TEST_TOKEN'};});
    const beforeExpired=calls.length;await p.evaluate(competition=>Accounts.request({action:'leaderboard',competition,limit:20,offset:0},'ranked-game',true),'premier-league');
    ok(calls.length===beforeExpired+2&&calls.at(-2).headers.authorization==='Bearer EXPIRED_TEST_TOKEN'&&!calls.at(-1).headers.authorization,'Expired authenticated league board retries once anonymously');
    const mutationCalls=calls.length;
    ok(await p.evaluate(async()=>{try{await Accounts.request({action:'hint'},'ranked-game',true);return false;}catch{return true;}}),'Even an incorrectly public-marked mutation rejects expired authentication');
    ok(calls.length===mutationCalls+1&&calls.at(-1).headers.authorization==='Bearer EXPIRED_TEST_TOKEN','Rejected mutation never retries anonymously');
    await p.evaluate(()=>{window.__mockAuth.session=null;});
    await p.evaluate(competition=>Accounts.request({action:'leaderboard',competition,limit:20,offset:0},'ranked-game',true),'all');
    ok(!calls.at(-1).headers.authorization,'Missing refreshed session leaves global public board usable');
    await p.evaluate(()=>{window.__mockAuth.refreshError=true;});
    await p.evaluate(competition=>Accounts.request({action:'leaderboard',competition,limit:20,offset:0},'ranked-game',true),'la-liga');
    ok(!calls.at(-1).headers.authorization,'Refresh-token failure still renders anonymous league board');
    await p.evaluate(()=>{window.__mockAuth.refreshError=false;window.__mockLogin();});
    ok(calls.filter(c=>c.body.action==='progress').every(c=>Object.keys(c.body).length===1),'Progress sends no guest state or score import');
    const localBefore=await p.evaluate(()=>sessionStorage.getItem(STORAGE_KEY));
    await p.locator('#hint').click();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='1 / 3');await p.locator('#hint').click();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='2 / 3');
    ok(!await p.locator('#timeline').evaluate(el=>el.classList.contains('years-revealed')),'Ranked years stay hidden before the third hint, same as guest/practice');
    await p.locator('#hint').click();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='3 / 3');
    ok(await p.locator('#timeline').evaluate(el=>el.classList.contains('years-revealed')),'Third ranked hint reveals club years, same as guest/practice');
    ok(await p.locator('#hint').isDisabled(),'Server hint projection enforces three-hint UI cap');
    const active=projection.round.id;await p.locator('#change-competition').click();await p.locator('#competition-options button').nth(2).click();await p.waitForFunction(()=>!document.querySelector('#options button').disabled);
    ok(projection.round.id===active&&await p.evaluate(()=>document.querySelector('#competition-current').textContent===copy().competitions.all),'Selecting another league cannot replace server active round');
    dropAnswer=true;await p.locator('#options button').first().click();await p.locator('#ranked-retry').waitFor({state:'visible'});
    ok(await p.evaluate(value=>sessionStorage.getItem(STORAGE_KEY)===value,localBefore),'Failed ranked mutation never writes guest state');
    const first=calls.filter(c=>c.body.action==='answer').at(-1);await p.locator('#ranked-retry').click();await p.locator('#next').waitFor({state:'visible'});
    const retry=calls.filter(c=>c.body.action==='answer').at(-1);ok(JSON.stringify(first.body)===JSON.stringify(retry.body),'Lost answer response retries byte-equivalent body and identical idempotency key');
    ok(await p.locator('#score').textContent()==='73'&&projection.progress.answered===1,'Receipt retry displays server points once');
    const ownResult=await p.evaluate(()=>Accounts.request({action:'leaderboard',competition:'all',limit:20,offset:0},'ranked-game',true));ok(ownResult.own.rank===22&&!calls.some(c=>c.body.action==='enroll'),'First verified result shows own rank automatically without nickname submission');
    await p.locator('#next').click();await ready();ok(projection.round.playerId!==players[0].id,'Next server round excludes first resolved player');
    await p.locator('#account-open').click();await p.locator('#public-nickname').fill('Neutral Falcon');nicknameTaken=true;await p.locator('#enroll').click();await p.waitForFunction(()=>document.querySelector('#play-mode').textContent.includes('unavailable'));await p.locator('#account-close').click();await p.locator('#ranked-retry').click();await ready();
    await p.locator('#account-open').click();await p.locator('#public-nickname').fill('Neutral Eagle');await p.locator('#enroll').click();await p.waitForFunction(()=>document.querySelector('#enrolled-status').textContent.includes('Neutral Eagle'));
    ok(projection.profile.nickname==='Neutral Eagle','Nickname conflict releases rejected payload so user can correct it');
    ok(!JSON.stringify(calls).includes('MUST NEVER PUBLISH')&&!JSON.stringify(calls).includes('avatar_url'),'No Google name or photo sent to API');await p.locator('#account-close').click();
    ok((await p.evaluate(()=>Accounts.request({action:'leaderboard',competition:'all',limit:20,offset:0},'ranked-game',true))).own.rank===22,'Signed-in board shows own server rank');
    failAction='hint';await p.locator('#hint').click();await p.locator('#practice').waitFor({state:'visible'});await p.locator('#practice').click();const n=calls.length;await p.locator('#hint').click();ok(calls.length===n&&await p.locator('#play-mode').textContent()==='PRACTICE · UNRANKED','Network failure practice requires explicit action and sends no ranked mutation');
    await p.locator('#ranked-retry').click();await ready();ok(await p.locator('#score').textContent()==='73','Reconnect restores authoritative account total without practice import');
    const stableRound=JSON.stringify(projection.round);await p.locator('#language').selectOption('es');ok(await p.locator('#play-mode').textContent()==='CLASIFICADO · NUBE'&&JSON.stringify(projection.round)===stableRound,'Spanish account UI preserves active server round');await p.locator('#language').selectOption('en');
    const other=await context.newPage();await other.goto(origin+'/index.html?lang=en');await other.waitForFunction(()=>document.querySelector('#play-mode').textContent==='RANKED · CLOUD');ok(await other.locator('#score').textContent()==='73'&&await other.evaluate(()=>RankedUI.player().id)===projection.round.playerId,'Second browser tab resumes same server account and active round');await other.close();
    for(const option of [0,2,3]){await p.locator('#options button').nth(option).click();await p.waitForFunction(()=>document.querySelector('#next').hidden?!document.querySelector('#hint').disabled:!document.querySelector('#next').disabled);}
    ok(projection.round.status==='lost'&&projection.progress.answered===2&&await p.locator('#score').textContent()==='73','Three wrong answers persist first zero-point result without changing score');
    await p.locator('#change-competition').click();await p.locator('#competition-options button').nth(3).click();await p.locator('#account-notice').waitFor({state:'visible'});ok(await p.locator('#round-panel').isHidden()&&await p.locator('#game-loading-status').isHidden(),'Completed start response stays completed despite progress readback of previous finished round');
    await p.locator('#change-competition').click();await p.locator('#competition-options button').first().click();await ready();
    ok(await p.locator('#round-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.top<667;}),'Next ranked career returns into short mobile viewport');
    await p.reload();await ready();ok(await p.locator('#score').textContent()==='73','Persistent mock account reload restores cloud progress');await p.locator('#account-open').click();ok((await p.locator('#enrolled-status').textContent()).includes('Neutral Eagle'),'Custom nickname survives reload without replacement by animal alias');await p.locator('#account-close').click();
    await p.locator('#account-open').click();p.once('dialog',d=>d.dismiss());await p.locator('#account-delete').click();ok(!calls.some(c=>c.url.endsWith('account-delete')),'Deletion cancellation makes no delete request');
    deleteFail=true;p.once('dialog',d=>d.accept('DELETE'));await p.locator('#account-delete').click();await p.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('could not be confirmed'));ok(await p.locator('#logout').isVisible(),'Failed deletion retains signed-in state');
    deleteFail=false;p.once('dialog',d=>d.accept('DELETE'));await p.locator('#account-delete').click();await p.waitForFunction(()=>document.querySelector('#play-mode').textContent==='GUEST · UNRANKED');ok(await p.evaluate(()=>lifetime.score===0&&seen.size===0&&!localStorage.getItem('derabona.auth.v1')),'Confirmed deletion clears account session and starts empty guest');
    await p.goto(origin+'/index.html?lang=en&code=EXPLICIT_SECOND_LOGIN');await ready();await p.locator('#account-open').click();await p.locator('#logout').click();await p.waitForFunction(()=>document.querySelector('#play-mode').textContent==='GUEST · UNRANKED');ok(await p.evaluate(()=>lifetime.score===0&&seen.size===0),'Logout starts fresh guest without restoring old progress');
    await p.locator('#hint').click();const beforeExpiredCode=await p.evaluate(()=>sessionStorage.getItem(STORAGE_KEY));
    await p.goto(origin+'/index.html?lang=en&code=EXPIRED_PKCE_CODE');await p.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('did not complete'));
    ok(await p.evaluate(value=>sessionStorage.getItem(STORAGE_KEY)===value&&AuthCallback.code===null,beforeExpiredCode)&&p.url()===origin+'/index.html?lang=en','Expired PKCE callback preserves guest save and clears callback secrets');
    await p.evaluate(()=>Accounts.request({action:'leaderboard',competition:'all',limit:20,offset:0},'ranked-game',true));ok(!calls.at(-1).headers.authorization,'Expired PKCE does not block public global leaderboard');
    ok(errors.length===0,'No JavaScript runtime errors in account and leaderboard journeys');
    return {passed:true,backend:'EXPLICIT SDK + API ROUTE MOCKS; NOT hosted OAuth/database verification',checks,errors,requestCount:calls.length};
  }finally{releaseProgress?.();await context.close();}
}
