// REAL Chromium checks for optional daily email reminders (ADR 0030), with an
// EXPLICIT route-mocked Supabase SDK, gameplay API and email-preferences API.
// They prove rendered frontend behavior only: NOT Google OAuth, the database,
// EmailOctopus, or delivered mail.
async page => {
  const browser=page.context().browser(),checks=[],errors=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const origin='http://127.0.0.1:4173',api='https://explicit-reminder-mock.invalid';
  const competitions=['all','champions-league','premier-league','la-liga','argentine-primera','brasileirao'];
  const CONSENT='daily-v1-20261009';
  async function session({prompted=true,width=390,height=780,pref=null,failSet=0,failGet=0,userId='00000000-0000-4000-8000-000000009999'}={}){
    const calls=[];let preference=pref??{enabled:false,language:null,version:0,source:null,deliveryStatus:'disabled',suppressedReason:null,email:'friend+derabona@example.com',emailAvailable:true};
    let profile={nickname:'Otter-4821aaaa',enrolled:true,nicknamePrompted:prompted},fails={set:failSet,get:failGet};
    const progress={totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:Object.fromEntries(competitions.map(id=>[id,{answered:0,total:60}]))};
    const context=await browser.newContext({viewport:{width,height},hasTouch:true});
    await context.addInitScript(uid=>{localStorage.setItem('derabona.auth.v1','EXPLICIT_TEST_SESSION');window.__mockAuth={session:{access_token:'EXPLICIT_TEST_TOKEN',user:{id:uid,user_metadata:{}}},listener:null};},userId);
    for(const file of ['index.html','leaderboard.html'])await context.route(`**/${file}*`,async route=>{const response=await route.fetch();let html=await response.text();html=html.replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_PUBLIC_MOCK_KEY'})`);await route.fulfill({response,body:html});});
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>{const m=window.__mockAuth;return {auth:{getSession:async()=>({data:{session:m.session},error:null}),onAuthStateChange:fn=>{m.listener=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{m.session=null;localStorage.removeItem('derabona.auth.v1');m.listener?.('SIGNED_OUT',null);return {error:null}}}}}};`}));
    await context.route('https://api.emailoctopus.com/**',route=>{calls.push({vendor:route.request().url()});return route.abort();});
    await context.route(api+'/**',async route=>{
      const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=req.postDataJSON(),endpoint=req.url().split('?')[0].split('/').pop();calls.push({endpoint,body:JSON.parse(JSON.stringify(body)),auth:req.headers().authorization});
      const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
      if(endpoint==='email-preferences'){
        if(body.action==='get'){if(fails.get-->0)return respond({error:{code:'INTERNAL_ERROR'}},500);return respond({preference});}
        if(fails.set-->0)return respond({error:{code:'INTERNAL_ERROR'}},500);
        preference=body.enabled?{...preference,enabled:true,language:body.language,version:preference.version+1,source:'user_opt_in',deliveryStatus:'pending'}:{...preference,enabled:false,version:preference.version+1,deliveryStatus:'disabled'};
        return respond({preference});
      }
      if(body.action==='leaderboard')return respond({entries:[],total:0,own:null,competition:body.competition});
      if(body.action==='list')return respond({leagues:[]});
      if(body.action==='enroll'){profile={nickname:body.nickname,enrolled:true,nicknamePrompted:true};}
      if(body.action==='overview')return respond({profile,progress,daily:{date:new Date().toISOString().slice(0,10),status:'finished',completed:3,totalPoints:120,correctCount:2,previous:null},career:{status:'ready',competition:null}});
      return respond({profile,progress,round:null});
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    return {context,p,calls,get preference(){return preference;}};
  }
  const prefCalls=calls=>calls.filter(c=>c.endpoint==='email-preferences').map(c=>c.body.action+(c.body.action==='set'?':'+c.body.enabled:''));
  const noOverflow=async p=>p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
  try{
    // 1. First sign-in, Spanish: unchecked by default; declining enrolls nothing.
    {
      const s=await session({prompted:false});
      await s.p.goto(origin+'/index.html?lang=es');
      await s.p.locator('#nickname-prompt-dialog').waitFor({state:'visible'});
      await s.p.locator('#nickname-prompt-reminder-row').waitFor({state:'visible'});
      ok(await s.p.locator('#nickname-prompt-reminder').isChecked()===false,'Prompt reminder checkbox is unchecked by default');
      ok((await s.p.locator('#nickname-prompt-reminder-label').textContent())==='Quiero recibir un recordatorio diario por email. Puedo darme de baja cuando quiera.','Spanish consent copy is exact');
      ok(JSON.stringify(prefCalls(s.calls))==='["get"]','Opening the prompt only reads the preference');
      await s.p.locator('#nickname-prompt-submit').click();
      await s.p.locator('#nickname-prompt-dialog').waitFor({state:'hidden'});
      ok(s.calls.some(c=>c.body.action==='enroll'),'Nickname completes');
      await s.p.waitForTimeout(150);
      ok(JSON.stringify(prefCalls(s.calls))==='["get"]','Declining is a successful signup with no reminder enrollment');
      ok(await s.p.locator('#reminder-notice').isHidden(),'No reminder notice after declining');
      ok(!s.calls.some(c=>c.vendor),'No EmailOctopus request from the browser');
      await s.context.close();
    }
    // 2. Checked, but the reminder save fails: nickname and play still succeed; notice + retry in Account.
    {
      const s=await session({prompted:false,failSet:1,width:320,height:640});
      await s.p.goto(origin+'/index.html?lang=es');
      await s.p.locator('#nickname-prompt-reminder-row').waitFor({state:'visible'});
      ok(await noOverflow(s.p),'Prompt with reminder choice fits 320px');
      const box=await s.p.locator('#nickname-prompt-reminder-row').boundingBox();ok(box&&box.height>=32,'Reminder choice has a comfortable touch row');
      await s.p.locator('#nickname-prompt-reminder').check();
      ok(JSON.stringify(prefCalls(s.calls))==='["get"]','Checking is only local intent before submit');
      await s.p.locator('#nickname-prompt-submit').click();
      await s.p.locator('#nickname-prompt-dialog').waitFor({state:'hidden'});
      await s.p.locator('#reminder-notice').waitFor({state:'visible'});
      ok(JSON.stringify(prefCalls(s.calls))==='["get","set:true"]','Explicit enrollment is sent after the nickname succeeded');
      const set=s.calls.find(c=>c.body.action==='set').body;
      ok(set.consentVersion===CONSENT&&set.language==='es'&&set.expectedVersion===0&&!('email' in set)&&!('userId' in set),'Enable request carries consent version and language, never an address or account ID');
      ok(await noOverflow(s.p),'Failure notice fits 320px');
      ok(!await s.p.locator('#nickname-prompt-dialog').evaluate(d=>d.open),'A reminder failure never reopens or blocks the nickname dialog');
      await s.p.locator('#reminder-notice-open').click();
      await s.p.locator('#account-dialog').waitFor({state:'visible'});
      await s.p.locator('#reminder-form').waitFor({state:'visible'});
      ok(await s.p.locator('#reminder-enabled').isChecked(),'Account keeps the explicit intent for retry');
      ok((await s.p.locator('#reminder-error').textContent()).includes('No se pudo guardar'),'Account shows the save failure');
      ok(await noOverflow(s.p),'Account reminder section fits 320px');
      const save=await s.p.locator('#reminder-save').boundingBox();ok(save&&save.height>=44,'Save is a 44px touch target');
      await s.p.locator('#reminder-save').click();
      await s.p.waitForFunction(()=>document.querySelector('#reminder-status').textContent.includes('pendiente de confirmación'));
      const sets=s.calls.filter(c=>c.body.action==='set');ok(sets.length===2&&sets[0].body.requestId===sets[1].body.requestId,'Retry reuses the uncertain request ID');
      ok((await s.p.locator('#reminder-detail').textContent()).includes('friend+derabona@example.com'),'Account shows its own verified address');
      await s.p.keyboard.press('Escape');await s.p.locator('#account-dialog').waitFor({state:'hidden'});
      ok(!s.calls.some(c=>c.vendor),'Still no vendor request');
      await s.context.close();
    }
    // 3. English Account on the game: labels, keyboard toggle, explicit save, language seeding and no silent rewrite.
    {
      const s=await session({width:390});
      await s.p.goto(origin+'/index.html?lang=en&unlimited=1');
      await s.p.locator('#account-open').click();
      await s.p.locator('#reminder-form').waitFor({state:'visible'});
      ok((await s.p.locator('#reminder-title').textContent())==='Email reminders','English section title');
      ok((await s.p.locator('#reminder-enabled-label').textContent())==='Email me a daily reminder. I can unsubscribe at any time.','English consent copy is exact');
      ok(await s.p.locator('#reminder-language').inputValue()==='en','Email language is seeded from the UI language');
      ok(await s.p.locator('#reminder-save').isDisabled(),'Nothing to save until the player changes something');
      await s.p.locator('#reminder-enabled').focus();await s.p.keyboard.press('Space');
      ok(await s.p.locator('#reminder-enabled').isChecked(),'Checkbox is keyboard operable');
      await s.p.locator('#reminder-save').click();
      await s.p.waitForFunction(()=>document.querySelector('#reminder-status').textContent.includes('waiting for confirmation'));
      ok(s.preference.language==='en','Saved language is English');
      await s.p.keyboard.press('Escape');
      await s.p.selectOption('#language','es');
      await s.p.locator('#account-open').click();
      await s.p.locator('#reminder-form').waitFor({state:'visible'});
      ok(await s.p.locator('#reminder-language').inputValue()==='en'&&await s.p.locator('#reminder-save').isDisabled(),'A game-language switch does not change the saved email language');
      ok((await s.p.locator('#reminder-title').textContent())==='Recordatorios por email','Section retranslates without resetting state');
      ok(!s.calls.some(c=>['start','dailyProgress','hint','answer'].includes(c.body.action)&&c.endpoint==='email-preferences'),'Preference requests never carry gameplay actions');
      await s.context.close();
    }
    // 4. Leaderboard page parity: owner-cohort state, unavailable/retry, opt-out; no gameplay requests.
    {
      const legacy={enabled:true,language:'es',version:1,source:'owner_requested_existing_friends',deliveryStatus:'enabled',suppressedReason:null,email:'amigo@example.com',emailAvailable:true};
      const s=await session({pref:legacy,failGet:1,width:320,height:640});
      await s.p.goto(origin+'/leaderboard.html?lang=es');
      await s.p.locator('#account-open-link').click();
      await s.p.locator('#reminder-retry').waitFor({state:'visible'});
      ok((await s.p.locator('#reminder-status').textContent()).includes('No pudimos cargar'),'A failed read shows unavailable, not a guessed off state');
      ok(await s.p.locator('#reminder-form').isHidden(),'No editable guess while unavailable');
      await s.p.locator('#reminder-retry').click();
      await s.p.locator('#reminder-form').waitFor({state:'visible'});
      ok(await s.p.locator('#reminder-enabled').isChecked(),'Legacy friend sees the existing enrolled state');
      const status=await s.p.locator('#reminder-status').textContent();
      ok(status.includes('primeros jugadores')&&!/confirm|aceptaste/i.test(status),'Legacy wording is truthful and never claims a confirmed opt-in');
      ok(await noOverflow(s.p),'Leaderboard Account reminder section fits 320px');
      await s.p.locator('#reminder-enabled').uncheck();await s.p.locator('#reminder-save').click();
      await s.p.waitForFunction(()=>document.querySelector('#reminder-status').textContent.startsWith('Desactivados'));
      ok(JSON.stringify(prefCalls(s.calls))==='["get","get","set:false"]','Opt-out is an explicit save on the leaderboard page');
      ok(!s.calls.some(c=>['start','dailyProgress','hint','answer','dailyHint','dailyAnswer'].includes(c.body?.action)),'The leaderboard page never starts or mutates gameplay');
      await s.context.close();
    }
    // 5. Sign-out on the leaderboard clears the section; a guest never requests reminders.
    {
      const s=await session({});
      await s.p.goto(origin+'/leaderboard.html?lang=en');
      await s.p.locator('#account-open-link').click();await s.p.locator('#reminder-form').waitFor({state:'visible'});
      await s.p.locator('#logout').click();
      await s.p.waitForFunction(()=>document.querySelector('#reminder-section').hidden);
      ok(true,'Signing out hides the previous account’s reminder section');
      await s.context.close();
      const g=await browser.newContext({viewport:{width:390,height:780}});const gp=await g.newPage();const guestCalls=[];
      gp.on('request',r=>{if(/email-preferences|emailoctopus/.test(r.url()))guestCalls.push(r.url());});
      await gp.goto(origin+'/index.html?lang=en');await gp.locator('#account-open').click();
      ok(await gp.locator('#reminder-section').isHidden()&&guestCalls.length===0,'Guests see no reminder section and send no reminder request');
      await gp.goto(__FILE_URL__);await gp.waitForTimeout(300);
      ok(await gp.locator('#reminder-section').isHidden()&&await gp.locator('#reminder-notice').isHidden()&&guestCalls.length===0,'Portable file: play has no reminder UI or requests');
      await g.close();
    }
    ok(errors.length===0,'No page errors: '+errors.join(' | '));
    return {passed:true,checks};
  }catch(error){return {passed:false,error:error.message,checks,errors};}
}
