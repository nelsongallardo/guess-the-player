// Real browser UI; leaderboard API responses are explicitly mocked.
// Run from a page on the isolated worktree's HTTP server (any port).
async page => {
  const browser=page.context().browser(),checks=[],errors=[];
  const base=await page.evaluate(()=>location.origin);
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  for(const width of [375,1440]){
    const context=await browser.newContext({viewport:{width,height:667}});
    let release;
    try{
      await context.route('**/functions/v1/ranked-game',async route=>{
        if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
        await new Promise(resolve=>release=resolve);
        await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({entries:[],total:0,own:null})});
      });
      const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
      await p.goto(base+'/index.html?unlimited=1&lang=es');
      await p.locator('#play-unlimited-start').click();await p.locator('#hint').click();
      const save=await p.evaluate(()=>sessionStorage.getItem('touchline.career.v1'));
      for(const [lang,label] of [['es','Clasificación'],['en','Leaderboard'],['es','Clasificación']]){
        await p.locator('#language').selectOption(lang);
        ok(await p.locator('#nav-board').textContent()===label,`${width}px ${lang} game navigation: ${label}`);
        ok(await p.getByRole('link',{name:label,exact:true}).count()===1,`${width}px ${lang} accessible navigation name`);
        ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${lang} game fits horizontally`);
      }
      ok(await p.evaluate(value=>sessionStorage.getItem('touchline.career.v1')===value,save),'Language switch preserves engaged game');
      await p.locator('#nav-board').click();
      await p.locator('#board-loading').waitFor({state:'visible'});
      for(const [lang,title,loading] of [['es','Clasificación pública','Cargando tabla…'],['en','Public leaderboard','Loading leaderboard…'],['es','Clasificación pública','Cargando tabla…']]){
        await p.locator('#language').selectOption(lang);
        ok(await p.title()===title+' — derabona',`${width}px ${lang} document title`);
        ok(await p.getByRole('heading',{name:title,level:1,exact:true}).count()===1,`${width}px ${lang} accessible page heading`);
        ok(await p.locator('#board-heading').textContent()===title,`${width}px ${lang} accessible board-region heading`);
        ok(await p.locator('#leaderboard-status').textContent()===loading&&await p.locator('#board-loading-label').textContent()===loading,`${width}px ${lang} live and visual loading copy`);
        ok(await p.evaluate(()=>location.pathname==='/leaderboard.html'),`${width}px ${lang} route unchanged`);
        ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${lang} board fits horizontally`);
      }
      await p.waitForFunction(()=>document.querySelector('#board-loading')&&!document.querySelector('#board-loading').hidden);
      while(!release)await p.waitForTimeout(10);
      release();release=null;
      await p.waitForFunction(()=>document.querySelector('#leaderboard-status').dataset.state==='empty');
      ok(await p.locator('#personal-detail').textContent()==='Los puntos de invitado no pasan a la tabla.','Guest destination reference uses tabla');
      ok(await p.evaluate(value=>sessionStorage.getItem('touchline.career.v1')===value,save),'Leaderboard navigation preserves engaged game');
    }finally{release?.();await context.close();}
  }
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:375,height:667}});
  try{
    const p=await context.newPage();await p.goto(base+'/index.html');
    ok(await p.getByRole('link',{name:'Clasificación',exact:true}).count()===1,'No-JS Spanish navigation uses Clasificación');
    await p.goto(base+'/leaderboard.html');
    ok(await p.title()==='Clasificación pública — derabona'&&await p.locator('h1').textContent()==='Clasificación pública','No-JS title and heading state the public leaderboard scope');
    ok((await p.locator('noscript').textContent()).includes('La tabla necesita JavaScript y conexión.'),'No-JS explanation uses tabla');
  }finally{await context.close();}
  ok(errors.length===0,'No runtime errors');
  return {passed:true,backend:'EXPLICIT PUBLIC LEADERBOARD API MOCK',checks,errors};
}
