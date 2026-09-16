async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const saves=[__LEGACY_SAVE__,__LEGACY_SAVE_40__,__LEGACY_SAVE_50__,__LEGACY_SAVE_60__,__LEGACY_SAVE_160__],results=[];
  let currentTotal;
  for(const legacy of saves){
    const total=legacy.deck.length;
    await page.goto('http://127.0.0.1:4173/?lang=es');
    await page.evaluate(s=>{
      sessionStorage.clear();
      for(const key of ['touchline.career.v1','touchline.history.v1','touchline.lifetime.v1','touchline.seen.v1'])localStorage.removeItem(key);
      localStorage.setItem('touchline.career.v1',JSON.stringify(s));
    },legacy);await page.reload();
    ok(await page.evaluate(old=>JSON.stringify(state)===JSON.stringify({...old,difficulty:'hard',competition:old.competition||'all'}),legacy),'Published rounds preserved exactly; only retired preference and missing competition are normalized');
    const expectedScore=await page.evaluate(()=>CareerGame.stats(state).score+state.deck.slice(state.roundIndex).reduce((sum,_,i)=>sum+CareerGame.pointsFor(i===0?CareerGame.roundAt(state).hints:0,0),0));
    ok(await page.locator('#round-number').textContent()===`${String(legacy.roundIndex+1).padStart(2,'0')} / ${total}`,'Legacy round total');
    currentTotal=await page.evaluate(()=>PLAYERS.length);
    ok(await page.locator('#progress').getAttribute('max')===String(currentTotal),'Competition-wide progress denominator uses the current roster');
    for(let i=legacy.roundIndex;i<total;i++){
      const name=await page.evaluate(()=>{resetRoundClock();return CareerGame.playerAt(state).name;});
      await page.getByRole('button',{name,exact:true}).click();
      ok(await page.locator('#next-label').textContent()===(i===total-1?'Ver resultados':'Siguiente jugador'),'Legacy final round boundary');
      await page.locator('#next').click();
    }
    ok(await page.evaluate(n=>state.finished&&CareerGame.stats(state).score===n,expectedScore),'Legacy completes original length');
    ok((await page.locator('#summary-caption').textContent()).includes(`${total} / ${total}`),'Legacy recap denominator');
    const unseen=await page.evaluate(()=>PLAYERS.length-seen.size);
    await page.locator('#replay').click();
    ok(await page.evaluate(unseen=>state.deck.length===unseen&&state.difficulty==='hard',unseen),'Replay upgrades to the current unseen roster and preserves level');
    ok(await page.locator('#round-number').textContent()===`01 / ${unseen}`,'New unseen-deck total');
    ok(await page.locator('#progress').getAttribute('max')===String(currentTotal),'New competition-wide progress denominator');
    results.push({legacyRoundCount:total,newRoundCount:unseen,exactSavePreserved:true});
  }
  const additions40=await page.evaluate(old=>PLAYERS.filter(p=>!old.deck.includes(p.id)).map(p=>p.id),saves[1]);
  ok(additions40.length===currentTotal-40&&additions40.includes('javier-saviola')&&additions40.includes('claudio-pizarro')&&additions40.includes('rivaldo')&&additions40.includes('diego-maradona')&&additions40.includes('david-villa')&&additions40.includes('romario'),'Later batches playable from a 40-player save');
  const additions50=await page.evaluate(old=>PLAYERS.filter(p=>!old.deck.includes(p.id)).map(p=>p.id),saves[2]);
  ok(additions50.length===currentTotal-50&&additions50.includes('rivaldo')&&additions50.includes('diego-maradona')&&additions50.includes('cafu')&&additions50.includes('david-villa')&&additions50.includes('romario'),'Later batches playable from a 50-player save');
  const examples=[];
  await page.setViewportSize({width:375,height:667});
  for(const id of ['rivaldo','diego-maradona']){
    const row=await page.evaluate(id=>{state=CareerGame.create('hard');const p=PLAYERS.find(p=>p.id===id);state.deck=[id,...state.deck.filter(x=>x!==id)];state.rounds=[{options:CareerGame.optionsFor(p,'hard'),guesses:[],hints:0,difficulty:'hard'}];render(false,true);scrollTo(0,0);return{id,clubs:p.clubs.map(c=>c.name),options:CareerGame.roundAt(state).options};},id);
    await page.screenshot({path:'test-results/'+id+'.png',fullPage:true});examples.push(row);
  }
  return {passed:true,results,additions:{fromFortyPlayerSave:additions40,fromFiftyPlayerSave:additions50},examples};
}
