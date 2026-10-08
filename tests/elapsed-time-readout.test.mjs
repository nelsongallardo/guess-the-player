import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1]??'';

test('round header uses a neutral elapsed-time readout instead of a draining bar',()=>{
  // Not a static [hidden] attribute: the button's own 44px box is reserved
  // via CSS visibility at all times (including before a clock exists), so
  // it never pops into existence and shoves the career grid down once a
  // round becomes ready - see the "is-ready" tests below.
  assert.match(html,/id="elapsed-time"[^>]*class="elapsed-time"/);
  assert.doesNotMatch(html,/id="elapsed-time"[^>]*hidden/);
  assert.match(html,/id="elapsed-time-label">Time played</);
  assert.match(html,/id="elapsed-time-value"[^>]*>0:00</);
  assert.match(html,/\.elapsed-time\{[^}]*min-height:44px[^}]*visibility:hidden/,'the box is reserved from the start, only its paint is toggled');
  assert.match(html,/\.elapsed-time\.is-ready\{visibility:visible\}/);
  assert.doesNotMatch(html,/speed-meter-track|speed-meter-fill|speedMeterFraction/);
});

test('elapsed-time formatter counts upward without an endpoint or fractional pressure',()=>{
  const source=block('game-ui');
  const expression=source.match(/const formatElapsedTime=(.*?);/)?.[1];
  assert.ok(expression,'formatElapsedTime helper exists in game-ui');
  const formatElapsedTime=vm.runInNewContext(`(${expression})`);
  assert.equal(formatElapsedTime(0),'0:00');
  assert.equal(formatElapsedTime(999),'0:00');
  assert.equal(formatElapsedTime(1_000),'0:01');
  assert.equal(formatElapsedTime(61_999),'1:01');
  assert.equal(formatElapsedTime(3_600_000),'60:00');
});

test('a resolved round never reuses another round’s frozen elapsed time',()=>{
  const source=block('game-ui');
  const match=source.match(/const elapsedTimeFrame=([\s\S]*?\n});/);
  assert.ok(match,'elapsedTimeFrame helper is present');
  const guard=source.match(/const displayableElapsedMs=(.*?);/)?.[1];
  assert.ok(guard,'displayableElapsedMs helper is present');
  const elapsedTimeFrame=vm.runInNewContext(`const displayableElapsedMs=${guard};(${match[1]})`);
  let state={key:null,frozen:null};
  state=elapsedTimeFrame({key:'daily:2026-09-18:0',elapsedMs:5_000,playing:false,hints:0,points:92},state);
  assert.equal(state.shown.elapsedMs,5_000);
  state=elapsedTimeFrame({key:'guest:henry',elapsedMs:11_000,playing:false,hints:1,points:64},state);
  assert.equal(state.shown.elapsedMs,11_000);
  assert.equal(state.shown.points,64);
});

test('elapsed-time rendering does not depend on animation frames',()=>{
  const source=block('game-ui');
  assert.match(source,/renderElapsedTime\(\);setInterval\(renderElapsedTime,250\)/);
  assert.doesNotMatch(source,/requestAnimationFrame\(tick\)/);
});

test('ready mode defers a new Unlimited clock even when Unlimited is selected',()=>{
  const source=block('game-ui'),start=source.indexOf('let roundClockStart='),end=source.indexOf("window.addEventListener('pageshow'",start);
  const startup=source.slice(start,end);
  for(const selected of ['daily','unlimited']){
    const saved=[],removed=[];
    const context=vm.createContext({AuthRoute:{active:false},playActivated:false,loadRoundClock:()=>null,clockTabId:null,CLOCK_KEY:'clock',sessionStorage:{setItem(){},removeItem:key=>removed.push(key)},Date:{now:()=>12345},DailyUI:{requestedMode:()=>selected},Analytics:{shouldPauseGameClock:()=>false},saveRoundClock:value=>saved.push(value)});
    vm.runInContext(startup+';globalThis.start=startGuestClockForMode;globalThis.reset=resetRoundClock;',context);
    assert.deepEqual(saved,[],selected+' readiness writes no clock');
    context.reset();assert.deepEqual(saved,[],selected+' reset remains deferred while ready');
    context.playActivated=true;context.start();assert.deepEqual(saved,[12345],selected+' explicit start saves the clock exactly once');
    context.start();assert.deepEqual(saved,[12345],'repeated activation cannot restart that clock');
  }
});

