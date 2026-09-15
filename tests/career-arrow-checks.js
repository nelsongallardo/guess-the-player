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
  const arrows=()=>page.locator('#timeline .club').evaluateAll(cards=>cards.map(card=>{
    const box=card.getBoundingClientRect();
    const arrow=getComputedStyle(card,'::after');
    return {name:card.querySelector('.club-name').textContent,arrow:arrow.content,x:box.x,y:box.y,top:arrow.top,right:arrow.right};
  }));

  await page.setViewportSize({width:1128,height:700});
  await load('http://127.0.0.1:4173/index.html?lang=es');
  const desktop=await arrows();
  ok(JSON.stringify(desktop.map(item=>item.name))===JSON.stringify(['Racing Club','Genoa','Real Zaragoza','Genoa','Inter Milan','Racing Club']),'Diego Milito chronology fixture');
  ok(JSON.stringify(desktop.map(item=>item.arrow))===JSON.stringify(['"↓"','"↗"','"↓"','"↗"','"↓"','none']),'Desktop arrows follow down, then up-right, through chronological pairs');
  for(const index of [1,3]){
    const source=desktop[index],target=desktop[index+1];
    ok(source.x<target.x&&source.y>target.y,`Desktop transition ${index+1}→${index+2} is bottom-left to top-right`);
    ok(parseFloat(source.top)<0&&parseFloat(source.right)<0,`Desktop transition ${index+1}→${index+2} arrow sits in the inter-card diagonal gap`);
  }

  await page.setViewportSize({width:801,height:700});
  await load('http://127.0.0.1:4173/index.html?lang=es','maxi-rodriguez');
  const oddDesktop=await arrows();
  ok(JSON.stringify(oddDesktop.map(item=>item.arrow))===JSON.stringify(['"↓"','"↗"','"↓"','"↗"','"↓"','"↗"','none']),'Desktop odd-length career ends without a dangling connector at the 801px breakpoint');
  ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Desktop breakpoint does not create page-level overflow');

  await page.setViewportSize({width:800,height:700});
  await load('http://127.0.0.1:4173/index.html?lang=es');
  const mobile=await arrows();
  ok(JSON.stringify(mobile.map(item=>item.arrow))===JSON.stringify(['"➜"','"➜"','"➜"','none','"➜"','none']),'Mobile keeps chronological left-to-right row arrows through the 800px breakpoint');
  return {passed:true,desktop:desktop.map(({name,arrow})=>({name,arrow})),oddDesktop:oddDesktop.map(({name,arrow})=>({name,arrow})),mobile:mobile.map(({name,arrow})=>({name,arrow}))};
}
