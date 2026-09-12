async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const url='http://127.0.0.1:4173/index.html',errors=[],runs=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?lang=en');
  await page.evaluate(()=>localStorage.removeItem('touchline.career.v1'));await page.reload();
  ok(await page.locator('#difficulty, .difficulty-row, #difficulty-note').count()===0,'Difficulty selection is removed, not hidden');
  ok(await page.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'),'New game uses standard rival selection');
  await page.setViewportSize({width:375,height:667});
  // Old preferences must not survive as an invisible setting. Current rounds must survive exactly.
  for(const preference of ['easy','medium','hard',null]){
    const legacy=await page.evaluate(level=>{
      const s=CareerGame.create(level||'hard');
      CareerGame.answer(s,CareerGame.playerAt(s).name);CareerGame.next(s);
      CareerGame.hint(s);CareerGame.answer(s,CareerGame.roundAt(s).options.find(n=>n!==CareerGame.playerAt(s).name));
      if(level===null){delete s.difficulty;s.rounds.forEach(r=>delete r.difficulty);}
      localStorage.setItem('touchline.career.v1',JSON.stringify(s));return s;
    },preference);
    await page.reload();
    ok(await page.evaluate(old=>JSON.stringify(state)===JSON.stringify({...old,difficulty:'hard'}),legacy),'Only obsolete preference changes; deck, options, hints, guesses and score survive');
    await page.locator('#language').selectOption('es');await page.reload();
    ok(await page.evaluate(old=>JSON.stringify(state.rounds)===JSON.stringify(old.rounds),legacy),'Language change and reload preserve rounds');
    const correct=await page.evaluate(()=>CareerGame.playerAt(state).name);
    await page.getByRole('button',{name:correct,exact:true}).click();await page.locator('#next').click();
    ok(await page.evaluate(()=>CareerGame.roundAt(state).difficulty==='hard'&&CareerGame.stats(state).score===180),'Next round uses standard rivals without losing score');
  }
  for(const language of ['en','es']){
    await page.goto(url+'?lang='+language);
    await page.evaluate(()=>{state=CareerGame.create();render(false,true);});
    ok(await page.locator('#difficulty, .difficulty-row, #difficulty-note').count()===0,'No selector in either language');
    await page.locator('#help').click();
    ok(!/difficulty|dificultad|Easy, Medium|Fácil, Media/i.test(await page.locator('#rules').innerText()),'Help no longer asks for a difficulty choice');
    await page.keyboard.press('Escape');
    const seen=new Set();
    for(let i=0;i<60;i++){
      const p=await page.evaluate(()=>({id:CareerGame.playerAt(state).id,name:CareerGame.playerAt(state).name,difficulty:CareerGame.roundAt(state).difficulty,options:CareerGame.roundAt(state).options}));
      ok(p.difficulty==='hard','Standard selection applied to every round');seen.add(p.id);
      ok(p.options.length===5&&new Set(p.options).size===5,'Five unique options');
      await page.getByRole('button',{name:p.name,exact:true}).click();await page.locator('#next').click();
    }
    ok(seen.size===60,'Full unique deck');
    ok(await page.evaluate(()=>state.finished&&CareerGame.stats(state).score===6000),'Full playthrough score');
    await page.locator('#replay').click();
    ok(await page.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'&&CareerGame.stats(state).score===0),'Replay uses standard selection');
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile overflow');
    runs.push({language,playedRounds:seen.size});
  }
  // Keep the already-published competition, history and reset flows intact.
  ok(await page.evaluate(()=>loadHistory().length>0),'Finished games still recorded in local history');
  const historyBefore=await page.evaluate(()=>JSON.stringify(loadHistory()));
  const competitions=await page.evaluate(()=>['all',...CareerGame.COMPETITION_IDS]);
  for(const id of competitions){
    await page.locator('#change-competition').click();
    const label=await page.evaluate(id=>copy().competitions[id],id);
    await page.locator('#competition-options button').filter({hasText:label}).click();
    ok(await page.evaluate(id=>state.competition===id&&state.difficulty==='hard'&&state.deck.length===CareerGame.playersFor(id).length&&CareerGame.roundAt(state).difficulty==='hard',id),'Competition starts with current Hard behaviour');
    await page.reload();
    ok(await page.evaluate(id=>state.competition===id&&state.difficulty==='hard',id),'Competition and Hard survive reload');
  }
  ok(await page.evaluate(()=>JSON.stringify(loadHistory()))===historyBefore,'Competition changes preserve results history');
  // The CLI owns native dialog events; capture confirmation in-page for this handler check.
  await page.evaluate(()=>{window.originalConfirm=window.confirm;window.confirm=message=>{window.resetConfirmation=message;return true;};});
  await page.locator('#reset-progress').click();
  ok(await page.evaluate(()=>{const confirmed=window.resetConfirmation===copy().resetConfirm;window.confirm=window.originalConfirm;return confirmed;}),'Reset requests localized confirmation');
  ok(await page.evaluate(()=>loadHistory().length===0&&state.difficulty==='hard'&&state.competition==='all'&&CareerGame.stats(state).score===0),'Reset clears results and starts automatic Hard');
  const isolated=await page.context().browser().newContext({offline:true,viewport:{width:320,height:667}});
  try{
    await isolated.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage denied');}});});
    const fresh=await isolated.newPage();await fresh.goto(__FILE_URL__);
    ok(await fresh.locator('#difficulty').count()===0,'No selector offline');
    const name=await fresh.evaluate(()=>CareerGame.playerAt(state).name);
    await fresh.getByRole('button',{name,exact:true}).click();await fresh.locator('#next').click();
    ok(await fresh.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'&&CareerGame.stats(state).score===100),'Standard game works offline without storage');
  }finally{await isolated.close();}
  ok(errors.length===0,errors.join('; '));
  return {passed:true,runs,playedRounds:runs.reduce((n,r)=>n+r.playedRounds,0),legacyProgressPreserved:true,selectorRemoved:true,offlineWithoutStorage:true,browserErrors:errors};
}
