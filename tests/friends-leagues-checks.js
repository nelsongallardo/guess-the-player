// Real Chromium + REAL Edge handler + REAL PostgreSQL through tests/leagues-bridge.mjs
// (start it first on 127.0.0.1:54330). Supabase Auth/OAuth and the SDK are
// SIMULATED: a scripted SDK stands in for Google, so this is not hosted OAuth evidence.
async page => {
 const BRIDGE='http://127.0.0.1:54330',SUPA='https://iaebecfxjwjzkapqdeha.supabase.co',SITE='http://127.0.0.1:4173';
 const browser=page.context().browser(),checks=[],errors=[],contexts=[];
 const ok=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
 const db=async sql=>(await page.context().request.post(BRIDGE+'/__test/sql',{data:{sql}})).json();
 const q=v=>"'"+String(v).replaceAll("'","''")+"'";
 const uuid=async()=>(await db('select gen_random_uuid()::text id'))[0].id;
 const account=async(nickname,prompted=true)=>{const id=await uuid();await db(`insert into auth.users(id) values(${q(id)}); insert into ranked_private.accounts(user_id,nickname,nickname_prompted) values(${q(id)},${q(nickname)},${prompted})`);return id;};
 const session=id=>({access_token:'test-'+id,user:{id,user_metadata:{}}});
 const sdk=state=>`(()=>{const listeners=[];window.supabase={createClient:(u,k,c)=>{const key=c.auth.storageKey;const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};return {auth:{
   getSession:async()=>({data:{session:read()},error:null}),
   onAuthStateChange:fn=>{listeners.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
   signInWithOAuth:async({options})=>{const u=new URL(options.redirectTo);${state.oauthUser?`u.searchParams.set('code','CODE-${state.oauthUser}')`:`u.searchParams.set('error','access_denied')`};setTimeout(()=>location.assign(u.href),50);return {error:null};},
   exchangeCodeForSession:async code=>{const id=code.slice(5),s={access_token:'test-'+id,user:{id,user_metadata:{}}};localStorage.setItem(key,JSON.stringify(s));return {data:{session:s},error:null};},
   signOut:async()=>{localStorage.removeItem(key);return {error:null};}}};}};})();`;
 async function makeContext({signedIn=null,oauthUser=null,denySession=false,viewport={width:1280,height:900}}={}){
   const ctx=await browser.newContext({viewport});contexts.push(ctx);
   const state={oauthUser,fail:0,requests:[],urls:[]};
   await ctx.addInitScript(([s,deny])=>{
     if(s&&!localStorage.getItem('mock-seeded')){localStorage.setItem('derabona.auth.v1',JSON.stringify(s));localStorage.setItem('mock-seeded','1');}
     if(deny)Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('denied','SecurityError');}});
   },[signedIn?session(signedIn):null,denySession]);
   await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({contentType:'application/javascript',body:sdk(state)}));
   await ctx.route('https://*.posthog.com/**',r=>r.abort());
   await ctx.route(SUPA+'/functions/v1/**',async r=>{
     const req=r.request(),body=req.postData();
     if(req.method()==='POST')state.requests.push({endpoint:req.url().split('/').pop(),body:body?JSON.parse(body):null});
     if(state.fail&&req.url().endsWith('private-leagues')&&req.method()==='POST'){state.fail--;return r.abort('failed');}
     const response=await r.fetch({url:req.url().replace(SUPA,BRIDGE)});await r.fulfill({response});
   });
   ctx.on('request',req=>state.urls.push(req.url()));
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
   return {ctx,p,state};
 }
 const visible=(p,sel,timeout=8000)=>p.locator(sel).waitFor({state:'visible',timeout});
 const text=async(p,sel)=>(await p.locator(sel).textContent()).trim();
 try{
  // The bridge database is disposable test state: start every run clean.
  await db('delete from public.test_clock; delete from auth.users');
  // ---- Owner creates a league (English, desktop).
  const ownerId=await account('Owner Ana'),inviteeId=await uuid(),deniedId=await uuid();
  const owner=await makeContext({signedIn:ownerId});
  await owner.ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:SITE});
  const discover=await makeContext({viewport:{width:375,height:667}});
  await discover.p.goto(SITE+'/index.html?lang=en');
  ok(await discover.p.locator('#friends-open').isVisible(),'Friends leagues are directly discoverable from the game');
  await discover.p.locator('#friends-open').click();await visible(discover.p,'#friends-signin');
  ok(await text(discover.p,'h1')==='Friends leagues','Direct link gives the private destination its own heading');
  ok(await discover.p.locator('#friends-how').isVisible(),'Signed-out visitors see how to create, invite and compete before signing in');
  ok(await discover.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile league introduction fits the viewport');
  await discover.p.goto(SITE+'/index.html?lang=en');
  await discover.p.evaluate(()=>{const store=DailyChallenge.createPersistence(localStorage);for(let i=0;i<3;i++){const a=store.today();store.guess(a.game.deck[a.game.roundIndex]);store.next();}});
  await discover.p.reload();
  ok(await discover.p.evaluate(()=>!DailyUI.isDaily()),'An ordinary return after Daily completion still opens Unlimited');
  await discover.p.goto(SITE+'/index.html?daily=1&lang=en');
  await visible(discover.p,'#daily-summary');
  ok(await discover.p.evaluate(()=>DailyUI.isDaily()&&DailyChallenge.createPersistence(localStorage).today().completion!==null),'Explicit Daily return opens the completed summary without resetting results');
  await owner.p.goto(SITE+'/leaderboard.html?lang=en');
  await owner.p.locator('#view-friends').click();
  await visible(owner.p,'#friends-list');
  ok(owner.p.url().includes('view=friends')&&await owner.p.locator('#public-board').isHidden(),'Friends view replaces public board, URL keeps view');
  ok((await text(owner.p,'#friends-empty')).startsWith('You’re not in any league'),'Empty list explains how to start');
  await owner.p.locator('#league-name-input').fill('  Weekend Five  ');
  await owner.p.locator('#league-create').click();
  await visible(owner.p,'#league-view');await visible(owner.p,'#league-invite-dialog');
  ok(await text(owner.p,'#league-name')==='Weekend Five','League created with trimmed name and opened');
  ok(await text(owner.p,'h1')==='Weekend Five'&&await owner.p.locator('#league-manage').isHidden(),'League name leads the page and settings stay out of the creation flow');
  ok(await owner.p.locator('#period-week').getAttribute('aria-pressed')==='true'&&!owner.p.url().includes('period='),'This week is the default period without URL period');
  await owner.p.locator('#invite-copy').click();
  const link=await owner.p.evaluate(()=>navigator.clipboard.readText());
  const token=(link.match(/#join=([A-Za-z0-9_-]{43,128})$/)||[])[1];
  ok(token&&link.startsWith(SITE+'/leaderboard.html?lang=en#join='),'Owner copies a fragment invitation link');
  ok((await text(owner.p,'#invite-copy-status')).includes('copied'),'Copy success is announced beside the invitation action');
  await owner.p.locator('#invite-dialog-close').click();
  await owner.p.locator('#league-invite-open').click();await visible(owner.p,'#league-invite-dialog');
  await owner.p.waitForFunction(()=>!document.querySelector('#invite-copy').disabled);
  ok(await owner.p.locator('#invite-copy').isEnabled(),'Owner can invite directly without opening league settings');
  await owner.p.keyboard.press('Escape');
  ok(await owner.p.locator('#league-play').getAttribute('href')==='index.html?daily=1&lang=en','League play action explicitly opens Daily');
  await owner.p.setViewportSize({width:320,height:568});
  ok(await owner.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Owner standings fit a narrow mobile viewport');
  await owner.p.setViewportSize({width:1280,height:900});
  let releaseManage,manageStarted;
  const started=new Promise(resolve=>manageStarted=resolve);
  const holdManage=async r=>{if(r.request().postDataJSON()?.action==='manage'){await new Promise(resolve=>{releaseManage=resolve;manageStarted();});}await r.fallback();};
  await owner.ctx.route(SUPA+'/functions/v1/private-leagues',holdManage);
  await owner.p.locator('#league-invite-open').click();await started;
  await owner.p.goBack();releaseManage();
  await visible(owner.p,'#friends-list');
  ok(!await owner.p.locator('#league-invite-dialog').isVisible(),'Browser Back dismisses a loading invitation instead of trapping the destination behind it');
  await owner.ctx.unroute(SUPA+'/functions/v1/private-leagues',holdManage);
  await owner.p.goForward();await visible(owner.p,'#league-view');
  const leagueId=(owner.p.url().match(/[?&]league=([0-9a-f-]{36})/)||[])[1];
  ok(leagueId,'League UUID kept in the authenticated board URL');
  // ---- Signed-out invitee on mobile: invite → sign-in route → OAuth → nickname → preview → join.
  const invitee=await makeContext({oauthUser:inviteeId,viewport:{width:375,height:667}});
  await invitee.p.goto(link);
  await visible(invitee.p,'#friends-signin');
  ok(!invitee.p.url().includes(token)&&!invitee.p.url().includes('#')&&invitee.p.url().includes('view=friends'),'Token scrubbed from visible URL before anything else');
  ok(await invitee.p.evaluate(t=>sessionStorage.getItem('derabona.league-invite.v1')===t,token),'Pending invitation kept in per-tab storage');
  ok((await invitee.p.locator('#friends-signin-link').getAttribute('href'))==='index.html?auth=friends&lang=en&invite=1','Sign-in goes to the known auth-only route, never with the token');
  await invitee.p.locator('#friends-signin-link').click();
  await visible(invitee.p,'#nickname-prompt-dialog',15000);
  ok(invitee.p.url().includes('index.html?')&&invitee.p.url().includes('auth=friends')&&!invitee.p.url().includes('code='),'OAuth code consumed and scrubbed on the auth route');
  ok(await invitee.p.locator('#round-panel').isHidden()&&await invitee.p.locator('#auth-route').isVisible(),'Auth route shows no game');
  await invitee.p.locator('#nickname-prompt-input').fill('Invitee Bo');
  await invitee.p.locator('#nickname-prompt-submit').click();
  await visible(invitee.p,'#friends-invite',15000);
  ok(invitee.p.url().startsWith(SITE+'/leaderboard.html?')&&invitee.p.url().includes('view=friends'),'Returned to Friends after sign-in');
  ok(await text(invitee.p,'#invite-name')==='Weekend Five'&&(await text(invitee.p,'#invite-zero')).startsWith('You start this league at zero'),'Preview shows league name and zero-start rule before Join');
  const oauthNav=invitee.state.urls.find(u=>u.includes('code=CODE-'));
  ok(oauthNav&&oauthNav.includes('auth=friends')&&oauthNav.includes('invite=1')&&!oauthNav.includes(token),'OAuth redirect URI carries no invitation token');
  const rankedActions=invitee.state.requests.filter(r=>r.endpoint==='ranked-game').map(r=>r.body.action);
  ok(rankedActions.length>0&&rankedActions.every(a=>['progress','enroll'].includes(a)),'Auth route sent only progress/enroll: '+rankedActions.join(','));
  const keys=await invitee.p.evaluate(()=>Object.keys(sessionStorage));
  ok(!keys.some(k=>/touchline\.(career|clock|clock-tab|history|lifetime|seen)|daily-clock/.test(k)),'No guest/Daily clock or game state written: '+keys.join(','));
  await invitee.p.locator('#invite-join').click();
  await visible(invitee.p,'#league-view');
  ok(await invitee.p.locator('#league-entries tr').count()===2,'Joined member sees both members');
  const gameplay=await db(`select (select count(*) from ranked_private.rounds where user_id=${q(inviteeId)})::int r,(select count(*) from ranked_private.daily_rounds where user_id=${q(inviteeId)})::int d,(select nickname from ranked_private.accounts where user_id=${q(inviteeId)}) n`);
  ok(gameplay[0].r===0&&gameplay[0].d===0&&gameplay[0].n==='Invitee Bo','Database proves no career/Daily round was created for the invitee; nickname enrolled');
  ok(await invitee.p.evaluate(()=>sessionStorage.getItem('derabona.league-invite.v1')===null),'Invitation cleared after a successful join');
  const tokenUses=[...owner.state.requests,...invitee.state.requests].filter(r=>JSON.stringify(r.body).includes(token)).map(r=>r.endpoint+':'+r.body.action);
  ok(tokenUses.every(u=>['private-leagues:preview','private-leagues:join'].includes(u))&&![...owner.state.urls,...invitee.state.urls].some(u=>u.includes(token)),'Token only ever sent in preview/join bodies, never in a URL');
  ok(await invitee.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Short mobile league view has no horizontal overflow');
  // ---- Scores, Today/This week, history navigation and Spanish.
  await db(`insert into ranked_private.daily_results(user_id,date,round_index,player_id,points,correct,finished_at)
    select u,(clock_timestamp() at time zone 'utc')::date,r,(select player_id from ranked_private.daily_schedule where slot_index=0),p,p>0,clock_timestamp()
    from (values(${q(ownerId)}::uuid,0,90),(${q(ownerId)}::uuid,1,0),(${q(inviteeId)}::uuid,0,40)) v(u,r,p)`);
  await owner.p.locator('#league-refresh').click();
  await owner.p.waitForFunction(()=>document.querySelector('#league-entries tr td:nth-child(3)')?.textContent==='90');
  await owner.p.locator('#period-today').click();
  await owner.p.waitForFunction(()=>document.querySelector('#period-today').getAttribute('aria-pressed')==='true');
  ok(owner.p.url().includes('period=today')&&(await text(owner.p,'#league-range')).startsWith('Today'),'Today period selected explicitly and kept in URL');
  ok((await owner.p.locator('#league-entries tr').nth(1).textContent()).includes('In progress · 1/3'),'Partial Daily shown as in progress');
  await owner.p.goBack();await owner.p.waitForFunction(()=>document.querySelector('#period-week')?.getAttribute('aria-pressed')==='true');
  ok(!owner.p.url().includes('period='),'Back restores the default weekly view');
  await owner.p.locator('#language').selectOption('es');
  ok(await text(owner.p,'#period-today')==='Hoy'&&await text(owner.p,'#league-history-open')==='Campeones anteriores','Spanish league controls');
  await owner.p.locator('#language').selectOption('en');
  // ---- Weekly rollover: trophies, keyboard-accessible weeks won, past winners.
  await db(`insert into public.test_clock values(((date_trunc('week',clock_timestamp() at time zone 'utc')+interval '7 days 5 seconds') at time zone 'utc'))`);
  await owner.p.locator('#league-refresh').click();
  await visible(owner.p,'#league-entries .trophy');
  const trophy=owner.p.locator('#league-entries .trophy');
  ok((await trophy.getAttribute('aria-label'))==='Owner Ana: 1 week won in this league. View weeks.'&&(await trophy.textContent()).includes('🏆'),'Trophy badge with translated accessible label');
  ok((await owner.p.locator('#league-entries td:nth-child(3)').allTextContents()).every(v=>v==='0'),'New week starts everyone at zero');
  await trophy.focus();await owner.p.keyboard.press('Enter');
  await visible(owner.p,'#league-wins');await owner.p.waitForFunction(()=>document.querySelectorAll('#wins-list li').length===1);
  ok((await text(owner.p,'#wins-list li')).includes('90 pts'),'Keyboard opens the specific weeks won with winning total');
  await owner.p.keyboard.press('Escape');
  await owner.p.locator('#league-history-open').click();await visible(owner.p,'#league-history');
  await owner.p.waitForFunction(()=>document.querySelectorAll('#history-list li').length===1);
  ok((await text(owner.p,'#history-list li')).includes('Owner Ana · 90 pts'),'Past winners lists the completed week');
  await owner.p.keyboard.press('Escape');
  // ---- Network failure: private error + Retry, never a public fallback.
  const before=owner.state.requests.length;owner.state.fail=1;
  await owner.p.locator('#league-refresh').click();await visible(owner.p,'#friends-retry');
  ok(owner.state.requests.slice(before).every(r=>r.endpoint==='private-leagues'),'Failed private read made no anonymous/public request');
  await owner.p.locator('#friends-retry').click();await visible(owner.p,'#league-view');
  // ---- Owner removes the member; confirmation is cancellable by keyboard.
  if(await owner.p.locator('#league-manage').isHidden())await owner.p.locator('#league-manage-toggle').click();
  await visible(owner.p,'#manage-members button');
  const beforeRemove=owner.state.requests.length;
  await owner.p.locator('#manage-members button').click();await visible(owner.p,'#league-confirm');
  ok(await owner.p.evaluate(()=>document.activeElement.id==='league-confirm-cancel'),'Destructive confirmation focuses Cancel');
  await owner.p.keyboard.press('Escape');
  ok(owner.state.requests.length===beforeRemove,'Escape cancels without a mutation');
  await owner.p.locator('#manage-members button').click();await owner.p.locator('#league-confirm-ok').click();
  await visible(owner.p,'#manage-removed button');
  await invitee.p.locator('#league-refresh').click();
  await visible(invitee.p,'#friends-list');
  ok((await text(invitee.p,'#friends-notice')).includes('isn’t available'),'Removed member loses access and private data');
  ok(await invitee.p.locator('#league-entries tr').count()===0||await invitee.p.locator('#league-view').isHidden(),'Removed member sees no standings');
  // ---- Account switch / sign-out clears private DOM synchronously.
  await owner.p.locator('#league-invite-open').click();await visible(owner.p,'#league-invite-dialog');
  await owner.p.waitForFunction(()=>!document.querySelector('#invite-copy').disabled);
  await owner.p.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw Error('denied');}}));
  await owner.p.locator('#invite-copy').click();await visible(owner.p,'#invite-link-field');
  ok((await owner.p.locator('#invite-link-field').inputValue()).includes('#join='),'Clipboard denial exposes a selectable invitation link');
  await owner.p.evaluate(()=>{localStorage.removeItem('derabona.auth.v1');window.dispatchEvent(new StorageEvent('storage',{key:'derabona.auth.v1'}));});
  await visible(owner.p,'#friends-signin');
  ok(await owner.p.locator('#league-view').isHidden()&&await owner.p.locator('#league-entries tr').count()===0,'Sign-out clears private league DOM');
  ok(!await owner.p.locator('#league-invite-dialog').isVisible()&&await owner.p.locator('#invite-link-field').inputValue()==='','Sign-out closes the invitation and clears its token');
  // ---- Denied storage: invitation lost through OAuth → explicit recovery, no fake join.
  const rotated=(await db(`select token from ranked_private.friend_league_invites where league_id=${q(leagueId)}`))[0].token;
  const denied=await makeContext({oauthUser:deniedId,denySession:true,viewport:{width:375,height:667}});
  await denied.p.goto(`${SITE}/leaderboard.html?lang=es#join=${rotated}`);
  await visible(denied.p,'#friends-signin');
  ok((await text(denied.p,'#friends-signin-detail')).startsWith('Iniciá sesión para ver la invitación'),'Denied storage still holds the invitation in memory (Spanish)');
  await denied.p.locator('#friends-signin-link').click();
  await visible(denied.p,'#nickname-prompt-dialog',15000);await denied.p.locator('#nickname-prompt-submit').click();
  await denied.p.waitForURL(/leaderboard\.html/,{timeout:15000});await visible(denied.p,'#friends-list');
  ok((await text(denied.p,'#friends-notice')).includes('Volvé a abrir el enlace original'),'Lost invitation after OAuth shows recovery message');
  ok(!denied.p.url().includes('invite=1'),'Recovery marker cleared from URL');
  ok((await db(`select count(*)::int c from ranked_private.friend_league_members where user_id=${q(deniedId)}`))[0].c===0,'No membership was created without an explicit join');
  // ---- OAuth cancellation on the auth route (Spanish).
  const cancel=await makeContext({oauthUser:null});
  await cancel.p.goto(SITE+'/index.html?auth=friends&lang=es');
  await visible(cancel.p,'#auth-route-retry',15000);
  ok((await text(cancel.p,'#auth-route-status')).startsWith('No se completó el inicio de sesión')&&!cancel.p.url().includes('error='),'Cancelled OAuth shows translated retry state and scrubbed URL');
  ok(!cancel.state.requests.some(r=>r.endpoint==='ranked-game'),'Cancelled sign-in made no gameplay requests');
  ok(await cancel.p.evaluate(()=>!Object.keys(sessionStorage).some(k=>/touchline\.clock|daily-clock|touchline\.career/.test(k))),'Cancelled route wrote no gameplay state');
  ok(errors.length===0,'No runtime errors: '+errors.join(' | '));
  return {passed:true,backend:'REAL Edge handler + REAL PostgreSQL via local bridge; Auth/OAuth/SDK SIMULATED',checks};
 }catch(error){throw Error(error.message+' | errors: '+errors.join(' | ')+' | passed: '+checks.join('; '));}
 finally{await db('delete from public.test_clock').catch(()=>{});for(const c of contexts)await c.close().catch(()=>{});}
}
