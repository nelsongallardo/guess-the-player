// Real Chromium UX checks for guest/ranked disclosure.
// Supabase is route-mocked; this is not hosted OAuth evidence.
async page => {
  const browser=page.context().browser(),checks=[],errors=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const origin='http://127.0.0.1:4173';
  const html=await (await page.request.get(origin+'/index.html')).text();
  const mockAccounts=async context=>context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithOAuth:async()=>({}),signOut:async()=>({})}})}` }));
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  try{
    await mockAccounts(context);
    await context.addInitScript(()=>localStorage.setItem('derabona.analytics-consent.v1','declined'));
    const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
    await p.goto(origin+'/index.html?lang=en');
    await p.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));
    ok(await p.locator('#guest-ranked-status').isVisible(),'Guest eligibility status is visible before the first answer');
    const guestDetail=await p.locator('#guest-ranked-detail').textContent();
    ok(guestDetail.includes('does not appear on the leaderboard'),'Guest status names the leaderboard consequence');
    ok(guestDetail.includes('cannot be transferred'),'Guest status states the non-transfer rule before play');
    ok(await p.locator('#guest-ranked-status').evaluate((status)=>status.compareDocumentPosition(document.querySelector('#round-panel'))&Node.DOCUMENT_POSITION_FOLLOWING),'Guest status precedes the playable round');
    ok(await p.locator('#account-open-label').isVisible()&&await p.locator('#account-open-label').textContent()==='Sign in to compete','Desktop account control has a visible benefit label');
    await p.locator('#guest-ranked-signin').click();ok(await p.locator('#account-dialog').isVisible(),'Pre-play CTA opens the existing Account dialog');await p.locator('#account-close').click();
    await p.setViewportSize({width:375,height:667});
    const compactLabel=await p.locator('#account-open-label').evaluate(node=>({width:node.getBoundingClientRect().width,clip:getComputedStyle(node).clip,clipPath:getComputedStyle(node).clipPath}));
    ok(compactLabel.width<=1&&(compactLabel.clip!=='auto'||compactLabel.clipPath!=='none'),'Narrow mobile keeps the header label visually compact');
    ok(await p.locator('#guest-ranked-status').isVisible()&&await p.locator('#guest-ranked-signin').isVisible(),'Mobile keeps the status and CTA visible without a modal');
    ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile disclosure introduces no horizontal overflow');

    const correct=await p.evaluate(()=>CareerGame.playerAt(state).name);
    await p.locator('#options button').filter({hasText:correct}).click();
    ok(await p.locator('#guest-ranked-reminder').isVisible(),'First resolved guest round shows one contextual reminder');
    ok(await p.locator('#guest-ranked-reminder').getAttribute('role')==='status'&&await p.locator('#guest-ranked-reminder').getAttribute('aria-live')==='polite','First-result reminder is announced without stealing focus');
    const reminderBox=await p.locator('#guest-ranked-reminder').boundingBox();
    ok(reminderBox&&reminderBox.y<await p.evaluate(()=>innerHeight)&&reminderBox.y+reminderBox.height>0,'First-result reminder is brought into the mobile viewport');
    ok((await p.locator('#feedback').textContent()).includes('guest score')&&(await p.locator('#feedback').textContent()).includes('unranked'),'Guest result is distinguished from ranked points');
    await p.locator('#language').selectOption('es');
    ok((await p.locator('#guest-ranked-reminder').textContent()).includes('próximo jugador'),'Visible reminder translates without resetting the result');
    await p.locator('#guest-ranked-reminder-signin').click();ok(await p.locator('#account-dialog').isVisible(),'First-result CTA opens Account without starting OAuth');await p.locator('#account-close').click();
    ok(await p.locator('#guest-ranked-reminder-continue').textContent()==='Seguir como invitado','Reminder offers an explicit guest continuation');
    await p.locator('#guest-ranked-reminder-continue').click();
    const second=await p.evaluate(()=>CareerGame.playerAt(state).name);await p.locator('#options button').filter({hasText:second}).click();
    ok(await p.locator('#guest-ranked-reminder').isHidden(),'Contextual reminder is frequency-capped after the first result');
    await p.reload();ok(await p.locator('#guest-ranked-reminder').isHidden(),'Reminder cap survives refresh in the same tab');
    await p.close();

    const bypass=await browser.newContext({viewport:{width:375,height:667}});
    try{
      await mockAccounts(bypass);
      await bypass.route('https://derabona.club/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      const b=await bypass.newPage();b.on('pageerror',error=>errors.push(error.message));await b.goto('https://derabona.club/?lang=en');
      await b.locator('#analytics-banner').waitFor({state:'visible'});await b.waitForTimeout(2400);
      const answer=await b.evaluate(()=>CareerGame.playerAt(state).name);
      await b.evaluate(name=>[...document.querySelectorAll('#options button')].find(button=>button.dataset.name===name).click(),answer);
      ok(await b.evaluate(()=>CareerGame.roundAt(state).points<100&&!roundClockWaitingForConsent&&!!sessionStorage.getItem(CLOCK_KEY)),'Gameplay activated behind consent uses elapsed time instead of a zero-time score');
    }finally{await bypass.close();}

    const crossTab=await browser.newContext({viewport:{width:375,height:667}});
    try{
      await mockAccounts(crossTab);
      await crossTab.route('https://derabona.club/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      const x=await crossTab.newPage(),writer=await crossTab.newPage();x.on('pageerror',error=>errors.push(error.message));writer.on('pageerror',error=>errors.push(error.message));
      await x.goto('https://derabona.club/?lang=en');await x.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));
      await x.locator('#analytics-banner').waitFor({state:'visible'});await writer.goto('https://derabona.club/?lang=en');
      await writer.evaluate(()=>localStorage.setItem('derabona.analytics-consent.v1','declined'));
      await x.waitForTimeout(350);
      ok(await x.evaluate(()=>Analytics.getConsent()==='declined'&&!roundClockWaitingForConsent&&guestClock().elapsedMs>=250&&!!sessionStorage.getItem(CLOCK_KEY)),'Cross-tab consent resolution starts and persists the paused clock');
    }finally{await crossTab.close();}

    const startupRace=await browser.newContext({viewport:{width:375,height:667}});
    try{
      await startupRace.addInitScript(()=>{
        const native=requestAnimationFrame.bind(window),pending=[];
        let held=true;
        window.requestAnimationFrame=callback=>held?(pending.push(callback),pending.length):native(callback);
        window.__releaseStartupFrames=()=>{held=false;for(const callback of pending.splice(0))native(callback);};
      });
      await mockAccounts(startupRace);
      await startupRace.route('https://derabona.club/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      const reader=await startupRace.newPage(),writer=await startupRace.newPage();reader.on('pageerror',error=>errors.push(error.message));writer.on('pageerror',error=>errors.push(error.message));
      await reader.goto('https://derabona.club/?lang=en');await writer.goto('https://derabona.club/?lang=en');
      await writer.evaluate(()=>localStorage.setItem('derabona.analytics-consent.v1','declined'));
      await reader.evaluate(()=>window.__releaseStartupFrames());
      await reader.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));await reader.waitForTimeout(350);
      ok(await reader.evaluate(()=>Analytics.getConsent()==='declined'&&!roundClockWaitingForConsent&&guestClock().elapsedMs>=250&&!!sessionStorage.getItem(CLOCK_KEY)),'Consent resolved in another tab before deferred startup still starts and persists the paused clock');
    }finally{await startupRace.close();}

    const consent=await browser.newContext({viewport:{width:375,height:667}});
    try{
      await mockAccounts(consent);
      await consent.route('https://derabona.club/**',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:html}):route.abort());
      const c=await consent.newPage();c.on('pageerror',error=>errors.push(error.message));await c.goto('https://derabona.club/?lang=en');
      await c.locator('#analytics-banner').waitFor({state:'visible'});await c.waitForTimeout(2400);
      ok(await c.evaluate(()=>guestClock().elapsedMs<250),'First guest clock stays paused while consent obscures play');
      await c.locator('#analytics-banner [data-analytics-consent="declined"]').click();await c.waitForTimeout(450);
      const elapsed=await c.evaluate(()=>guestClock().elapsedMs);ok(elapsed>=300&&elapsed<1300,'Guest clock starts after consent is resolved');
      const answer=await c.evaluate(()=>CareerGame.playerAt(state).name);await c.locator('#options button').filter({hasText:answer}).click();
      ok(await c.evaluate(()=>CareerGame.roundAt(state).points===100),'Consent delay cannot reduce the first-round score');
    }finally{await consent.close();}

    const offline=await browser.newContext({offline:true,viewport:{width:375,height:667}});
    try{await mockAccounts(offline);const f=await offline.newPage();f.on('pageerror',error=>errors.push(error.message));await f.goto(__FILE_URL__);ok(await f.locator('#guest-ranked-status').isHidden(),'Portable offline play has no unusable account CTA');}
    finally{await offline.close();}

    ok(errors.length===0,'No browser errors in disclosure journeys');
    return {passed:true,backend:'Supabase not used; account CTA stops at the existing dialog',checks,errors};
  } finally {await context.close();}
}