test('Unlimited preserves the same tab but resets a new or restored browsing context',()=>{
  const source=block('game-ui');
  const expression=source.match(/const restoredRoundClockStart=(.*?);/)?.[1];
  assert.ok(expression,'restoredRoundClockStart helper exists in game-ui');
  const restoredRoundClockStart=vm.runInNewContext(`(${expression})`);
  const now=1_000_000_000_000;
  const saved={playerId:'messi',startedAt:now-1_234};
  assert.equal(restoredRoundClockStart(saved,'messi','reload',true,false,now),now-1_234);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',false,false,now),now-1_234);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',true,false,now),null);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',false,true,now),null);
  assert.equal(restoredRoundClockStart(saved,'messi','back_forward',true,false,now),null);
  assert.equal(restoredRoundClockStart(saved,'ronaldo','reload',true,false,now),null);
  assert.match(source,/const CLOCK_TAB_KEY='touchline\.clock-tab\.v1'/,'Unlimited stores a browsing-context identity separately from its clock');
  assert.match(source,/storedClockTab!==null&&storedClockTab!==clockTabId/,'same-tab identity survives full navigations without trusting cloned sessionStorage');
  assert.match(source,/window\.name=clockTabId/,'the per-tab identity itself is not cloned into an opener-created tab');

});

test('same-tab history return preserves a plausible clock while cloned, restored and stale contexts do not',()=>{
  const source=block('game-ui'),guard=source.match(/const restoredRoundClockStart=(.*?);/)[1],loader=source.match(/const loadRoundClock=([\s\S]*?\n});/)[1];
  const now=1000000000000;
  function restore({navigation='back_forward',storedTab='this-tab',historyEntry=true,age=1234,playerId='messi'}={}){
    const saved={playerId,startedAt:now-age},removed=[];
    const context={Date:{now:()=>now},CLOCK_KEY:'clock',CLOCK_TAB_KEY:'tab',clockTabId:'this-tab',clockHistoryState:{derabonaClockPage:historyEntry},state:{},CareerGame:{playerAt:()=>({id:'messi'})},performance:{getEntriesByType:()=>[{type:navigation}]},sessionStorage:{getItem:key=>key==='tab'?storedTab:JSON.stringify(saved),removeItem:key=>removed.push(key)}};
    const value=vm.runInNewContext(`const restoredRoundClockStart=${guard};const loadRoundClock=${loader};loadRoundClock()`,context);
    return {value,removed};
  }
  assert.equal(restore().value,now-1234,'same-tab Back keeps the engaged scoring window');
  assert.equal(restore({storedTab:'other-tab'}).value,null,'cloned tab identity cannot claim the old clock');
  assert.equal(restore({navigation:'navigate'}).value,null,'browser-restored marked history is still rejected');
  assert.equal(restore({navigation:'reload'}).value,now-1234,'ordinary reload retains time');
  assert.equal(restore({age:6*60*60*1000+1}).value,null,'same-tab history does not bypass the six-hour ceiling');
  assert.equal(restore({playerId:'ronaldo'}).value,null,'history cannot attach another player’s clock');
});

