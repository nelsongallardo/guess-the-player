async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const url='http://127.0.0.1:4173/index.html';
  await page.goto(url+'?lang=en');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cases=[];
  for(const locale of ['en','es']){
    await page.goto(url+'?lang='+locale);
    for(const width of [320,375,430,580,768]){
      await page.setViewportSize({width,height:667});
      const rows=await page.evaluate(async({locale})=>{
        const checked=[];
        for(const player of PLAYERS){
          state=CareerGame.create();state.deck=[player.id,...state.deck.filter(id=>id!==player.id)];state.rounds=[{options:CareerGame.optionsFor(player),guesses:[],hints:0}];render(false,true);document.querySelector('#round-panel').scrollIntoView({block:'start'});
          await Promise.all([...document.images].map(i=>i.decode()));
          const strip=document.querySelector('#timeline-scroll'),rect=strip.getBoundingClientRect(),clubs=[...document.querySelectorAll('#timeline .club')];
          const allVisible=clubs.every(c=>{const b=c.getBoundingClientRect();return b.left>=rect.left&&b.right<=rect.right+1&&b.top>=rect.top&&b.bottom<=rect.bottom+1;});
          const crestsVisible=clubs.every(c=>{const b=c.querySelector('img').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth;});
          const noOverflow=strip.scrollWidth<=strip.clientWidth&&document.documentElement.scrollWidth<=innerWidth;
          if(!noOverflow||!allVisible)throw new Error('Mobile career must show every club without horizontal scrolling: '+player.id);
          const numbered=clubs.every((c,i)=>c.querySelector('.club-step').textContent===String(i+1));
          const localizedHints=hintValues(player).every(v=>typeof v==='string'&&v.length>0);
          renderSources(player);
          const noteOK=locale!=='es'||document.querySelector('#source-content').textContent.includes(SPANISH_NOTES[player.id].notes);
          if(!(allVisible&&crestsVisible&&numbered&&noOverflow&&localizedHints&&noteOK))throw new Error(JSON.stringify({player:player.id,locale,width:innerWidth,allVisible,crestsVisible,numbered,noOverflow,localizedHints,noteOK}));
          checked.push(player.id);
        }
        return checked;
      },{locale});
      ok(rows.length===50&&new Set(rows).size===50,'Every player checked');cases.push({locale,width,players:rows.length});
      ok(!await page.locator('#career-navigation').isVisible(),'No mobile scroll controls');
    }
  }
  await page.goto(url+'?lang=es');await page.setViewportSize({width:375,height:667});
  await page.evaluate(()=>{state=CareerGame.create();const player=[...PLAYERS].sort((a,b)=>b.clubs.length-a.clubs.length)[0];state.deck=[player.id,...state.deck.filter(id=>id!==player.id)];state.rounds=[{options:CareerGame.optionsFor(player),guesses:[],hints:0}];render(false,true);scrollTo(0,0);});
  await page.screenshot({path:'test-results/mobile-spanish.png',fullPage:true});
  ok(await page.locator('#timeline img').evaluateAll(images=>images.every(i=>{const r=i.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})),'Longest career crests visible on initial 375x667 screen');
  ok(await page.locator('html').getAttribute('lang')==='es','Spanish HTML language');
  ok(await page.locator('#question').textContent()==='¿Quién es este jugador?','Spanish question');
  const expected=await page.evaluate(()=>hintValues(CareerGame.playerAt(state)));
  for(let h=0;h<3;h++){await page.locator('#hint').click();ok((await page.locator('#hints li').nth(h).textContent()).endsWith(expected[h]),'Spanish hint order and value');}
  const wrong=await page.evaluate(()=>CareerGame.roundAt(state).options.find(n=>n!==CareerGame.playerAt(state).name));
  await page.locator('#options button').filter({hasText:wrong}).click();
  ok((await page.locator('#feedback').textContent()).includes('Quedan 2 intentos'),'Spanish wrong-answer feedback');
  const saved=await page.evaluate(()=>JSON.stringify(state));
  await page.locator('#language').selectOption('en');ok(await page.evaluate(()=>JSON.stringify(state))===saved,'EN switch preserves progress');
  ok(await page.locator('#question').textContent()==='Who is this player?','English switch');
  await page.locator('#language').selectOption('es');ok(await page.evaluate(()=>JSON.stringify(state))===saved,'ES switch preserves progress');
  ok(page.url().includes('lang=es'),'Spanish URL shareable');await page.reload();ok(await page.evaluate(()=>language==='es'&&JSON.stringify(state))===saved,'Spanish save reload');
  await page.goto(url);ok(await page.locator('html').getAttribute('lang')==='es','Saved language honored without query');
  await page.goto(url+'?lang=en');ok(await page.locator('html').getAttribute('lang')==='en','Explicit URL overrides saved language');
  await page.goto(url+'?lang=es');await page.locator('#help').click();ok((await page.locator('#rules').textContent()).includes('tres intentos'),'Spanish rules');await page.keyboard.press('Escape');
  // Real Spanish playthrough, alternating first-attempt wins and three-attempt losses.
  await page.evaluate(()=>{state=CareerGame.create();render(false,true);});
  let wins=0;const seen=new Set();
  for(let i=0;i<50;i++){
    const p=await page.evaluate(()=>({id:CareerGame.playerAt(state).id,name:CareerGame.playerAt(state).name,options:CareerGame.roundAt(state).options}));seen.add(p.id);
    const chosen=i%2===0?[p.name]:p.options.filter(n=>n!==p.name).slice(0,3);
    for(const name of chosen)await page.locator('#options button').nth(p.options.indexOf(name)).click();
    if(i%2===0){wins++;ok((await page.locator('#feedback').textContent()).startsWith('¡Gol!'),'Spanish success');}
    else ok((await page.locator('#feedback').textContent()).includes('Sin intentos'),'Spanish loss');
    ok(await page.locator('#next-label').textContent()===(i===49?'Ver resultados':'Siguiente jugador'),'Spanish next/results');
    await page.locator('#next').click();
  }
  ok(seen.size===50,'Spanish all50 deck');ok((await page.locator('#summary-caption').textContent()).includes('25 / 50 jugadores acertados'),'Spanish recap');
  const final=await page.evaluate(()=>JSON.stringify(state));await page.locator('#language').selectOption('en');ok(await page.evaluate(()=>JSON.stringify(state))===final,'Finished language switch preserves recap');
  await page.locator('#language').selectOption('es');await page.locator('#replay').click();ok(await page.evaluate(()=>language==='es'&&CareerGame.stats(state).score===0),'Spanish replay');
  const isolated=await page.context().browser().newContext({locale:'es-AR'});
  try{const fresh=await isolated.newPage();await fresh.goto(url);ok(await fresh.locator('html').getAttribute('lang')==='es','Spanish browser auto-detection');await fresh.goto(url+'?lang=en');ok(await fresh.locator('html').getAttribute('lang')==='en','English URL overrides Spanish browser');}finally{await isolated.close();}
  ok(errors.length===0,errors.join('; '));
  return {passed:true,layoutCases:cases,totalPlayerLayouts:cases.reduce((n,c)=>n+c.players,0),spanishPlayedRounds:seen.size,spanishWins:wins,languageSwitchPreservesProgress:true,queryAndSavedAndBrowserLanguage:true,browserErrors:errors};
}
