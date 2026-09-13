async page => {
  const browser=page.context().browser();
  const isolated=await browser.newContext({offline:true});
  const errors=[],requests=[],seen=new Set(),crests=new Set();
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  try {
    const file=await isolated.newPage();
    file.on('pageerror',error=>errors.push(error.message));
    file.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    await file.goto(__FILE_URL__);
    ok(await file.locator('#options button').count()===10,'Single file loads with browser network offline');
    for(let i=0;i<70;i++){
      const s=await file.evaluate(()=>({id:CareerGame.playerAt(state).id,name:CareerGame.playerAt(state).name,index:state.roundIndex,options:CareerGame.roundAt(state).options,crests:CareerGame.playerAt(state).clubCrests}));
      ok(s.index===i&&!seen.has(s.id),'Offline deck order');seen.add(s.id);s.crests.forEach(u=>crests.add(u));
      const decoded=await file.evaluate(async()=>{await Promise.all([...document.images].map(image=>image.decode()));return [...document.images].every(image=>image.naturalWidth>0&&!image.hidden);});ok(decoded,'Offline crest decoding');
      if(i===0){for(let h=0;h<3;h++)await file.locator('#hint').click();ok(await file.locator('#hint').isDisabled(),'Offline hints work');}
      await file.locator('#options button').nth(s.options.indexOf(s.name)).click();
      await file.locator('#next').click();
    }
    // Round 0 used all three available hints (100 x 0.4 = 40); the other 69 first-try, no-hint wins score 100 each.
    ok(await file.evaluate(()=>state.finished&&CareerGame.stats(state).score===6940&&CareerGame.stats(state).streak===70),'All 70 offline rounds complete');
    await file.reload();ok(await file.locator('#summary-panel').isVisible(),'File URL saves/reloads in Chromium');
    await isolated.addInitScript(()=>{for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{configurable:true,get(){throw new DOMException('Storage blocked for test','SecurityError');}});});
    await file.reload();ok((await file.locator('#save-status').textContent()).includes('STORAGE UNAVAILABLE'),'Denied storage reported, not fatal');
    const option=await file.evaluate(()=>CareerGame.roundAt(state).options.indexOf(CareerGame.playerAt(state).name));
    await file.locator('#options button').nth(option).click();ok(await file.evaluate(()=>CareerGame.stats(state).score===100),'Game works with localStorage denied');
    ok(errors.length===0,`File browser errors: ${errors.join('; ')}`);ok(requests.length===0,`Network requests: ${requests.join('; ')}`);
    return {passed:true,protocol:'file:',networkOffline:true,rounds:seen.size,uniqueCrestSources:crests.size,score:5940,fileSaveReload:true,storageDeniedPlayable:true,errors,networkRequests:requests};
  } finally {await isolated.close();}
}
