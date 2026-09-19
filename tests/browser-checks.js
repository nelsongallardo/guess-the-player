async page => {
  const checks=[]; const errors=[]; const external=[]; const seen=new Set(); const crests=new Set();
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4173/'))external.push(request.url());});
  // ?unlimited=1 is required: Daily is the default landing mode, so without it
  // render() short-circuits into DailyUI and none of these Unlimited fixtures
  // are ever exercised.
  const clean=async()=>{await page.goto('http://127.0.0.1:4173/index.html?lang=en&unlimited=1');await page.evaluate(()=>sessionStorage.clear());await page.reload();};
  const view=()=>page.evaluate(()=>({name:CareerGame.playerAt(state).name,id:CareerGame.playerAt(state).id,options:[...CareerGame.roundAt(state).options],guesses:[...CareerGame.roundAt(state).guesses],hints:CareerGame.roundAt(state).hints,result:CareerGame.outcome(state),stats:CareerGame.stats(state),index:state.roundIndex,finished:state.finished,valid:CareerGame.validate(state),hintValues:CareerGame.hintValues(CareerGame.playerAt(state)),crestUrls:CareerGame.playerAt(state).clubCrests}));
  const choose=async(name)=>{const s=await view();await page.locator('#options button').nth(s.options.indexOf(name)).click();};
  await clean();await page.setViewportSize({width:1440,height:1080});
  ok(await page.locator('#options button').count()===10,'Initial ten answers');ok(!await page.locator('#next').isVisible(),'Next hidden while playing');
  const first=await view();
  for(let h=0;h<2;h++){
    await page.locator('#hint').click();const items=await page.locator('#hints li').allTextContents();
    ok(items[h].endsWith(first.hintValues[h]),`Hint ${h+1} order/value`);ok((await view()).guesses.length===0,'Hints cost no attempts');
  }
  // Third hint reveals each club's years in the career timeline instead of a
  // single scalar value (unlike country/position, years differ per club).
  ok(!await page.locator('.club-years').first().isVisible(),'Years hidden in the timeline before the third hint');
  await page.locator('#hint').click();
  ok(await page.locator('.club-years').first().isVisible(),'Third hint reveals every club\'s years in the timeline');
  ok((await view()).guesses.length===0,'Third hint also costs no attempts');
  ok(await page.locator('#hint').isDisabled(),'Hint disabled after third reveal (initials hint removed)');
  const wrong=first.options.filter(n=>n!==first.name);
  await choose(wrong[0]);
  ok(await page.locator('#options .wrong:disabled').count()===1,'Wrong answer red and disabled');
  const stored=await page.evaluate(()=>sessionStorage.getItem('touchline.career.v1'));
  await page.reload();ok(await page.evaluate(()=>sessionStorage.getItem('touchline.career.v1'))===stored,'Reload preserves exact state/options/guesses/hints');
  await page.locator('#options .wrong').evaluate(button=>button.click());ok((await view()).guesses.length===1,'Disabled answer cannot spend a second attempt');
  await choose(wrong[1]);ok((await page.locator('#attempt-text').textContent()).includes('1 attempt'),'One attempt remains');
  // Isolate the hint multiplier from speed decay; the expanded roster makes
  // this setup legitimately exceed the two-second grace window on CI.
  await page.evaluate(()=>resetRoundClock());
  await choose(first.name);ok((await view()).stats.score===40,'Third-attempt win with all three hints revealed scores 40 (100 x 0.4 hint multiplier; hints capped at 3)');
  ok(await page.locator('#options .correct.goal').count()===1,'Correct answer green with success animation');
  ok(await page.locator('#options button:disabled').count()===10,'Round locked after win');
  ok(await page.locator('#next').isVisible(),'Next visible after win');ok(await page.evaluate(()=>document.activeElement.id)==='next','Focus moves to Next');
  await page.setViewportSize({width:375,height:667});await page.locator('#next').scrollIntoViewIfNeeded();
  await page.locator('#next').evaluate(button=>{button.click();button.click();});ok((await view()).index===1,'Rapid double Next cannot skip live round');
  ok(await page.locator('#timeline-scroll').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Mobile Next reveals new career instead of retaining old bottom scroll');
  const second=await view();for(const name of second.options.filter(n=>n!==second.name).slice(0,3))await choose(name);
  const lost=await view();ok(lost.result==='lost'&&lost.stats.score===40&&lost.stats.streak===0,'Three misses reset streak but retain points');
  ok(await page.locator('#options .wrong:disabled').count()===3,'Three incorrect answers disabled');
  ok((await page.locator('#feedback').textContent()).includes(second.name),'Loss reveals correct answer');ok(await page.locator('#next').isVisible(),'Next visible after loss');
  checks.push('hints, attempts, third-attempt win, disabled repeats, loss, score/streak, focus, persistence, double-click guards');
  await page.locator('#help').focus();await page.keyboard.press('Enter');ok(await page.locator('#rules').isVisible(),'Help opens by keyboard');await page.keyboard.press('Escape');ok(!await page.locator('#rules').isVisible(),'Escape closes modal');
  await page.evaluate(()=>sessionStorage.setItem('touchline.career.v1','{malformed'));
  await page.reload();ok((await view()).valid&&(await view()).index===0,'Malformed save recovers safely');
  await page.evaluate(()=>{state=CareerGame.create();const longest=[...PLAYERS].sort((a,b)=>b.clubs.length-a.clubs.length)[0];state.deck=[longest.id,...state.deck.filter(id=>id!==longest.id)];state.rounds=[{options:CareerGame.optionsFor(longest),guesses:[],hints:0}];render(false,true);});
  const layouts=[];
  for(const width of [320,375,768,1440]){
    await page.setViewportSize({width,height:1080});
    const layout=await page.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,timelineWidth:document.querySelector('#timeline-scroll').clientWidth,timelineContent:document.querySelector('#timeline-scroll').scrollWidth,buttons:[...document.querySelectorAll('#options button')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),first:document.querySelector('#timeline .club').getBoundingClientRect().left,rows:new Set([...document.querySelectorAll('#timeline .club')].map(c=>Math.round(c.getBoundingClientRect().top))).size}));
    ok(layout.pageWidth<=width,`No page overflow at ${width}px`);ok(layout.buttons.every(b=>b.h>=44&&b.w>=44),`Touch targets at ${width}px`);
    if(width<=800)ok(layout.timelineContent<=layout.timelineWidth,`Mobile career fully fits without horizontal scroll at ${width}px`);
    else{ok(layout.rows<=4,`Desktop career wraps within four rows at ${width}px (got ${layout.rows})`);ok(layout.timelineContent<=layout.timelineWidth+1,`Desktop longest career wraps in reading order instead of scrolling sideways at ${width}px (ADR 0016)`);}
    ok(layout.first>=0,'Debut crest visible, not clipped');layouts.push(layout);
    if(width===375)await page.screenshot({path:'test-results/mobile.png',fullPage:true});
    if(width===1440)await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  }
  checks.push('keyboard modal, malformed save recovery, 320/375/768/1440px layout, 44px touch targets');
  let wins=0,streak=0,best=0;const total=await page.evaluate(()=>PLAYERS.length);
  for(let i=0;i<total;i++){
    if(i===49)await page.setViewportSize({width:375,height:667});
    const s=await view();ok(s.index===i&&s.valid,'Valid round index');ok(!seen.has(s.id),'No repeated player');seen.add(s.id);s.crestUrls.forEach(u=>crests.add(u));
    ok(await page.locator('#options button').count()===10,`${s.name}: ten options`);
    const images=await page.evaluate(async()=>{const careerImages=[...document.querySelectorAll('#timeline img')];await Promise.all(careerImages.map(image=>image.decode()));return careerImages.length>0&&careerImages.every(image=>image.complete&&image.naturalWidth>0&&!image.hidden&&image.alt.endsWith('crest'));});ok(images,`${s.name}: all crests decode`);
    const misses=i%4;for(const name of s.options.filter(n=>n!==s.name).slice(0,misses))await choose(name);
    if(misses<3){await choose(s.name);wins++;streak++;best=Math.max(best,streak);}else streak=0;
    const done=await view();ok(done.stats.score===wins*100&&done.stats.streak===streak,`${s.name}: scoreboard`);ok(done.result===(misses<3?'won':'lost'),`${s.name}: result`);
    ok(await page.locator('#source-details').isVisible(),'Sources available after answer');
    await page.locator('#next').click();
  }
  ok((await view()).finished,'Final recap reached');ok(await page.locator('#summary-panel').isVisible(),'Final recap visible');
  ok(await page.locator('#review li').count()===total,`All ${total} result entries`);ok((await page.locator('#summary-caption').textContent()).includes(`Best streak: ${best}`),'Best streak recap');
  await page.reload();ok((await view()).finished,'Final recap survives reload');
  // Completed players are intentionally excluded across competitions. Clear
  // only the test's seen ledger so this branch exercises an available replay
  // without using Reset (which also clears lifetime history by design).
  await page.evaluate(()=>{seen=new Set();saveSeen();});
  await page.locator('#replay').click();ok((await view()).stats.score===0&&(await view()).index===0,'Replay resets deck score when unseen players are available');
  ok(await page.locator('#timeline-scroll').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Mobile replay reveals first career');
  checks.push(`all ${total} rounds and crest loads, mixed win/loss outcomes, recap, final-save reload, replay`);
  await page.emulateMedia({reducedMotion:'reduce'});const target=await view();await choose(target.name);
  ok(await page.locator('#options .correct').evaluate(button=>getComputedStyle(button).animationName)==='none','Reduced motion disables animation');
  await page.emulateMedia({reducedMotion:'no-preference'});
  ok(errors.length===0,`Browser errors: ${errors.join('; ')}`);ok(external.length===0,`Unexpected requests: ${external.join('; ')}`);
  return {passed:true,rounds:seen.size,uniqueCrestSources:crests.size,wins,score:wins*100,bestStreak:best,checks,layouts:layouts.map(({width,pageWidth,buttons})=>({width,pageWidth,minButtonHeight:Math.min(...buttons.map(b=>b.h))})),browserErrors:errors,externalRequests:external};
}
