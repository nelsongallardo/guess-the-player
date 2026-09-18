// Source-text/copy/DOM-hook checks for the server-authoritative Daily
// Rabona client path (DailyRankedUI), following the same convention as
// tests/guest-ranked-disclosure.test.mjs: RankedUI-adjacent modules are
// tightly coupled to document/fetch/Accounts, so they're checked by
// asserting on the shipped source and markup rather than a vm sandbox.
// Real end-to-end coverage of the signed-in flow lives in the browser
// suite (tests/run-browser.py); the SQL/RPC contract is covered by
// tests/ranked-backend.test.mjs and tests/ranked-backend-edge.test.ts.
// See docs/adr/0021-daily-rabona-server-authoritative-for-accounts.md.
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function script(id){
  const source=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))?.[1];
  assert.ok(source,`${id} script exists`);
  return source;
}

const game=script('game-ui');
const dailyUi=script('daily-ui');

test('DailyRankedUI is defined once, before RankedUI, and is guest-invisible',()=>{
  assert.match(game,/const DailyRankedUI = \(\(\)=>\{/);
  const dailyIndex=game.indexOf('const DailyRankedUI = (()=>{');
  const rankedIndex=game.indexOf('const RankedUI = (()=>{');
  assert.ok(dailyIndex>=0&&rankedIndex>=0);
  assert.ok(dailyIndex<rankedIndex,'DailyRankedUI must be declared before RankedUI (some test harnesses slice from the RankedUI marker onward)');
  // Guests must never reach any DailyRankedUI code path.
  for(const fn of ['render','hint','next','clock','share'])
    assert.match(dailyUi,new RegExp(`if\\(Accounts\\.session\\)return DailyRankedUI\\.${fn}\\(`));
});

test('DailyRankedUI addresses rounds by (date,roundIndex), not a synthetic round id, and never mints its own idempotency-free mutation',()=>{
  assert.match(game,/mutate\('dailyHint'\)/);
  assert.match(game,/mutate\('dailyAnswer',\{optionId:option\.id\}\)/);
  assert.match(game,/roundIndex:round\.roundIndex,expectedVersion:round\.version/);
  assert.doesNotMatch(game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI')),/roundId/);
});

test('DailyRankedUI never leaks or checks the correct option client-side; correctness reads the known player name, like RankedUI',()=>{
  const daily=game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI'));
  assert.doesNotMatch(daily,/correct_option|correctOption\b/);
  assert.match(daily,/correct=result!=='playing'&&option\.label===p\.name/);
  assert.doesNotMatch(daily,/\.innerHTML\s*=/);
});

test('sync() only resets the displayed round on a fresh load, not on every hint/answer response',()=>{
  const daily=game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI'));
  assert.match(daily,/function accept\(data,resetIndex=false\)/);
  assert.match(daily,/accept\(data,true\)/);
  assert.match(daily,/accept\(data\);pending=null;/);
});

test('identity resets are wired into both freshGuest and authChanged, and a mid-Daily sign-in triggers DailyRankedUI.sync, not RankedUI.sync',()=>{
  assert.match(game,/DailyRankedUI\.resetIdentity\(\)/);
  assert.match(game,/function freshGuest\(\)\{[^}]*DailyRankedUI\.resetIdentity\(\)/);
  assert.match(game,/DailyUI\.isDaily\(\)\)DailyRankedUI\.sync\(\);else sync\(\)/);
  assert.match(game,/if\(!DailyUI\.isDaily\(\)\)await sync\(\);else\{update\(\);DailyRankedUI\.sync\(\);\}/);
});

test('a signed-in-with-local-progress notice exists, is dismissible, and never deletes the local guest attempt',()=>{
  assert.match(html,/id="daily-guest-progress-notice"[^>]*hidden/);
  assert.match(html,/id="daily-guest-progress-text"/);
  assert.match(html,/id="daily-guest-progress-dismiss"[^>]*type="button"/);
  assert.match(dailyUi,/document\.getElementById\('daily-guest-progress-dismiss'\)\.onclick=\(\)=>DailyRankedUI\.dismissNotice\(\)/);
  const daily=game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI'));
  assert.match(daily,/localTodayHasProgress/);
  assert.doesNotMatch(daily,/localStorage\.removeItem|createPersistence\([^)]*\)\.\w+\([^)]*\)\.(?:guess|hint|next|start)\(/,'must only ever read the local guest document, never mutate it');
});

test('bilingual copy: server-verified points phrasing, sync error and guest-progress notice all exist for both languages',()=>{
  for(const key of ['pointsRanked','syncError','guestProgressTitle','guestProgressDetail','guestProgressDismiss'])
    assert.match(dailyUi,new RegExp(`${key}:`));
  assert.match(dailyUi,/pointsRanked:n=>`\$\{n\} points · verified by server`/);
  assert.match(dailyUi,/pointsRanked:n=>`\$\{n\} puntos · verificados por el servidor`/);
  // The old "local, non-ranked" points phrasing must stay reserved for the
  // guest-only path and never leak into the signed-in feedback panel.
  const daily=game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI'));
  assert.doesNotMatch(daily,/dailyText\.points\(/);
  assert.match(daily,/dailyText\.pointsRanked\(/);
});

test('the Next button label is translated for both the guest and signed-in Daily render paths (a real pre-existing gap this work also closes)',()=>{
  assert.match(dailyUi,/document\.getElementById\('next-label'\)\.textContent=x\.next;/);
  const daily=game.slice(game.indexOf('const DailyRankedUI'),game.indexOf('const RankedUI'));
  assert.match(daily,/document\.getElementById\('next-label'\)\.textContent=y\.next;/);
});

test('DailyUI.updateControls prefers server completion state once signed in, never stale local state',()=>{
  assert.match(dailyUi,/const done=Accounts\.session\?DailyRankedUI\.finished\(\):!!attempt\(\)\?\.completion/);
});