test('page-cache restoration returns to readiness without resetting the engaged clock',()=>{
  const handler=block('game-ui').split('\n').find(line=>line.startsWith("window.addEventListener('pageshow'"));
  const routes=[];let listener;
  const context={window:{addEventListener:(_event,fn)=>{listener=fn;}},AuthRoute:{active:false},DailyUI:{requestedMode:()=> 'unlimited'},PlayOverview:{show:(...args)=>routes.push(args)},resetRoundClock(){throw Error('must preserve the clock');}};
  vm.runInNewContext(handler,context);listener({persisted:false});assert.equal(routes.length,0);listener({persisted:true});assert.deepEqual(routes,[['unlimited',false]]);
  context.AuthRoute.active=true;listener({persisted:true});assert.equal(routes.length,1,'auth-only route retains its independent restoration lifecycle');
});

test('Unlimited never trusts a stale clock, even if navigation-type detection is fooled',()=>{
  const source=block('game-ui');
  const expression=source.match(/const restoredRoundClockStart=(.*?);/)?.[1];
  assert.ok(expression,'restoredRoundClockStart helper exists in game-ui');
  const restoredRoundClockStart=vm.runInNewContext(`(${expression})`);
  const now=1_000_000_000_000;
  // A browser session-restore/crash-recovery path can report navigationType
  // 'navigate' with no restoredHistoryEntry/newBrowsingContext signal at all
  // (observed in production: a days-old clock survived opening a fresh tab).
  // A hard age ceiling must reject an implausibly old clock regardless of
  // what the navigation-type heuristics conclude.
  const freshSaved={playerId:'messi',startedAt:now-90_000};
  assert.equal(restoredRoundClockStart(freshSaved,'messi','navigate',false,false,now),now-90_000,'a genuinely fresh clock is still trusted');
  const staleSaved={playerId:'messi',startedAt:now-(3*24*60*60*1000)};
  assert.equal(restoredRoundClockStart(staleSaved,'messi','navigate',false,false,now),null,'a multi-day-old clock must never be trusted even on ordinary navigate');
  assert.equal(restoredRoundClockStart(staleSaved,'messi','reload',true,false,now),null,'a stale clock is rejected on reload too');
  const boundarySaved={playerId:'messi',startedAt:now-(6*60*60*1000)-1_000};
  assert.equal(restoredRoundClockStart(boundarySaved,'messi','navigate',false,false,now),null,'just past the age ceiling is rejected');
  const withinBoundarySaved={playerId:'messi',startedAt:now-(6*60*60*1000)+1_000};
  assert.equal(restoredRoundClockStart(withinBoundarySaved,'messi','navigate',false,false,now),withinBoundarySaved.startedAt,'just within the age ceiling is still trusted');
  assert.match(source,/now-saved\.startedAt<=6\*60\*60\*1000/,'restoredRoundClockStart enforces a hard age ceiling independent of navigation-type heuristics');
});

test('elapsed-time readout is bilingual, freezes, and keeps scoring details on activation',()=>{
  const source=block('game-ui');
  assert.match(html,/elapsedTimeLabel:'Time played'/);
  assert.match(html,/elapsedTimeLabel:'Tiempo de juego'/);
  assert.match(html,/elapsedTimeAria:value=>`Time played \${value}/);
  assert.match(html,/elapsedTimeAria:value=>`Tiempo de juego \${value}/);
  assert.doesNotMatch(html,/id="elapsed-time-note"[^>]*role="status"/,'details must not announce every 250 ms while open');
  assert.doesNotMatch(html,/No time limit|Sin límite de tiempo/);
  assert.match(source,/elapsed-time-value/);
  assert.match(source,/setAttribute\('aria-label',t\.elapsedTimeAria\(value\)\)/);
  assert.match(source,/classList\.toggle\('is-frozen',!clock\.playing\)/);
  assert.match(source,/elapsedTimeOpen/);
  assert.match(source,/elapsedTimeWon/,'resolved timing still explains awarded points');
});

