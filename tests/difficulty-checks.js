async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const url='http://127.0.0.1:4173/index.html',errors=[],runs=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?lang=en');
  await page.evaluate(()=>localStorage.removeItem('touchline.career.v1'));await page.reload();
  ok(await page.locator('#difficulty').inputValue()==='medium','New game defaults to Medium');
  await page.setViewportSize({width:375,height:667});
  await page.locator('#difficulty').selectOption('hard');
  ok(await page.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'),'Fresh round switches immediately');
  await page.locator('#hint').click();
  const started=await page.evaluate(()=>JSON.stringify(CareerGame.roundAt(state)));
  await page.locator('#difficulty').selectOption('easy');
  ok(await page.evaluate(()=>JSON.stringify(CareerGame.roundAt(state)))===started,'No reroll after a hint');
  ok((await page.locator('#difficulty-note').textContent()).includes('Next player: Easy'),'Pending English label');
  await page.locator('#language').selectOption('es');
  ok((await page.locator('#difficulty-note').textContent()).includes('Siguiente: Fácil'),'Pending Spanish label');
  await page.reload();
  ok(await page.evaluate(()=>JSON.stringify(CareerGame.roundAt(state)))===started,'Reload preserves pending round');
  ok(await page.locator('#difficulty').inputValue()==='easy','Preference persisted');
  const correct=await page.evaluate(()=>CareerGame.playerAt(state).name);
  await page.getByRole('button',{name:correct,exact:true}).click();await page.locator('#next').click();
  // A hint was revealed on this round earlier (line 11), so its win scores 80 (100 x 0.8 hint multiplier).
  ok(await page.evaluate(()=>CareerGame.roundAt(state).difficulty==='easy'&&CareerGame.stats(state).score===80),'Next round applies preference without losing score');
  // Legacy saves must retain their exact old options, hints and guesses.
  const legacy=await page.evaluate(()=>{const s=CareerGame.create();CareerGame.hint(s);delete s.difficulty;s.rounds.forEach(r=>delete r.difficulty);localStorage.setItem('touchline.career.v1',JSON.stringify(s));return s;});
  await page.reload();
  ok(await page.evaluate(old=>{const r=CareerGame.roundAt(state);return r.hints===old.rounds[0].hints&&JSON.stringify(r.options)===JSON.stringify(old.rounds[0].options)&&state.difficulty==='medium'&&r.difficulty===undefined;},legacy),'Legacy progress migrated, not reset');
  for(const language of ['en','es'])for(const difficulty of ['easy','medium','hard']){
    await page.goto(url+'?lang='+language);
    await page.evaluate(()=>{state=CareerGame.create();render(false,true);});
    await page.locator('#difficulty').selectOption(difficulty);
    const seen=new Set();
    for(let i=0;i<60;i++){
      const p=await page.evaluate(()=>({id:CareerGame.playerAt(state).id,name:CareerGame.playerAt(state).name,difficulty:CareerGame.roundAt(state).difficulty,options:CareerGame.roundAt(state).options}));
      ok(p.difficulty===difficulty,'Selected difficulty applied to every round');seen.add(p.id);
      ok(p.options.length===5&&new Set(p.options).size===5,'Five unique options');
      await page.getByRole('button',{name:p.name,exact:true}).click();await page.locator('#next').click();
    }
    ok(seen.size===60,'Full unique deck');
    ok(await page.evaluate(()=>state.finished&&CareerGame.stats(state).score===6000),'Full playthrough score');
    await page.locator('#replay').click();
    ok(await page.evaluate(level=>state.difficulty===level&&CareerGame.roundAt(state).difficulty===level&&CareerGame.stats(state).score===0,difficulty),'Replay keeps difficulty');
    ok(await page.locator('#difficulty').inputValue()===difficulty,'Selector matches replay');
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile overflow');
    runs.push({language,difficulty,playedRounds:seen.size});
  }
  const isolated=await page.context().browser().newContext({offline:true,viewport:{width:320,height:667}});
  try{
    await isolated.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage denied');}});});
    const fresh=await isolated.newPage();await fresh.goto(__FILE_URL__);
    await fresh.locator('#difficulty').selectOption('hard');
    const name=await fresh.evaluate(()=>CareerGame.playerAt(state).name);
    await fresh.getByRole('button',{name,exact:true}).click();await fresh.locator('#next').click();
    ok(await fresh.evaluate(()=>state.difficulty==='hard'&&CareerGame.roundAt(state).difficulty==='hard'&&CareerGame.stats(state).score===100),'Difficulty works offline without storage');
  }finally{await isolated.close();}
  await page.goto(url+'?lang=es');
  await page.evaluate(()=>{state=CareerGame.create('hard');const p=PLAYERS.find(p=>p.id==='javier-zanetti');state.deck=[p.id,...state.deck.filter(id=>id!==p.id)];state.rounds=[{options:CareerGame.optionsFor(p,'hard'),guesses:[],hints:0,difficulty:'hard'}];render(false,true);scrollTo(0,0);});
  await page.screenshot({path:'test-results/difficulty-spanish.png',fullPage:true});
  ok(errors.length===0,errors.join('; '));
  return {passed:true,runs,playedRounds:runs.reduce((n,r)=>n+r.playedRounds,0),legacyProgressPreserved:true,pendingChangeAndReload:true,offlineWithoutStorage:true,browserErrors:errors};
}
