async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/index.html?lang=es');
  await page.setViewportSize({width:375,height:667});
  const sampled=await page.evaluate(()=>{
    const p=PLAYERS.find(p=>p.id==='diego-maradona'),byName=new Map(PLAYERS.map(p=>[p.name,p])),names=new Set();
    for(let i=0;i<100;i++)for(const n of CareerGame.optionsFor(p,'hard',Math.random,'la-liga').filter(n=>n!==p.name)){
      if(CareerGame.originFor(byName.get(n)).system!=='argentina')throw Error('Wrong-origin rival: '+n);
      names.add(n);
    }
    state=CareerGame.create('hard','la-liga');state.deck=[p.id,...state.deck.filter(id=>id!==p.id)];
    state.rounds=[{options:CareerGame.optionsFor(p,'hard',Math.random,'la-liga'),guesses:[],hints:0,difficulty:'hard'}];
    resetRoundClock();applyLanguage();render(false,true);scrollTo(0,0);
    return {rivals:[...names].sort(),displayedOptions:CareerGame.roundAt(state).options,roundCount:state.deck.length};
  });
  ok(await page.locator('#options button').count()===5,'Five answers retained');
  ok((await page.locator('#round-number').innerText()).endsWith('/ '+sampled.roundCount),'La Liga still controls deck');
  const before=await page.evaluate(()=>JSON.stringify(state));await page.reload();
  ok(await page.evaluate(()=>JSON.stringify(state))===before,'New options persist without rerolling on reload');
  await page.screenshot({path:'test-results/derabona-origin-maradona.png',fullPage:true});
  await page.locator('#hint').click();
  await page.evaluate(()=>resetRoundClock());
  await page.getByRole('button',{name:'Diego Maradona',exact:true}).click();
  ok(await page.evaluate(()=>CareerGame.stats(state).score===80),'Scoring and hint cost unchanged');
  await page.locator('#next').click();
  ok(await page.evaluate(()=>state.roundIndex===1&&state.competition==='la-liga'&&CareerGame.roundAt(state).difficulty==='hard'),'Next retains competition and Hard');
  ok(errors.length===0,errors.join('; '));
  return {passed:true,maradonaLaLigaOriginOnly:true,generatedRounds:100,...sampled,saveReloadPreserved:true,browserErrors:errors};
}
