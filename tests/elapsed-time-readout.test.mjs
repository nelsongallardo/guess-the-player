import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1]??'';

test('round header uses a neutral elapsed-time readout instead of a draining bar',()=>{
  assert.match(html,/id="elapsed-time"[^>]*class="elapsed-time"[^>]*hidden/);
  assert.match(html,/id="elapsed-time-label">Time played</);
  assert.match(html,/id="elapsed-time-value"[^>]*>0:00</);
  assert.match(html,/\.elapsed-time\{[^}]*min-height:44px/);
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
  const elapsedTimeFrame=vm.runInNewContext(`(${match[1]})`);
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

test('Unlimited does not start its session clock while Daily is selected',()=>{
  const source=block('game-ui');
  assert.match(source,/roundClockWaitingForMode=roundClockStart===null&&DailyUI\.requestedMode\(\)==='daily'/);
  assert.match(source,/function startGuestClockForMode\(\)/);
  assert.match(source,/resetRoundClock=\(\)=>\{roundClockWaitingForMode=DailyUI\.requestedMode\(\)==='daily'/,'a guest reset while Daily is active must remain deferred');
  assert.match(source,/if\(roundClockWaitingForMode\)try\{sessionStorage\.removeItem\(CLOCK_KEY\)/);
});

test('Unlimited preserves the same tab but resets a new or restored browsing context',()=>{
  const source=block('game-ui');
  const expression=source.match(/const restoredRoundClockStart=(.*?);/)?.[1];
  assert.ok(expression,'restoredRoundClockStart helper exists in game-ui');
  const restoredRoundClockStart=vm.runInNewContext(`(${expression})`);
  const saved={playerId:'messi',startedAt:1_234};
  assert.equal(restoredRoundClockStart(saved,'messi','reload',true,false),1_234);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',false,false),1_234);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',true,false),null);
  assert.equal(restoredRoundClockStart(saved,'messi','navigate',false,true),null);
  assert.equal(restoredRoundClockStart(saved,'messi','back_forward',true,false),null);
  assert.equal(restoredRoundClockStart(saved,'ronaldo','reload',true,false),null);
  assert.match(source,/const CLOCK_TAB_KEY='touchline\.clock-tab\.v1'/,'Unlimited stores a browsing-context identity separately from its clock');
  assert.match(source,/storedClockTab!==null&&storedClockTab!==clockTabId/,'same-tab identity survives full navigations without trusting cloned sessionStorage');
  assert.match(source,/window\.name=clockTabId/,'the per-tab identity itself is not cloned into an opener-created tab');
  assert.match(source,/addEventListener\('pageshow',event=>\{if\(event\.persisted\)resetRoundClock\(\);\}\)/,'a page-cache restore must start a fresh Unlimited clock');
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
  assert.match(source,/setAttribute\('aria-label',copy\(\)\.elapsedTimeAria\(value\)\)/);
  assert.match(source,/classList\.toggle\('is-frozen',!clock\.playing\)/);
  assert.match(source,/elapsedTimeOpen/);
  assert.match(source,/elapsedTimeWon/,'resolved timing still explains awarded points');
});
