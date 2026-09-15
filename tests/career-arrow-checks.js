async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
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

  // Diego Milito: Racing Club, Genoa, Real Zaragoza, Genoa, Inter Milan, Racing Club (six stops, one page).
  await page.setViewportSize({width:1128,height:700});
  await load('http://127.0.0.1:4173/index.html?lang=es');
  const desktop=await cards();
  ok(JSON.stringify(desktop.map(item=>item.name))===JSON.stringify(['Racing Club','Genoa','Real Zaragoza','Genoa','Inter Milan','Racing Club']),'Diego Milito chronology fixture');
  ok(JSON.stringify(desktop.map(item=>item.arrow))===JSON.stringify(['"➜"','"➜"','"➜"','none','"➜"','none']),'Desktop uses the same row-major arrow sequence as mobile, not a diagonal zigzag');
  // Row 1 (indices 0-3) all sit at the same y and increase in x left-to-right; row 2 starts back at a smaller x.
  for(let i=0;i<3;i++)ok(desktop[i].y===desktop[i+1].y&&desktop[i].x<desktop[i+1].x,`Card ${i+1}→${i+2} is a plain left-to-right step within row 1`);
  ok(desktop[3].y<desktop[4].y&&desktop[4].x<desktop[3].x,'Row 1 to row 2 wraps down and back to the left, like the mobile grid');
  ok(desktop[4].y===desktop[5].y&&desktop[4].x<desktop[5].x,'Row 2 continues left-to-right too');

  // A career longer than one page (more than eight clubs) needs a second page and horizontal scroll,
  // with no connector at the page boundary - same "no arrow at a row end" convention as everywhere else.
  await page.setViewportSize({width:1440,height:1080});
  const longest=await page.evaluate(()=>{
    const p=[...PLAYERS].sort((a,b)=>b.clubs.length-a.clubs.length)[0];
    state=CareerGame.create();
    state.deck=[p.id,...state.deck.filter(id=>id!==p.id)];
    state.rounds=[{options:CareerGame.optionsFor(p),guesses:[],hints:0}];
    render(false,true);
    return {id:p.id,clubs:p.clubs.length};
  });
  ok(longest.clubs>8,`Longest-career fixture needs more than one page to exercise the boundary (got ${longest.clubs} clubs)`);
  const paged=await page.evaluate(()=>{
    const pages=[...document.querySelectorAll('#timeline .timeline-page')];
    const strip=document.querySelector('#timeline-scroll');
    return {pageCount:pages.length,scrollWidth:strip.scrollWidth,clientWidth:strip.clientWidth};
  });
  ok(paged.pageCount>=2,`More than eight clubs render as at least two pages (got ${paged.pageCount})`);
  ok(paged.scrollWidth>paged.clientWidth,'Multiple pages need horizontal scroll at 1440px');
  const eighthArrow=await page.evaluate(()=>getComputedStyle(document.querySelectorAll('#timeline .club')[7],'::after').content);
  ok(eighthArrow==='none','No connector arrow at the page boundary (card 8), same convention as every other row end');

  // Mobile stays exactly as ADR 0016 left it: one continuous grid, same arrow sequence.
  await page.setViewportSize({width:375,height:900});
  await load('http://127.0.0.1:4173/index.html?lang=es');
  const mobile=await cards();
  ok(JSON.stringify(mobile.map(item=>item.arrow))===JSON.stringify(['"➜"','"➜"','"➜"','none','"➜"','none']),'Mobile keeps the same row-major arrow sequence through the 800px breakpoint');
  return {passed:true,desktop:desktop.map(({name,arrow})=>({name,arrow})),pagedCareer:paged,mobile:mobile.map(({name,arrow})=>({name,arrow}))};
}
