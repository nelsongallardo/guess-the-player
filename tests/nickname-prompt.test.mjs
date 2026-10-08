// Source-text/copy/DOM-hook checks for the mandatory one-time nickname
// prompt (ADR 0024), following the same convention as
// tests/daily-ranked-ui.test.mjs and tests/guest-ranked-disclosure.test.mjs:
// this module is tightly coupled to document/fetch/Accounts, so it's
// checked by asserting on the shipped source and markup rather than a vm
// sandbox. The server-side flag/backfill contract is covered by
// tests/ranked-backend.test.mjs.
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
const nicknamePrompt=game.slice(game.indexOf('const NicknamePrompt'),game.indexOf('const DailyRankedUI'));

test('the dialog markup exists, is unnamed by any close/X control, and is wired into both accept() paths',()=>{
  for(const id of ['nickname-prompt-dialog','nickname-prompt-title','nickname-prompt-detail','nickname-prompt-form','nickname-prompt-input','nickname-prompt-shuffle','nickname-prompt-status','nickname-prompt-submit'])
    assert.match(html,new RegExp(`id="${id}"`));
  // No form method="dialog" auto-close button and no explicit close/cancel
  // button anywhere inside this dialog - the only way out is a successful
  // submit.
  const dialogMarkup=html.match(/<dialog id="nickname-prompt-dialog"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialogMarkup);
  assert.doesNotMatch(dialogMarkup,/method="dialog"/);
  assert.doesNotMatch(dialogMarkup,/class="[^"]*close/i);
  // Both RankedUI's and DailyRankedUI's own accept() - the one place either
  // module ever ingests a fresh server response - call this, so the prompt
  // is checked after every ranked action AND every daily action, whichever
  // mode happens to be active when the account first becomes signed in.
  assert.match(game,/function accept\(data,resetIndex=false,scoreRevision\)\{[^}]*NicknamePrompt\.maybeOpen\(data\.profile\)/);
  assert.match(game,/function accept\(data,revision\)[^\n]*NicknamePrompt\.maybeOpen\(data\.profile\)/);
});

test('the dialog blocks Escape/backdrop dismissal and never opens twice',()=>{
  assert.match(nicknamePrompt,/addEventListener\('cancel',event=>event\.preventDefault\(\)\)/);
  assert.match(nicknamePrompt,/if\(!profile\|\|profile\.nicknamePrompted\|\|isOpen\)return;/);
  assert.match(nicknamePrompt,/isOpen=true/);
  assert.match(nicknamePrompt,/isOpen=false/);
});

test('the suggested nickname is the same animal-alias shape the server assigns, generated client-side with no round trip',()=>{
  assert.match(nicknamePrompt,/const ANIMALS=\['Otter','Badger','Panda','Koala','Heron','Robin','Finch','Lynx','Seal','Dolphin','Turtle','Falcon','Penguin','Gecko','Wombat','Alpaca'\]/);
  assert.match(nicknamePrompt,/crypto\.randomUUID\(\)\.replace\(\/-\/g,''\)\.slice\(0,8\)/);
  assert.match(nicknamePrompt,/document\.getElementById\('nickname-prompt-shuffle'\)\.addEventListener\('click'/);
  // Confirm the suggestion format actually matches the server trigger's own
  // pattern (ranked_private.animal_alias_candidate()) and the client's
  // existing DEFAULT_ALIAS_PATTERN, so a kept suggestion is indistinguishable
  // from a server-assigned one.
  assert.match(game,/DEFAULT_ALIAS_PATTERN=\/\^\[A-Za-z\]\+-\[0-9a-f\]\{8\}\$\//);
});

test('submitting reuses the existing enroll action directly (not RankedUI.mutate, which is gated to ranked mode) and returns to the read-only overview afterward',()=>{
  assert.match(nicknamePrompt,/action:'enroll',nickname,idempotencyKey:crypto\.randomUUID\(\)/);
  assert.match(nicknamePrompt,/Accounts\.request\(\{action:'enroll'/);
  assert.doesNotMatch(nicknamePrompt,/RankedUI\.mutate/);
  assert.match(nicknamePrompt,/else PlayOverview\.enrolled\(\);/);
  assert.doesNotMatch(nicknamePrompt,/DailyRankedUI\.sync\(\)|RankedUI\.sync\(\)/);
});

test('client-side validation and server error codes are both surfaced inline, never silently dropped',()=>{
  assert.match(nicknamePrompt,/nickname\.length<3\|\|nickname\.length>24\|\|!\/\^\[\\p\{L\}\\p\{N\}\ _\.-\]\+\$\/u\.test\(nickname\)/);
  assert.match(nicknamePrompt,/error\?\.code==='NICKNAME_TAKEN'\?t\(\)\.taken:error\?\.code==='INVALID_NICKNAME'\?t\(\)\.invalid:t\(\)\.taken/);
  assert.doesNotMatch(nicknamePrompt,/\.innerHTML\s*=/);
});

test('bilingual copy exists for both languages and translate() is wired into applyLanguage()',()=>{
  for(const key of ['title','detail','shuffle','continueLabel','taken','invalid']){
    assert.match(nicknamePrompt,new RegExp(`en:\\{[^}]*${key}:`));
    assert.match(nicknamePrompt,new RegExp(`es:\\{[^}]*${key}:`));
  }
  assert.match(game,/DailyUI\.translate\(\);NicknamePrompt\.translate\(\);/);
});
