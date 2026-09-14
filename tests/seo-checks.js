async page => {
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const browser=page.context().browser();
  const results=[];
  const checkPointsFAQ=async(p,lang)=>{
    const faq=p.locator('#points-faq'),summary=faq.locator('summary');
    assert(await summary.innerText()===(lang==='es'?'¿Cómo funcionan los puntos?':'How do points work?'),'Points FAQ translated');
    assert(!await faq.evaluate(el=>el.open),'Points FAQ starts collapsed');
    await summary.focus();await summary.press('Enter');
    assert(await faq.evaluate(el=>el.open),'Keyboard opens points FAQ');
    assert((await faq.innerText()).includes(lang==='es'?'20 puntos':'20 points'),'Worked scoring example visible');
    for(const width of [320,375,1280]){
      await p.setViewportSize({width,height:667});
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded FAQ fits width '+width);
      assert(await faq.locator('p').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth)),'FAQ text does not overflow '+width);
    }
    await summary.press('Space');
    assert(!await faq.evaluate(el=>el.open),'Keyboard closes points FAQ');
    await summary.click();assert(await faq.evaluate(el=>el.open),'Pointer opens points FAQ');
    await summary.click();assert(!await faq.evaluate(el=>el.open),'Pointer closes points FAQ');
    await p.setViewportSize({width:375,height:812});
  };
  const base='http://127.0.0.1:4173/index.html';
  const noJS=await browser.newContext({javaScriptEnabled:false});
  try {
    const p=await noJS.newPage();await p.goto(base);
    assert(await p.locator('html').getAttribute('lang')==='es','Static HTML is Spanish');
    assert((await p.locator('#about-game').innerText()).includes('Un juego gratis'),'Indexable explanation exists without JS');
    assert((await p.title()).includes('jugadores de fútbol'),'Descriptive static title');
    await checkPointsFAQ(p,'es');
    results.push('No-JavaScript crawler content and native points FAQ');
  }finally{await noJS.close();}
  for(const kind of ['default','query','saved','offline']){
    const ctx=await browser.newContext({locale:'en-GB',viewport:{width:375,height:812},offline:kind==='offline'});
    try{
      if(kind==='saved')await ctx.addInitScript(()=>localStorage.setItem('touchline.language.v1','en'));
      const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
      const url=kind==='offline'?__FILE_URL__.split('?')[0]:base+(kind==='query'?'?lang=en':'');
      await p.goto(url);await p.waitForFunction(()=>!document.documentElement.classList.contains('game-loading'));
      const lang=['query','saved'].includes(kind)?'en':'es';
      assert(await p.locator('html').getAttribute('lang')===lang,'Language precedence: '+kind);
      assert(await p.locator('#about-game').getAttribute('lang')===lang,'Explanation translated: '+kind);
      assert(await p.locator('#options button').count()===10,'Game ready');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
      if(kind==='offline')assert((await p.locator('#site-icon').getAttribute('href')).startsWith('data:image/svg+xml,'),'Offline icon remains embedded');
      await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
      const correct=await p.evaluate(()=>CareerGame.playerAt(state).name);
      await p.getByRole('button',{name:correct,exact:true}).click();
      const saved=await p.evaluate(()=>JSON.stringify(state));
      await checkPointsFAQ(p,lang);
      assert(await p.evaluate(()=>JSON.stringify(state))===saved,'Reading FAQ preserves answered round');
      await p.locator('#language').selectOption(lang==='es'?'en':'es');
      await checkPointsFAQ(p,lang==='es'?'en':'es');
      assert(await p.evaluate(()=>JSON.stringify(state))===saved,'Language switch and FAQ preserve answered round');
      assert(errors.length===0,errors.join('; '));results.push(kind);
      if(kind==='default'){
        await p.locator('#language').selectOption('es');
        await p.screenshot({path:'test-results/seo-mobile.png'});
        await p.locator('#about-game').scrollIntoViewIfNeeded();
        await p.getByText('Cómo jugar a derabona',{exact:true}).click();
        await p.screenshot({path:'test-results/seo-explainer.png'});
      }
    }finally{await ctx.close();}
  }
  return {passed:true,cases:results};
}