test('the elapsed-time detail popover is inert while a round is still playing, not just unhelpful',()=>{
  // Reported directly: clicking mid-round only ever repeated the same
  // number already on the counter. Rather than show a "points if you
  // answered right now" figure (which would recreate the pressure the
  // neutral readout deliberately replaced, per DESIGN.md), the control is
  // made genuinely non-interactive until the round resolves, when the
  // popover has something the counter doesn't: hints used and points
  // actually earned.
  const source=block('game-ui');
  assert.doesNotMatch(html,/elapsedTimeDetail/,'the old "Ns elapsed" tooltip - a bare restatement of the counter - is gone');
  assert.match(html,/elapsedTimeAriaPlaying:value=>`Time played \${value}`/,'the accessible name drops the click affordance while playing');
  assert.match(html,/elapsedTimeAriaPlaying:value=>`Tiempo de juego \${value}`/);
  assert.match(source,/if\(clock\.playing\)\{\s*meter\.disabled=true;meter\.removeAttribute\('aria-expanded'\);meter\.setAttribute\('aria-label',t\.elapsedTimeAriaPlaying\(value\)\)/,'playing state disables the control and swaps its accessible name');
  assert.match(source,/\$\('elapsed-time'\)\.addEventListener\('click',\(\)=>\{if\(\$\('elapsed-time'\)\.disabled\)return;/,'a disabled control cannot be toggled open by a click');
  assert.match(source,/meter\.disabled=false;meter\.setAttribute\('aria-expanded'/,'the control re-enables once the round resolves');
});

test('every clock source, including ranked, refuses an implausibly old elapsed time',()=>{
  // The six-hour ceiling in restoredRoundClockStart only ever guarded the guest
  // sessionStorage clock. RankedUI.roundClock() derives elapsedMs straight from
  // the server's startedAt, and DailyRankedUI.clock() does the same, so an
  // abandoned round reopened a day later rendered e.g. "2251:40" as if the
  // player had sat there for 37 hours. Scoring stays server-authoritative and
  // is unaffected; this is purely the readout refusing to show nonsense.
  const source=block('game-ui');
  const expression=source.match(/const displayableElapsedMs=(.*?);/)?.[1];
  assert.ok(expression,'displayableElapsedMs helper exists in game-ui');
  const displayableElapsedMs=vm.runInNewContext(`(${expression})`);
  assert.equal(displayableElapsedMs(0),0);
  assert.equal(displayableElapsedMs(5_000),5_000);
  assert.equal(displayableElapsedMs(6*60*60*1000),6*60*60*1000,'exactly at the ceiling is still real');
  assert.equal(displayableElapsedMs(6*60*60*1000+1),null,'past the ceiling is not displayable');
  assert.equal(displayableElapsedMs(2251*60*1000),null,'the reported 2251-minute ranked clock');
  assert.equal(displayableElapsedMs(-5),0,'a clock skewed into the future never goes negative');
  assert.equal(displayableElapsedMs(NaN),null,'an unparseable server timestamp is not displayable');
});

test('the elapsed-time readout hides itself rather than showing a stale clock',()=>{
  const source=block('game-ui');
  const match=source.match(/const elapsedTimeFrame=([\s\S]*?\n});/);
  assert.ok(match,'elapsedTimeFrame helper is present');
  const guard=source.match(/const displayableElapsedMs=(.*?);/)?.[1];
  assert.ok(guard,'displayableElapsedMs helper is present');
  const elapsedTimeFrame=vm.runInNewContext(`const displayableElapsedMs=${guard};(${match[1]})`);
  const stale=elapsedTimeFrame({key:'ranked:abc',elapsedMs:2251*60*1000,playing:true,hints:0,points:null},{key:null,frozen:null});
  assert.equal(stale.shown,null,'a stale ranked clock yields nothing to show');
  const fresh=elapsedTimeFrame({key:'ranked:abc',elapsedMs:12_000,playing:true,hints:0,points:null},{key:null,frozen:null});
  assert.equal(fresh.shown.elapsedMs,12_000,'a plausible ranked clock still shows');
});
