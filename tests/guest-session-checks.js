async page => {
  const browser=page.context().browser(),context=await browser.newContext(),errors=[],requests=[],checks=[];
  const ok=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  const url='http://127.0.0.1:4173/index.html?lang=en';
  try{
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173'))requests.push(r.url());});
    await p.goto(url);await p.locator('#hint').click();
    const saved=await p.evaluate(()=>({round:JSON.stringify(CareerGame.roundAt(state)),deck:state.deck,score:lifetime.score}));
    ok(await p.evaluate(()=>localStorage.getItem(STORAGE_KEY)===null&&!!sessionStorage.getItem(STORAGE_KEY)),'Guest gameplay is sessionStorage only');
    await p.reload();ok(await p.evaluate(expected=>JSON.stringify(CareerGame.roundAt(state))===expected,saved.round),'Refresh preserves engaged options and hints');
    await p.locator('#language').selectOption('es');ok(await p.evaluate(()=>CareerGame.roundAt(state).hints===1&&localStorage.getItem(LANGUAGE_KEY)==='es'),'Language stays local and preserves game');
    await p.locator('#language').selectOption('en');
    const correct=await p.evaluate(()=>CareerGame.playerAt(state).name);await p.locator('#options button').filter({hasText:correct}).click();
    ok(await p.evaluate(()=>seen.has(CareerGame.playerAt(state).id)&&lifetime.score>0),'Session lifetime and seen ledger record a completed player');
    await p.locator('#next').click();
    await p.locator('#change-competition').click();await p.locator('#competition-options button').nth(1).click();
    ok(await p.evaluate(id=>!state.deck.includes(id)&&lifetime.score>0,saved.deck[0]),'Competition switch preserves score and excludes answered player');
    await p.close();const fresh=await context.newPage();await fresh.goto(url);ok(await fresh.evaluate(()=>lifetime.score===0&&seen.size===0),'Normal close and fresh tab start a fresh guest');
    await context.route('**/{index,leaderboard}.html*',async route=>{const response=await route.fetch();const html=(await response.text()).replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,"Object.freeze({url:'',anonKey:''})");await route.fulfill({response,body:html});});await fresh.reload();await fresh.locator('#account-open').click();ok(await fresh.locator('#google-login').isDisabled(),'Unconfigured Google is honestly disabled');await fresh.locator('#account-close').click();
    await fresh.locator('#leaderboard-open').click();ok((await fresh.locator('#leaderboard-status').textContent()).includes('not configured'),'Unconfigured board is not fake data');await fresh.close();await context.unrouteAll({behavior:'ignoreErrors'});
    const legacy=__LEGACY_SAVE_60__;
    const migrate=await context.newPage();await migrate.goto(url);await migrate.evaluate(save=>{sessionStorage.clear();localStorage.setItem('touchline.career.v1',JSON.stringify(save));localStorage.setItem('touchline.lifetime.v1',JSON.stringify({score:123,streak:1,wins:1,rounds:1}));localStorage.setItem('touchline.seen.v1',JSON.stringify([save.deck[0]]));localStorage.setItem('derabona.analytics-consent.v1','declined');},legacy);await migrate.reload();
    ok(await migrate.evaluate(save=>state.deck.join()===save.deck.join()&&lifetime.score===123&&localStorage.getItem(STORAGE_KEY)===null&&localStorage.getItem('derabona.analytics-consent.v1')==='declined',legacy),'Legacy saves migrate without importing or clearing preferences');await migrate.close();
    const denied=await browser.newContext();try{await denied.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{get(){throw Error('Explicit test storage denial');}});Object.defineProperty(window,'localStorage',{get(){throw Error('Explicit test storage denial');}});});const d=await denied.newPage();d.on('pageerror',e=>errors.push(e.message));await d.goto(url);await d.locator('#hint').click();const name=await d.evaluate(()=>CareerGame.playerAt(state).name);await d.locator('#options button').filter({hasText:name}).click();ok(await d.evaluate(()=>lifetime.score>0),'Memory fallback remains playable');ok((await d.locator('#save-status').textContent()).includes('STORAGE UNAVAILABLE'),'Memory-only status is honest');}finally{await denied.close();}
    const offline=await browser.newContext({offline:true,viewport:{width:375,height:667}});try{const f=await offline.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto(__FILE_URL__);const played=new Set();for(let i=0;i<110;i++){const id=await f.evaluate(()=>{const p=CareerGame.playerAt(state);document.querySelectorAll('#options button')[CareerGame.roundAt(state).options.indexOf(p.name)].click();document.getElementById('next').click();return p.id;});if(played.has(id))throw Error('Offline repeat');played.add(id);}ok(await f.evaluate(()=>state.finished&&lifetime.rounds===110&&seen.size===110),'110 offline file rounds preserve history, lifetime and no repeats');await f.reload();ok(await f.locator('#summary-panel').isVisible(),'Offline file refresh retains guest session');await f.locator('#replay').click();ok(await f.locator('#competitions').isVisible(),'Replay does not farm exhausted players');}finally{await offline.close();}
    ok(errors.length===0,'No browser errors');ok(requests.length===0,'Unconfigured guest makes no external requests');return {passed:true,checks,errors,externalRequests:requests,backend:'not used — actual offline/HTTP guest artifact'};
  }finally{await context.close();}
}
