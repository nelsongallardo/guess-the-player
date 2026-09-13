async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/index.html?lang=es');
  await page.setViewportSize({width:375,height:667});
  const sampled=await page.evaluate(()=>{
    // The 10-option format needs 9 distractors; Maradona's tight bank of
    // researched contemporaries only has four, so those four must always be
    // present and every wrong answer must stay Argentine, but the remaining
    // slots legitimately widen to other real Argentine players (not just
    // this exact four-name bank) rather than ever giving away wrong origin.
    const p=PLAYERS.find(p=>p.id==='diego-maradona'),byName=new Map(CareerGame.candidates.map(p=>[p.name,p])),names=new Set();
    const peers=['Daniel Bertoni','Jorge Valdano','Ramón Díaz','Osvaldo Ardiles'];
    for(let i=0;i<100;i++){
      const wrong=CareerGame.optionsFor(p,'hard',Math.random,'la-liga').filter(n=>n!==p.name);
      for(const n of wrong){
        if(CareerGame.originFor(byName.get(n)).system!=='argentina')throw Error('Wrong-origin rival: '+n);
        names.add(n);
      }
      for(const peer of peers)if(!wrong.includes(peer))throw Error('Missing researched Maradona contemporary: '+peer);
    }
    state=CareerGame.create('hard','la-liga');state.deck=[p.id,...state.deck.filter(id=>id!==p.id)];
    state.rounds=[{options:CareerGame.optionsFor(p,'hard',Math.random,'la-liga'),guesses:[],hints:0,difficulty:'hard'}];
    resetRoundClock();applyLanguage();render(false,true);scrollTo(0,0);
    return {rivals:[...names].sort(),displayedOptions:CareerGame.roundAt(state).options,roundCount:state.deck.length};
  });
  ok(await page.locator('#options button').count()===10,'Ten answers retained');
  ok((await page.locator('#round-number').innerText()).endsWith('/ '+sampled.roundCount),'La Liga still controls deck');
  const wrong=sampled.displayedOptions.find(n=>n!=='Diego Maradona');
  await page.getByRole('button',{name:wrong,exact:true}).click();
  ok(await page.evaluate(()=>CareerGame.roundAt(state).guesses.length===1),'Researched bank rival spends one attempt');
  const before=await page.evaluate(()=>JSON.stringify(state));await page.reload();
  ok(await page.evaluate(()=>JSON.stringify(state))===before,'New options and wrong guess persist without rerolling on reload');
  ok(await page.getByRole('button',{name:wrong+', incorrecto',exact:true}).isDisabled(),'Saved wrong bank answer stays disabled with its accessible feedback');
  await page.screenshot({path:'test-results/derabona-origin-maradona.png',fullPage:true});
  await page.locator('#hint').click();
  await page.evaluate(()=>resetRoundClock());
  await page.getByRole('button',{name:'Diego Maradona',exact:true}).click();
  ok(await page.evaluate(()=>CareerGame.stats(state).score===80),'Scoring and hint cost unchanged');
  await page.locator('#next').click();
  ok(await page.evaluate(()=>state.roundIndex===1&&state.competition==='la-liga'&&CareerGame.roundAt(state).difficulty==='hard'),'Next retains competition and Hard');
  const coverage=await page.evaluate(()=>{
    const byName=new Map(CareerGame.candidates.map(p=>[p.name,p]));
    const examples={};
    for(const p of PLAYERS){
      const eligible=CareerGame.eligibleRivals(p).map(n=>byName.get(n));
      const options=CareerGame.optionsFor(p,'hard');
      const wrong=options.filter(n=>n!==p.name).map(n=>byName.get(n));
      // Only players with at least nine tightest-tier (matchTier 0) rivals
      // are guaranteed to fill every slot from that tier alone; thinner
      // pools legitimately widen, but must still never skip a tighter match.
      const tier0=eligible.filter(q=>CareerGame.matchTier(p,q)===0).length;
      if(tier0>=9&&!wrong.every(q=>CareerGame.matchTier(p,q)===0))throw Error('Origin/era giveaway: '+p.name);
      const boundary=Math.max(...wrong.map(q=>CareerGame.matchTier(p,q)));
      if(!eligible.filter(q=>CareerGame.matchTier(p,q)<boundary).every(q=>options.includes(q.name)))throw Error('Sampled away a stronger match: '+p.name);
      if(['pele','cristiano-ronaldo','thierry-henry','claudio-pizarro','eidur-gudjohnsen'].includes(p.id))examples[p.name]=options;
    }
    return {targets:PLAYERS.length,extraCandidates:CareerGame.candidates.length-PLAYERS.length,examples};
  });
  ok(errors.length===0,errors.join('; '));
  return {passed:true,maradonaLaLigaOriginOnly:true,maradonaContemporariesOnly:true,generatedRounds:100,...sampled,coverage,saveReloadPreserved:true,wrongBankGuessPreserved:true,browserErrors:errors};
}
