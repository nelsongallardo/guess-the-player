async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const legacy=__LEGACY_SAVE__;
  await page.goto('http://127.0.0.1:4173/?lang=es');
  await page.evaluate(s=>localStorage.setItem('touchline.career.v1',JSON.stringify(s)),legacy);await page.reload();
  ok(await page.evaluate(()=>JSON.stringify(state))===JSON.stringify(legacy),'Real published save preserved byte-for-byte');
  ok(await page.locator('#round-number').textContent()==='06 / 30','Legacy round total remains 30');
  ok(await page.locator('#progress').getAttribute('max')==='30','Legacy progress denominator');
  for(let i=legacy.roundIndex;i<legacy.deck.length;i++){
    const name=await page.evaluate(()=>CareerGame.playerAt(state).name);
    await page.getByRole('button',{name,exact:true}).click();
    ok(await page.locator('#next-label').textContent()===(i===29?'Ver resultados':'Siguiente jugador'),'Legacy final round boundary');
    await page.locator('#next').click();
  }
  ok(await page.evaluate(()=>state.finished&&CareerGame.stats(state).score===3000),'Legacy game completes at original length');
  ok((await page.locator('#summary-caption').textContent()).includes('30 / 30'),'Legacy recap denominator');
  await page.locator('#replay').click();
  ok(await page.evaluate(()=>state.deck.length===40&&state.difficulty==='hard'),'Replay upgrades to all 40 and preserves level');
  ok(await page.locator('#round-number').textContent()==='01 / 40','New round total 40');
  ok(await page.locator('#progress').getAttribute('max')==='40','New progress denominator');
  const additions=await page.evaluate(old=>PLAYERS.filter(p=>!old.deck.includes(p.id)).map(p=>p.id),legacy);
  ok(additions.length===10&&additions.includes('fabricio-coloccini')&&additions.includes('juan-pablo-sorin'),'All ten new players are playable');
  const examples=[];
  await page.setViewportSize({width:375,height:667});
  for(const id of ['fabricio-coloccini','juan-pablo-sorin']){
    const row=await page.evaluate(id=>{state=CareerGame.create('hard');const p=PLAYERS.find(p=>p.id===id);state.deck=[id,...state.deck.filter(x=>x!==id)];state.rounds=[{options:CareerGame.optionsFor(p,'hard'),guesses:[],hints:0,difficulty:'hard'}];render(false,true);scrollTo(0,0);return{id,clubs:p.clubs.map(c=>c.name),options:CareerGame.roundAt(state).options};},id);
    await page.screenshot({path:'test-results/'+id+'.png',fullPage:true});examples.push(row);
  }
  return {passed:true,legacyRoundCount:legacy.deck.length,newRoundCount:40,additions,examples};
}
