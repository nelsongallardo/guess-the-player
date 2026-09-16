async page => {
 const ok=(v,m)=>{if(!v)throw Error(m);},results=[];
 const run=async(p,url,language)=>{
  const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url.split('?')[0]+'?lang='+language);ok(await p.evaluate(()=>document.documentElement.lang)===language,'Requested language loaded');
  // Seed real earned history through the existing finished-game renderer.
  await p.evaluate(()=>{state=CareerGame.create();while(!state.finished){CareerGame.answer(state,CareerGame.playerAt(state).name);CareerGame.next(state);}render(false,true);});
  const history=await p.evaluate(()=>sessionStorage.getItem('touchline.history.v1'));ok(history&&JSON.parse(history).length>0,'Real completed history seeded');
  const install=async action=>p.evaluate(action=>{
   const s=CareerGame.create();s.deck=['thierry-henry',...s.deck.filter(id=>id!=='thierry-henry')];
   s.rounds=[{options:['Zinedine Zidane','Paul Scholes','Thierry Henry','Eiður Guðjohnsen','Francesco Totti'],guesses:[],hints:0,difficulty:'hard'}];
   if(action==='guess')CareerGame.answer(s,'Paul Scholes');if(action==='hint')CareerGame.hint(s);
   if(!CareerGame.validate(s))throw Error('Screenshot save rejected');
   sessionStorage.setItem('touchline.career.v1',JSON.stringify(s));return s;
  },action);
  const old=await install('untouched');await p.reload();
  const loaded=await p.evaluate(()=>({state,stats:CareerGame.stats(state),buttons:[...document.querySelectorAll('#options button')].map(b=>b.getAttribute('aria-label'))}));
  ok(!loaded.state.rounds[0].options.includes('Paul Scholes'),'Untouched saved Henry must not retain Scholes after reload');
  // The 10-option format needs 9 distractors; Henry has exactly four tight
  // same-timeline contemporaries and no origin-tier-1 candidates, so those
  // four are always present (not an exact full set - the remaining five
  // widen to the next tier and can vary with near-boundary scoring noise).
  for(const name of ['Thierry Henry','Zinedine Zidane','Nicolas Anelka','Emmanuel Petit','Sylvain Wiltord'])ok(loaded.state.rounds[0].options.includes(name),name+' missing from upgraded Henry options');
  ok(JSON.stringify(loaded.state.deck)===JSON.stringify(old.deck)&&loaded.state.roundIndex===0&&loaded.stats.completed===0&&loaded.stats.score===0,'Deck and progress preserved');
  ok(loaded.buttons.length===10,'Ten rendered answers');
  await p.reload();ok(await p.evaluate(saved=>JSON.stringify(state)===JSON.stringify(saved),loaded.state),'Upgraded choices persist, no reload reroll');
  for(const action of ['guess','hint']){
   const engaged=await install(action);await p.reload();
   ok(await p.evaluate(saved=>JSON.stringify(state)===JSON.stringify(saved),engaged),'Engaged round preserved: '+action);
  }
  ok(await p.evaluate(()=>sessionStorage.getItem('touchline.history.v1'))===history,'Earned history unchanged');
  ok(errors.length===0,errors.join('; '));return {language,protocol:await p.evaluate(()=>location.protocol),options:loaded.state.rounds[0].options,historyPreserved:true,engagedRoundsPreserved:true,stableReload:true,errors};
 };
 for(const language of ['en','es'])results.push(await run(page,'http://127.0.0.1:4173/index.html',language));
 const offline=await page.context().browser().newContext({offline:true});
 try{const p=await offline.newPage();for(const language of ['en','es'])results.push(await run(p,__FILE_URL__,language));}finally{await offline.close();}
 return {passed:true,results};
}
