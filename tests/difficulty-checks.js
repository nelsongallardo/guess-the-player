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
    for(let i=0;i<70;i++){
      const p=await page.evaluate(()=>({id:CareerGame.playerAt(state).id,name:CareerGame.playerAt(state).name,difficulty:CareerGame.roundAt(state).difficulty,options:CareerGame.roundAt(state).options}));
      ok(p.difficulty==='hard','Standard selection applied to every round');seen.add(p.id);
      ok(p.options.length===10&&new Set(p.options).size===10,'Ten unique options');
      await page.getByRole('button',{name:p.name,exact:true}).click();await page.locator('#next').click();
    }
    ok(seen.size===70,'Full unique deck');
    ok(await page.evaluate(()=>state.finished&&CareerGame.stats(state).score===7000),'Full playthrough score');
    // Finishing all 70 marks every player "seen" (ADR 0005), which would
    // otherwise exhaust every competition including "all" - clear the
    // ledger here so this replay click keeps testing only what it always
    // tested (Hard/score reset on replay); the ledger itself gets its own
    // dedicated section after the reset test below.
    await page.evaluate(()=>{seen.clear();try{localStorage.removeItem('touchline.seen.v1');}catch{}});
    await page.locator('#replay').click();
    ok(await page.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'&&CareerGame.stats(state).score===0),'Replay uses standard selection');
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile overflow');
    runs.push({language,playedRounds:seen.size});
  }
  // Keep the already-published competition, history and reset flows intact.
  ok(await page.evaluate(()=>loadHistory().length>0),'Finished games still recorded in local history');
  const historyBefore=await page.evaluate(()=>JSON.stringify(loadHistory()));
  // The header score/streak are a lifetime running total (touchline.lifetime.v1),
  // independent of whichever deck/competition is active; only Reset zeroes it.
  const lifetimeBefore=await page.evaluate(()=>({score:lifetime.score,streak:lifetime.streak}));
  ok(lifetimeBefore.score>0,'Lifetime score accumulated from the playthroughs above');
  // Same reason as above: this loop is testing competition-switch/reload
  // mechanics, not the seen-ledger's exhaustion behaviour, so every
  // competition needs to still be selectable here.
  await page.evaluate(()=>{seen.clear();try{localStorage.removeItem('touchline.seen.v1');}catch{}});
  const competitions=await page.evaluate(()=>['all',...CareerGame.COMPETITION_IDS]);
  for(const id of competitions){
    await page.locator('#change-competition').click();
    const label=await page.evaluate(id=>copy().competitions[id],id);
    await page.locator('#competition-options button').filter({hasText:label}).click();
    ok(await page.evaluate(id=>state.competition===id&&state.difficulty==='hard'&&state.deck.length===CareerGame.playersFor(id).length&&CareerGame.roundAt(state).difficulty==='hard',id),'Competition starts with current Hard behaviour');
    ok(await page.evaluate(before=>lifetime.score===before.score&&lifetime.streak===before.streak&&document.getElementById('score').textContent===String(before.score).padStart(3,'0'),lifetimeBefore),'Competition change never resets the lifetime score/streak shown in the header');
    await page.reload();
    ok(await page.evaluate(id=>state.competition===id&&state.difficulty==='hard',id),'Competition and Hard survive reload');
    ok(await page.evaluate(before=>lifetime.score===before.score&&lifetime.streak===before.streak,lifetimeBefore),'Lifetime score/streak survive reload too');
  }
  ok(await page.evaluate(()=>JSON.stringify(loadHistory()))===historyBefore,'Competition changes preserve results history');
  await page.locator('#replay').click();
  ok(await page.evaluate(before=>lifetime.score===before.score&&lifetime.streak===before.streak&&CareerGame.stats(state).score===0,lifetimeBefore),'Replay resets the current deck but never the lifetime score/streak');
  // The CLI owns native dialog events; capture confirmation in-page for this handler check.
  await page.evaluate(()=>{window.originalConfirm=window.confirm;window.confirm=message=>{window.resetConfirmation=message;return true;};});
  await page.locator('#reset-progress').click();
  ok(await page.evaluate(()=>{const confirmed=window.resetConfirmation===copy().resetConfirm;window.confirm=window.originalConfirm;return confirmed;}),'Reset requests localized confirmation');
  ok(await page.evaluate(()=>loadHistory().length===0&&state.difficulty==='hard'&&state.competition==='all'&&CareerGame.stats(state).score===0&&lifetime.score===0&&lifetime.streak===0&&localStorage.getItem('touchline.lifetime.v1')===null),'Reset clears results, the lifetime score/streak, and starts automatic Hard');
  // ADR 0005: a player answered once (right or wrong) never repeats, in any
  // competition or replay, until Reset. The reset above just ran, so the
  // seen ledger is guaranteed empty here. Brasileirão (13 players) is small
  // enough to fully exhaust quickly.
  ok(await page.evaluate(()=>seen.size===0),'Reset above already cleared the seen ledger');
  await page.locator('#change-competition').click();
  const brasileiraoLabel=await page.evaluate(()=>copy().competitions['brasileirao']);
  const brasileiraoTotal=await page.evaluate(()=>CareerGame.playersFor('brasileirao').length);
  ok(await page.locator('#competition-options button').filter({hasText:brasileiraoLabel}).locator('.option-state').textContent()===String(brasileiraoTotal),'Brasileirão starts showing its full count, nothing seen yet');
  await page.locator('#competition-options button').filter({hasText:brasileiraoLabel}).click();
  ok(await page.evaluate(()=>state.competition==='brasileirao'&&state.deck.length===CareerGame.playersFor('brasileirao').length),'Brasileirão opens with its full, unseen pool');
  for(let i=0;i<brasileiraoTotal;i++){
    const name=await page.evaluate(()=>CareerGame.playerAt(state).name);
    await page.getByRole('button',{name,exact:true}).click();
    await page.locator('#next').click();
  }
  ok(await page.evaluate(total=>state.finished&&seen.size===total,brasileiraoTotal),'Every Brasileirão player is now in the permanent seen ledger');
  await page.locator('#change-competition').click();
  const brasileiraoOption=page.locator('#competition-options button').filter({hasText:brasileiraoLabel});
  ok(await brasileiraoOption.isDisabled(),'A fully-seen competition is disabled in the picker');
  ok(await brasileiraoOption.locator('.option-state').textContent()===await page.evaluate(()=>copy().competitionCompleted),'A fully-seen competition reads Completed, not a stale count');
  await page.locator('#competitions-close').click();
  const stateBeforeExhaustedReplay=await page.evaluate(()=>JSON.stringify(state));
  await page.locator('#replay').click();
  ok(await page.evaluate(before=>JSON.stringify(state)===before,stateBeforeExhaustedReplay),'Replaying a just-exhausted competition never builds a broken/empty deck');
  ok(await page.locator('#competitions').isVisible(),'Replaying a just-exhausted competition reopens the picker instead');
  await page.locator('#competitions-close').click();
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
