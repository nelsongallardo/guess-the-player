async page => {
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const errors=[],cases=[];page.on('pageerror',e=>errors.push(e.message));
  for(const language of ['en','es']){
    await page.goto('http://127.0.0.1:4173/index.html?lang='+language);
    ok((await page.title()).startsWith('derabona —'),'Localized page title uses derabona');
    ok(await page.locator('.wordmark').innerText()==='derabona','Lowercase wordmark');
    ok(!/touchline/i.test(await page.locator('body').innerText()),'No old brand in visible page copy');
    ok(await page.locator('.mark').getAttribute('viewBox')==='0 0 96 96','New rabona mark embedded');
    const icon=await page.locator('link[rel="icon"]').getAttribute('href');
    ok(icon==='/favicon.svg','Crawlable branded favicon on the hosted game');
    ok(await page.evaluate(()=>STORAGE_KEY==='touchline.career.v1'&&LANGUAGE_KEY==='touchline.language.v1'&&HISTORY_KEY==='touchline.history.v1'),'Rebrand preserves storage namespaces');
    for(const width of [320,375,430,580,768,1024,1440]){
      await page.setViewportSize({width,height:800});
      const layout=await page.evaluate(()=>{
        const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
        const brand=box('.brand'),controls=box('.masthead-right');
        return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,brand,controls,headline:box('#title'),competition:box('#change-competition'),scheme:getComputedStyle(document.documentElement).colorScheme};
      });
      ok(layout.pageWidth<=width,'No horizontal overflow: '+JSON.stringify(layout));
      ok(layout.brand.right<=layout.controls.left,'Brand and controls do not overlap: '+JSON.stringify(layout));
      ok(layout.brand.left>=0&&layout.controls.right<=width,'Header fully visible');
      ok(layout.headline.right<=width&&layout.competition.right<=width,'Headline and competition fit');
      ok(layout.scheme==='light','Light paper/celeste brand theme');
      cases.push({language,width});
    }
    await page.locator('#help').click();
    ok(!/touchline/i.test(await page.locator('#rules').innerText()),'Help retains no retired brand');
    await page.keyboard.press('Escape');
  }
  ok(errors.length===0,errors.join('; '));
  return {passed:true,brand:'derabona',headerCases:cases,storageNamespacesPreserved:true,embeddedLogoAndHostedFavicon:true,browserErrors:errors};
}
