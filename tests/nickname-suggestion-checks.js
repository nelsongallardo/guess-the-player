// REAL Chromium UI test for ADR 0019: the optional nickname field suggests
// the player's Google name once, editable, never auto-published. Mocked SDK
// + API (route-intercepted), NOT live Google OAuth or database correctness.
async page => {
  const browser=page.context().browser(),checks=[],errors=[];
  const ok=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  const api='https://nickname-suggestion-mock.invalid';
  const DEFAULT_ALIAS='Otter-4a76fa2a';
  const CUSTOM_ALIAS='Existing Custom Name';

  const run=async(url,{fullName,startingNickname}={})=>{
    const context=await browser.newContext({viewport:{width:1200,height:900}});
    const calls=[];
    try{
      await context.addInitScript(({fullName})=>{
        window.__mockSession=fullName?{access_token:'MOCK_TOKEN',user:{id:'00000000-0000-4000-8000-000000005555',user_metadata:{full_name:fullName}}}:null;
        window.__mockListener=null;
        if(window.__mockSession)localStorage.setItem('derabona.auth.v1','MOCK_SESSION');
      },{fullName});
      await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__mockSession},error:null}),onAuthStateChange:fn=>{window.__mockListener=fn;if(window.__mockSession)setTimeout(()=>fn('SIGNED_IN',window.__mockSession),0);return {data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async()=>({error:Error('MOCK_CANCELLED')}),signOut:async()=>{window.__mockSession=null;localStorage.removeItem('derabona.auth.v1');window.__mockListener?.('SIGNED_OUT',null);return {error:null}}}})};`}));
      let nickname=startingNickname||DEFAULT_ALIAS;
      await context.route(api+'/**',async route=>{
        const req=route.request();
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
        const body=req.postDataJSON();calls.push(body);
        const respond=data=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
        if(body.action==='enroll'){nickname=body.nickname;return respond({profile:{nickname,enrolled:true},progress:{totalPoints:0,answered:0,correct:0,seenPlayerIds:[],competitionCounts:{all:{answered:0,total:60}}},round:null});}
        return respond({profile:{nickname,enrolled:true},progress:{totalPoints:12,answered:3,correct:2,seenPlayerIds:[],competitionCounts:{all:{answered:3,total:60}}},round:null});
      });
      await context.route('**/*.html*',async route=>{
        const response=await route.fetch();let html=await response.text();
        html=html.replace(/Object\.freeze\(\{url:'[^']*',anonKey:'[^']*'\}\)/,`Object.freeze({url:'${api}',anonKey:'MOCK_KEY'})`);
        await route.fulfill({response,body:html});
      });
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
      await p.goto(url);
      if(url.includes('leaderboard')){await p.locator('#account-open-link').click();}
      else{await p.locator('#account-open').click();}
      if(fullName)await p.waitForFunction(()=>document.querySelector('#enrolled-status')?.textContent?.length>0);
      const value=await p.locator('#public-nickname').inputValue();
      await context.close();
      return {value,calls};
    }catch(e){await context.close();throw e;}
  };

  // A fresh sign-in still on the default animal alias: the field is pre-filled
  // with the Google name, editable, but nothing has been sent to the API yet.
  let result=await run('http://127.0.0.1:4173/index.html?lang=en',{fullName:'Test Player'});
  ok(result.value==='Test Player','index.html pre-fills the nickname field with the Google name');
  ok(!result.calls.some(c=>c.action==='enroll'),'index.html never auto-submits the suggestion - it is not an enroll call');

  result=await run('http://127.0.0.1:4173/leaderboard.html?lang=en',{fullName:'Test Player'});
  ok(result.value==='Test Player','leaderboard.html suggests the same Google name (component parity, ADR 0014/0019)');
  ok(!result.calls.some(c=>c.action==='enroll'),'leaderboard.html never auto-submits the suggestion either');

  // A returning account that already has a real custom nickname must never have it overwritten:
  // the field stays empty (the existing name only shows as a placeholder, same as always), and
  // is specifically NOT pre-filled with the Google name suggestion.
  result=await run('http://127.0.0.1:4173/index.html?lang=en',{fullName:'Test Player',startingNickname:CUSTOM_ALIAS});
  ok(result.value==='',`Existing custom nickname is not silently replaced by the Google-name suggestion (got "${result.value}")`);

  // A signed-out/guest visit never sees a suggestion (nothing to suggest, and the field stays empty).
  result=await run('http://127.0.0.1:4173/index.html?lang=en');
  ok(result.value==='','Guests get no nickname suggestion');

  ok(errors.length===0,'no browser errors: '+errors.join('; '));
  return {passed:true,checks};
}
