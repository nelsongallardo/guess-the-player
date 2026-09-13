async page => {
 const assert=(v,m)=>{if(!v)throw Error(m);},browser=page.context().browser();
 const source=await (await page.request.get('http://127.0.0.1:4173/index.html')).text();
 const results=[];
 for(const blocked of [false,true]){
  const ctx=await browser.newContext({viewport:{width:375,height:812}}),p=await ctx.newPage(),requests=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await ctx.route('https://derabona.club/**',async route=>{const path=route.request().url().replace(/^https:\/\/[^/]+/,'').split('?')[0];if(path==='/'||path==='/index.html')return route.fulfill({contentType:'text/html',body:source});return route.fulfill({response:await p.request.get('http://127.0.0.1:4173'+path)});});
  await ctx.route(/https:\/\/[^/]*posthog\.com\//,async route=>{
   requests.push(route.request().url());
   if(blocked)return route.abort('blockedbyclient');
   if(route.request().url().replace(/^https:\/\/[^/]+/,'').split('?')[0]==='/static/array.js')return route.continue();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:1})});
  });
  try{
   await p.goto('https://derabona.club/?private=do-not-collect');await p.waitForSelector('#analytics-banner:visible');
   if(!blocked)await p.screenshot({path:'test-results/analytics-consent-mobile.png'});
   await p.locator('#hint').click();assert(requests.length===0,'No PostHog traffic before consent, even while playing');
   await p.locator('#analytics-banner [data-analytics-consent="declined"]').click();await p.reload();
   await p.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));
   assert(await p.locator('#analytics-banner').isHidden(),'Decline survives reload');assert(requests.length===0,'Declined means zero PostHog requests');
   await p.locator('#analytics-settings').click();await p.locator('#privacy-dialog [data-analytics-consent="accepted"]').click();
   if(blocked){
    const correct=await p.evaluate(()=>CareerGame.playerAt(state).name);await p.getByRole('button',{name:correct,exact:true}).click();
    assert(await p.evaluate(()=>CareerGame.outcome(state))==='won','Blocked analytics does not block game');results.push('blocked SDK still playable');continue;
   }
   await p.waitForFunction(()=>window.posthog?.__loaded&&posthog.has_opted_in_capturing(),null,{timeout:30000});
   const id=await p.evaluate(()=>posthog.get_distinct_id());
   await p.evaluate(()=>{window.checkedEvents=[];const original=posthog.config.before_send;posthog.set_config({opt_out_useragent_filter:true,before_send:e=>{const clean=original(e);if(clean)checkedEvents.push(clean);return clean;}});});
   await p.locator('#hint').click();
   const correct=await p.evaluate(()=>CareerGame.playerAt(state).name);await p.getByRole('button',{name:correct,exact:true}).click();
   await p.locator('#language').selectOption('en');
   const events=await p.evaluate(()=>checkedEvents);
   for(const name of ['hint_used','answer_submitted','round_completed','language_changed'])assert(events.some(e=>e.event===name),'Captured '+name);
   assert(events.every(e=>e.properties.$current_url==='https://derabona.club/'),'No query or fragment capture');
   assert(events.every(e=>!('$referrer'in e.properties)&&!('$initial_referrer'in e.properties)),'No full referrer URL');
   await p.reload();await p.waitForFunction(()=>window.posthog?.__loaded&&posthog.has_opted_in_capturing());
   assert(await p.evaluate(()=>posthog.get_distinct_id())===id,'Anonymous identity persists after accepted reload');
   await p.locator('#analytics-settings').click();await p.locator('#privacy-dialog [data-analytics-consent="declined"]').click();
   const count=requests.length;await p.locator('#language').selectOption('es');await p.evaluate(()=>Analytics.capture('help_opened'));
   assert(requests.length===count,'Withdrawal stops new requests');
   const persisted=await p.evaluate(()=>Object.values(localStorage).join(' '));assert(!persisted.includes(id),'Withdrawal clears persisted analytics identity');
   assert(await p.evaluate(()=>CareerGame.outcome(state))==='won','Withdrawal preserves completed game');
   assert(errors.length===0,errors.join('; '));
   results.push({case:'consent, events, anonymous retention, revoke',events:events.map(e=>e.event),requests:requests.length,errors});
  }finally{await ctx.unrouteAll({behavior:'ignoreErrors'});await ctx.close();}
 }
 return {passed:true,network:'Real PostHog SDK; ingestion intercepted for privacy/regression tests, not ingestion proof',results};
}
