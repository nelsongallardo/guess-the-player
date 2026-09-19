async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  // ?unlimited=1 is required: Daily is now the default landing mode, and
  // render() short-circuits into DailyUI before ever reaching this fixture.
  const load=async(url,id='diego-milito')=>{
    await page.goto(url);
    await page.evaluate(id=>{
      const player=PLAYERS.find(item=>item.id===id);
      if(!player)throw new Error(`${id} fixture missing`);
      state=CareerGame.create('hard');
      state.deck=[player.id,...state.deck.filter(id=>id!==player.id)];
      state.rounds=[{options:CareerGame.optionsFor(player,'hard'),guesses:[],hints:0,difficulty:'hard'}];
      render(false,true);
    },id);
  };
  const cards=()=>page.locator('#timeline .club').evaluateAll(list=>list.map(card=>{
    const box=card.getBoundingClientRect();
    return {name:card.querySelector('.club-name').textContent,arrow:getComputedStyle(card,'::after').content,x:box.x,y:box.y};
  }));

  // Diego Milito: Racing Club, Genoa, Real Zaragoza, Genoa, Inter Milan, Racing Club (six stops).
  await page.setViewportSize({width:1128,height:700});
  await load('http://127.0.0.1:4173/index.html?lang=es&unlimited=1');
  const desktop=await cards();
  ok(JSON.stringify(desktop.map(item=>item.name))===JSON.stringify(['Racing Club','Genoa','Real Zaragoza','Genoa','Inter Milan','Racing Club']),'Diego Milito chronology fixture');
  // ADR 0021: desktop wraps at six columns, so a six-club career is one row
  // and every card except the last keeps its connector - including the 4th,
  // which the old eight-club paged grid suppressed.
  ok(JSON.stringify(desktop.map(item=>item.arrow))===JSON.stringify(['"➜"','"➜"','"➜"','"➜"','"➜"','none']),'Desktop connects every consecutive pair of a six-club career');
  for(let i=0;i<desktop.length-1;i++)ok(desktop[i].y===desktop[i+1].y,`Card ${i+1} and ${i+2} share one row on desktop`);
  for(let i=0;i<desktop.length-1;i++)ok(desktop[i].x<desktop[i+1].x,`Card ${i+1}→${i+2} steps strictly rightwards`);

  // The regression ADR 0021 fixes: with pages of eight, card 9 rendered to the
  // RIGHT of card 4 (page 2's top row beside page 1's), so scanning the top row
  // left-to-right skipped the middle of the career. Assert visual order now
  // equals chronological order for a career longer than one old page.
  await page.setViewportSize({width:1440,height:1080});
  const longest=await page.evaluate(()=>{
    const p=[...PLAYERS].sort((a,b)=>b.clubs.length-a.clubs.length)[0];
    state=CareerGame.create();
    state.deck=[p.id,...state.deck.filter(id=>id!==p.id)];
    state.rounds=[{options:CareerGame.optionsFor(p),guesses:[],hints:0}];
    render(false,true);
    return {id:p.id,clubs:p.clubs.length};
  });
  ok(longest.clubs>8,`Longest-career fixture must exceed the old eight-club page (got ${longest.clubs} clubs)`);
  const long=await cards();
  ok(long.length===longest.clubs,'Every club renders');
  const visual=[...long.keys()].sort((a,b)=> long[a].y-long[b].y || long[a].x-long[b].x);
  ok(JSON.stringify(visual)===JSON.stringify([...long.keys()]),'Reading the cards by position (top row, left to right) yields exactly chronological order');
  const rowCount=new Set(long.map(item=>item.y)).size;
  // Connectors are suppressed only at a real row end (every 6th card).
  long.forEach((item,index)=>{
    const last=index===long.length-1;
    const rowEnd=(index+1)%6===0;
    ok(item.arrow===(last||rowEnd?'none':'"➜"'),`Card ${index+1} connector matches its position (row end: ${rowEnd}, last: ${last})`);
  });
  ok(await page.evaluate(()=>document.querySelectorAll('#timeline .timeline-page').length)===0,'No page wrappers remain in the DOM');
  ok(await page.evaluate(()=>document.querySelector('#timeline').classList.contains('timeline-long')),'A career past two rows compacts instead of scrolling');
  const strip=await page.evaluate(()=>{
    const el=document.querySelector('#timeline-scroll');
    return {scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
  });
  ok(strip.scrollWidth<=strip.clientWidth+1,'Even the longest career needs no horizontal scrolling (ADR 0016)');
  ok(await page.evaluate(()=>[...document.querySelectorAll('#timeline .club-name')].every(n=>n.scrollWidth<=n.clientWidth+1)),'No club label is clipped at the compacted size');

  // Mobile stays exactly as ADR 0016 left it: one continuous wrapping grid,
  // with the connector suppressed at each real row end.
  await page.setViewportSize({width:375,height:900});
  await load('http://127.0.0.1:4173/index.html?lang=es&unlimited=1');
  const mobile=await cards();
  ok(JSON.stringify(mobile.map(item=>item.arrow))===JSON.stringify(['"➜"','"➜"','"➜"','none','"➜"','none']),'Mobile keeps row-major arrows with none at the wrapping row end');
  ok(new Set(mobile.map(item=>item.y)).size===2,'Six clubs wrap onto two rows of four at 375px');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal page overflow at 375px');
  return {passed:true,desktop:desktop.map(({name,arrow})=>({name,arrow})),longestCareer:{clubs:longest.clubs,rows:rowCount,scrolls:strip.scrollWidth>strip.clientWidth+1},mobile:mobile.map(({name,arrow})=>({name,arrow}))};
}
