// Real Chromium rendered-artifact checks; auth SDK and ranked-game API are EXPLICIT mocks.
// Not evidence of hosted OAuth or a deployed PostgreSQL migration.
async page=>{
  const browser=page.context().browser(),origin='http://127.0.0.1:4173',api='https://daily-header-explicit-mock.invalid';
  const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});
  const checks=[],errors=[],calls=[];const ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
  const user='00000000-0000-4000-8000-000000004321';let rounds=[],dailyPoints=0,releaseProgress=null,holdProgress=false,dailyStarted=false;
  const profile={nickname:'Falcon-87654321',enrolled:true,nicknamePrompted:true};let otherAccount=false;
  const total=()=>otherAccount?0:12+dailyPoints;
  const progress=()=>({profile,progress:{totalPoints:total(),answered:otherAccount?0:1,correct:otherAccount?0:1,seenPlayerIds:[],competitionCounts:{all:{answered:otherAccount?0:1,total:220}}},round:null});
  const daily=()=>({profile,totalPoints:total(),streak:{current:0,best:0},daily:{date:new Date().toISOString().slice(0,10),challengeNumber:1,rounds:JSON.parse(JSON.stringify(rounds)),finished:rounds.length===3&&rounds.every(r=>r.status!=='playing')}});
  try{
    await context.addInitScript(user=>{window.__dailyMock={user,session:{access_token:'EXPLICIT_TEST_TOKEN',user:{id:user}},listener:null};localStorage.setItem('derabona.auth.v1','EXPLICIT_TEST_SESSION');},user);
    await context.route('**/index.html*',async route=>{const response=await route.fetch();let html=await response.text();html=html.replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_PUBLIC_MOCK_KEY'})`);await route.fulfill({response,body:html});});
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__dailyMock.session},error:null}),onAuthStateChange:fn=>{window.__dailyMock.listener=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{let m=window.__dailyMock;m.session=null;localStorage.removeItem('derabona.auth.v1');m.listener?.('SIGNED_OUT',null);return {error:null}}}})};`}));
    await context.route(api+'/**',async route=>{
      const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=req.postDataJSON();calls.push(body);let result;
      // ADR 0030: the first-sign-in prompt and Account read the separate reminder preference.
      if(req.url().endsWith('/email-preferences'))result={preference:{enabled:false,language:null,version:0,source:null,deliveryStatus:'disabled',suppressedReason:null,email:null,emailAvailable:false}};
      else if(body.action==='progress'){result=progress();if(holdProgress){holdProgress=false;await new Promise(resolve=>releaseProgress=resolve);}}
      else if(body.action==='list')result={leagues:[]};
      else if(body.action==='overview'){
        const completed=otherAccount?0:rounds.filter(r=>r.status!=='playing').length;
        result={profile,progress:progress().progress,daily:{date:new Date().toISOString().slice(0,10),status:otherAccount||!dailyStarted?'ready':completed===3?'finished':'playing',completed,totalPoints:otherAccount?0:dailyPoints,correctCount:otherAccount?0:rounds.filter(r=>r.status==='won').length,previous:null},career:{status:'ready',competition:null}};
      }
      else if(body.action==='dailyProgress'){dailyStarted=true;result=daily();}
      else if(body.action==='dailyHint'){rounds[body.roundIndex].hints++;rounds[body.roundIndex].version++;result=daily();}
      else if(body.action==='dailyAnswer'){const r=rounds[body.roundIndex];r.guesses.push(body.optionId);r.version++;if(r.options.find(o=>o.id===body.optionId).label===r.answer){r.status='won';r.points=41;dailyPoints+=41;}else if(r.guesses.length===3)r.status='lost';result=daily();}
      else if(body.action==='start')result=progress();
      else throw Error('Unexpected mocked action: '+body.action);
      await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const accountScore=async(expected,label)=>{
      await p.locator('#account-open').click();await p.waitForFunction(n=>document.querySelector('#stat-points').textContent===String(n),expected);
      ok(await p.locator('#stat-points').isVisible()&&await p.locator('#stat-points-label').textContent()==='Lifetime points'&&await p.locator('#score').isHidden(),label);
      await p.locator('#account-close').click();
    };
    // Signed-in landing resolves the account and automatically opens Daily.
    // Rows mirror the current frozen descriptor's player IDs, not invented player identities.
    await p.goto(origin+'/index.html?lang=en');
    rounds=await p.evaluate(()=>{const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10));return d.payloads.map((payload,i)=>({roundIndex:i,version:0,playerId:payload.player.id,options:payload.options.map((o,n)=>({id:'option-'+i+'-'+n,label:o.label})),answer:payload.player.name,guesses:[],hints:0,clueCountry:null,cluePosition:null,status:'playing',points:0,startedAt:new Date().toISOString()}));});
    await p.reload();await p.waitForFunction(()=>document.querySelector('#stat-points').textContent==='12'&&!document.querySelector('#hint').disabled);
    await accountScore(12,'Daily landing reads labeled combined score from the read-only server overview');
    ok(!calls.some(c=>c.action==='start')&&calls.some(c=>c.action==='dailyProgress'),'Daily arrival opens only Daily, never an unrelated Unlimited round');
    await p.waitForFunction(()=>!document.querySelector('#hint').disabled);
    await p.locator('#hint').click();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='1 / 3');
    await accountScore(12,'Hint does not locally mint score');
    holdProgress=true;await p.evaluate(()=>{void RankedUI.sync();});
    await p.waitForFunction(()=>document.querySelector('#score').textContent==='12');
    for(let n=0;n<100&&!releaseProgress;n++)await p.waitForTimeout(10);
    ok(!!releaseProgress,'Older career progress request is held before Daily answer');
    for(let i=0;i<3;i++){
      const answer=rounds[i].answer;await p.locator('#options .option').filter({hasText:answer}).click();
      await p.waitForFunction(n=>document.querySelector('#score').textContent===String(n),12+41*(i+1));
      await accountScore(12+41*(i+1),`Daily answer ${i+1} updates labeled Account total from its response`);
      if(i===0){releaseProgress();releaseProgress=null;await p.waitForFunction(()=>document.querySelector('#play-mode').textContent!=='Checking account…');await accountScore(53,'Late career projection cannot roll Daily score back');}
      if(i<2)await p.locator('#next').click();
    }
    await p.locator('#next').click();
    ok(await p.locator('#daily-summary').isVisible()&&await p.locator('#stat-points').textContent()==='135','Daily finish retains combined score');
    await p.locator('#unlimited-mode').click();await p.waitForFunction(()=>document.querySelector('#stat-points').textContent==='135');
    await accountScore(135,'Explicit Unlimited mode switch retains account total');
    await p.reload();await p.waitForFunction(()=>document.querySelector('#score').textContent==='135');
    await accountScore(135,'Reload reads combined score in Account');
    await p.locator('#account-open').click();await p.locator('#logout').click();
    await p.waitForFunction(()=>!Accounts.session);await p.locator('#account-open').click();
    ok(await p.locator('#score').isHidden()&&await p.locator('#account-stats').isHidden()&&!await p.evaluate(()=>Accounts.session),'Logout hides account statistics as well as the masthead score');await p.locator('#account-close').click();
    // A different account must never inherit the former account's score.
    otherAccount=true;await p.evaluate(()=>{let m=window.__dailyMock;m.session={access_token:'EXPLICIT_TEST_TOKEN',user:{id:'00000000-0000-4000-8000-000000009999'}};m.listener?.('SIGNED_IN',m.session);});
    await p.waitForFunction(()=>document.querySelector('#score').textContent==='0');
    await accountScore(0,'New identity reads its own mocked API projection, not carried client score');
    await p.goto(origin+'/index.html?lang=es');await p.waitForFunction(()=>document.querySelector('#score').textContent==='0');
    await p.locator('#account-open').click();
    ok(await p.locator('#stat-points').isVisible()&&await p.locator('#stat-points').textContent()==='0'&&await p.locator('#stat-points-label').textContent()==='Puntos acumulados'&&await p.locator('#account-open-label').textContent()==='Cuenta'&&await p.locator('#score').isHidden(),'Spanish Account labels cumulative points while its navigation label stays Cuenta');await p.locator('#account-close').click();
    ok(errors.length===0,'No page JavaScript exceptions');
    return {passed:true,checks:checks.length,labels:checks,calls:calls.map(c=>c.action),errors};
  }catch(error){throw Error(error.message+' | passed: '+checks.join('; ')+' | errors: '+errors.join('; '));}finally{releaseProgress?.();await context.close();}
}
