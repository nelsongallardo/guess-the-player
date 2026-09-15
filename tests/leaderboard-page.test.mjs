import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Leaderboard ships as a real independent static page with canonical metadata',()=>{
  const html=read('leaderboard.html');
  assert.match(html,/<html[^>]+lang="es"/);
  assert.match(html,/<link[^>]+rel="canonical"[^>]+href="https:\/\/derabona.club\/leaderboard.html"/);
  assert.match(html,/<h1\b/);
  assert.match(html,/<main\b/);
  // A single contextual nav action (not a two-tab pair with an active-page
  // indicator): each page only links to the *other* page, so there is
  // deliberately no aria-current here any more - see DESIGN.md. The
  // standalone top "Jugar"/"Play" nav button was later removed entirely -
  // the "Your place on the board" panel's own CTA (login when signed out,
  // play when signed in) is the one contextual nav action back to the game.
  assert.match(html,/<a class="cta" id="account-link" href="index\.html\?account=1">/);
  assert.doesNotMatch(html,/<iframe\b|http-equiv="refresh"/i);
  // The full 100-player roster/crest-data/game-model blocks (over 1MB) stay
  // out - that's the actual "heavy game artifact" this guards against.
  // ADR 0014 added the six competition crests and a duplicate account
  // dialog (~80KB combined) for full component parity with the main game's
  // own picker/account UI - a real, bounded, deliberate size increase, not
  // this guardrail being defeated.
  assert.doesNotMatch(html,/id="(?:roster-data|crest-data|game-model)"/);
  assert.ok(Buffer.byteLength(html)<130_000,'Standalone board must not duplicate the heavy game artifact');
  assert.match(html,/<dialog id="account-dialog"/,'ADR 0014: same account-dialog component as the main game, not a link away from it');
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()&&!m[0].includes('application/ld+json'));
  assert.ok(scripts.length>0);
  for(const script of scripts)new vm.Script(script[1]);
});

test('Read-only leaderboard shares public backend and auth storage configuration with game',()=>{
  const game=read('index.html'),board=read('leaderboard.html');
  const config=game.match(/Object\.freeze\(\{url:'([^']*)',anonKey:'([^']*)'\}\)/);
  assert.ok(config,'Game public account configuration available');
  for(const value of [config[1],config[2],'derabona.auth.v1','2.57.4'])assert.ok(board.includes(value),'Board and game configuration must agree');
});

test('Deployment packages the leaderboard and main game no longer has a ranking dialog',()=>{
  assert.match(read('.github/workflows/pages.yml'),/cp[^\n]*leaderboard\.html[^\n]*_site\//);
  const html=read('index.html');
  assert.doesNotMatch(html,/<dialog[^>]+id="leaderboard-dialog"/);
  assert.match(html,/<a\b[^>]*href="[^"]*leaderboard\.html[^\"]*"/);
});
