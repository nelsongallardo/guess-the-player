// Rendered Chromium regression; signed-in SDK/API are explicit mocks, NOT OAuth/SQL proof.
// Uses current page origin; portable artifact path is derived from that served page's source.
async page=>{
  const browser=page.context().browser();
  const checks=[],errors=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
  const inspect=async p=>p.evaluate(()=>{
    const daily=DailyUI.isDaily(),a=daily?DailyChallenge.createPersistence(localStorage).today():null,r=daily?a.game.rounds[a.game.roundIndex]:CareerGame.roundAt(state),
      player=daily?DailyChallenge.forDate(a.date).payloads[a.game.roundIndex].player:CareerGame.playerAt(state);
    return {round:JSON.parse(JSON.stringify(r)),name:player.name,position:position(player),country:country(player),language,
      playerId:player.id,items:[...document.querySelectorAll('#hints li')].map(x=>x.textContent)};
  });
  const hints=async(p,n,label)=>{
    const result=await p.evaluate(()=>({language,items:[...document.querySelectorAll('#hints li')].map(x=>x.textContent),count:document.querySelector('#hint-count').textContent,overflow:document.documentElement.scrollWidth>innerWidth}));
    const labels=result.language==='es'?['Posición','Nacionalidad','Años']:['Position','Nationality','Years'];
    ok(result.items[0].startsWith(n>=1?labels[0]+':':'1. '+labels[0]),label+' position first');
    ok(result.items[1].startsWith(n>=2?labels[1]+':':'2. '+labels[1]),label+' nationality second');
    ok(result.count===`${n} / 3`,label+' count');
    await p.locator('.club-years').first().waitFor({state:n===3?'visible':'hidden'});
    ok((await p.locator('.club-years').first().isVisible())===(n===3),label+' years only at third');
    ok(!result.overflow,label+' mobile width');
    ok(await p.locator('#hints').getAttribute('aria-live')==='polite',label+' live hints');
  };
  // All guest modes/languages, HTTP + real network-disabled file, and storage denial.
  const portable=await page.evaluate(()=>new URL('/index.html',location.href).href);
  // file path passed through the CLI suite invocation using a task-local literal.
  const file=__FILE_URL__.split('?')[0];
  for(const offline of [false,true])for(const mode of ['daily','unlimited'])for(const language of ['es','en']){
    const context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true,offline});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const requests=[];p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    try{
      const label=`guest ${mode} ${language} ${offline?'file offline':'HTTP'}`;
      await p.goto((offline?file:portable)+`?lang=${language}`+(mode==='unlimited'?'&unlimited=1':''));
      await p.waitForSelector('#options button').catch(e=>{throw Error(label+': '+e.message)});await hints(p,0,label);
      const initial=await inspect(p);
      const decoded=await p.evaluate(async()=>{const images=[...document.querySelectorAll('#timeline img')];await Promise.all(images.map(i=>i.decode()));return images.every(i=>i.naturalWidth>0);});
      ok(decoded,label+' embedded career crests decode');
      const ruleOrder=language==='es'?'posición → nacionalidad → los años en cada club':'position → nationality → each club’s years';
      ok((await p.locator('#rules').textContent()).includes(ruleOrder),label+' translated help order');
      for(let n=1;n<=3;n++){
        await p.locator('#hint').click();await hints(p,n,label);
        const current=await inspect(p);ok(current.round.guesses.length===0,label+' no hint attempts');
        ok(current.items[0]===`${language==='es'?'Posición':'Position'}: ${initial.position}`,label+' position value');
        if(n>=2)ok(current.items[1]===`${language==='es'?'Nacionalidad':'Nationality'}: ${initial.country}`,label+' nationality value');
        const before=JSON.stringify(current.round);await p.reload();
        ok(JSON.stringify((await inspect(p)).round)===before,label+' reload preserves '+n+' hints/options/clock');
      }
      ok(await p.locator('#hint').isDisabled(),label+' cap unchanged');
      const before=(await inspect(p)).round;await p.locator('#language').selectOption(language==='es'?'en':'es');
      ok(JSON.stringify((await inspect(p)).round)===JSON.stringify(before),label+' language preserves state');
      await hints(p,3,label+' switched');
      await p.locator('#options button').filter({hasText:initial.name}).click();
      ok(await p.locator('#next').isVisible(),label+' answer unlocks next');
      await p.locator('#next').click();await hints(p,0,label+' next');
      if(offline)ok(requests.length===0,label+' zero HTTP requests');
    }finally{await context.close();}
  }
  for(const mode of ['daily','unlimited']){
    const context=await browser.newContext({viewport:{width:375,height:667},offline:true});
    await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('explicit denied storage writes');};});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    try{await p.goto(file+'?lang=es'+(mode==='unlimited'?'&unlimited=1':''));await p.waitForSelector('#options button').catch(e=>{throw Error('denied '+mode+': '+e.message)});await p.locator('#hint').click();await hints(p,1,'denied storage '+mode);}
    finally{await context.close();}
  }
  // Server projections use opaque options, server clues and versions, never local optimistic hints.
  for(const mode of ['daily','unlimited'])for(const language of ['es','en']){
    const api='https://hint-order-explicit-mock.invalid',context=await browser.newContext({viewport:{width:375,height:667},hasTouch:true});
    let rounds=[],career=null;const calls=[],profile={nickname:'Falcon-12345678',enrolled:true,nicknamePrompted:true};
    const publicRound=(r,dailyMode=false)=>{const {mockPosition,mockCountry,...value}=r;if(dailyMode){delete value.id;delete value.competition;}else delete value.roundIndex;return value;};
    const projection=()=>({profile,progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:{all:{answered:0,total:221}}},round:career?publicRound(career):null});
    const daily=()=>({profile,totalPoints:0,streak:{current:0,best:0},daily:{date:new Date().toISOString().slice(0,10),challengeNumber:1,rounds:rounds.map(r=>publicRound(r,true)),finished:false}});
    await context.addInitScript(()=>{localStorage.setItem('derabona.auth.v1','EXPLICIT_MOCK');window.__hintSession={access_token:'EXPLICIT_MOCK_TOKEN',user:{id:'00000000-0000-4000-8000-000000001111'}};});
    await context.route('**/index.html*',async route=>{const response=await route.fetch();const html=(await response.text()).replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'EXPLICIT_MOCK_KEY'})`);await route.fulfill({response,body:html});});
    await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__hintSession},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};`}));
    await context.route(api+'/**',async route=>{
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      const body=route.request().postDataJSON();calls.push(body);
      if(!career){const data=await route.request().frame().evaluate(()=>{
        const make=(p,options,i)=>({id:crypto.randomUUID(),roundIndex:i,version:0,playerId:p.id,competition:'all',options:options.map(o=>({id:crypto.randomUUID(),label:o.label??o})),guesses:[],hints:0,cluePosition:null,clueCountry:null,status:'playing',points:null,startedAt:new Date().toISOString(),mockPosition:p.position,mockCountry:p.country});
        const d=DailyChallenge.forDate(new Date().toISOString().slice(0,10)),p=PLAYERS[0];
        return {career:make(p,CareerGame.optionsFor(p),0),rounds:d.payloads.map((a,i)=>make(a.player,a.options,i))};
      });career=data.career;rounds=data.rounds;}
      let r=mode==='daily'?rounds[body.roundIndex??0]:career;
      if(body.action==='hint'||body.action==='dailyHint'){
        ok(body.expectedVersion===r.version,'mock receives authoritative version');r.hints++;r.version++;
        r.cluePosition=r.mockPosition;r.clueCountry=r.hints>=2?r.mockCountry:null;
      }
      const result=body.action.startsWith('daily')?daily():projection();
      await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    try{
      const label=`MOCK ranked ${mode} ${language}`;
      await p.goto(portable+`?lang=${language}`+(mode==='unlimited'?'&unlimited=1':''));
      await p.waitForFunction(()=>!document.querySelector('#hint').disabled);await hints(p,0,label);
      for(let n=1;n<=3;n++){
        await p.locator('#hint').click();await p.waitForFunction(n=>document.querySelector('#hint-count').textContent===`${n} / 3`,n);
        await hints(p,n,label);const r=mode==='daily'?rounds[0]:career;
        const values=await p.evaluate(r=>({position:language==='es'?(POSITIONS_ES[r.cluePosition]||r.cluePosition):r.cluePosition,country:language==='es'?(COUNTRIES_ES[r.clueCountry]||r.clueCountry):r.clueCountry}),r);
        const items=await p.locator('#hints li').allTextContents();
        ok(items[0]===`${language==='es'?'Posición':'Position'}: ${values.position}`,label+' server position value');
        if(n>=2)ok(items[1]===`${language==='es'?'Nacionalidad':'Nationality'}: ${values.country}`,label+' server nationality value');
        const before=JSON.stringify(r);await p.reload();await p.waitForFunction(n=>document.querySelector('#hint-count').textContent===`${n} / 3`,n);
        ok(JSON.stringify(r)===before,label+' server round persists '+n);await hints(p,n,label+' reloaded');
      }
      ok(await p.locator('#hint').isDisabled(),label+' capped');
      // Simulate an exact pre-migration receipt: old country must not be exposed at hint one,
      // and missing position must not be filled from embedded player metadata.
      const r=mode==='daily'?rounds[0]:career;r.hints=1;r.cluePosition=null;r.clueCountry=r.mockCountry;
      await p.reload();await p.waitForFunction(()=>document.querySelector('#hint-count').textContent==='1 / 3');
      const items=await p.locator('#hints li').allTextContents();
      ok(items[0]===`${language==='es'?'Posición':'Position'}: —`,label+' old receipt has no local position fallback');
      ok(items[1]===`2. ${language==='es'?'Nacionalidad':'Nationality'}`,label+' old receipt cannot leak second clue');
      ok(calls.filter(c=>['hint','dailyHint'].includes(c.action)).length===3,label+' reloads never spend hints');
    }finally{await context.close();}
  }
  ok(errors.length===0,'no page runtime errors');
  return {passed:true,checks:checks.length,guest:'HTTP/file offline/denied storage ES+EN mobile',ranked:'EXPLICIT SDK/API MOCKS; not hosted OAuth',errors};
}
