import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function script(id){
  const source=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))?.[1];
  assert.ok(source,`${id} script exists`);
  return source;
}

const ui=script('game-ui');

test('signed-out online play explains guest score and ranked eligibility before the first answer',()=>{
  assert.match(html,/id="guest-ranked-status"[^>]*aria-labelledby="guest-ranked-title"/);
  assert.match(html,/id="guest-ranked-title"/);
  assert.match(html,/id="guest-ranked-detail"/);
  assert.match(html,/id="guest-ranked-signin"[^>]*type="button"/);
  assert.match(ui,/guestRankedTitle:'You’re playing as a guest'/);
  assert.match(ui,/guestRankedDetail:'Your guest score stays in this tab, cannot be transferred after sign-in, and does not appear on the leaderboard\./);
  assert.match(ui,/guestRankedTitle:'Jugás como invitado'/);
  assert.match(ui,/guestRankedDetail:'Tu puntaje de invitado queda en esta pestaña, no se puede transferir después de iniciar sesión y no aparece en la clasificación\./);
  assert.match(ui,/guestRankedSignIn:'Sign in to compete'/);
  assert.match(ui,/guestRankedSignIn:'Iniciar sesión para competir'/);
  assert.match(html,/id="guest-ranked-reminder-continue"[^>]*type="button"/);
  assert.match(ui,/guestRankedContinue:'Continue as guest'/);
  assert.match(ui,/guestRankedContinue:'Seguir como invitado'/);
});

test('desktop signed-out account control has a visible benefit-specific label',()=>{
  assert.match(html,/\.account-open:not\(\.account-open-signed\) \.account-open-text\{position:static/);
  assert.match(ui,/accountGuest:'Sign in to compete'/);
  assert.match(ui,/accountGuest:'Iniciar sesión para competir'/);
  assert.match(html,/@media\(max-width:580px\)\{[\s\S]*?\.account-open:not\(\.account-open-signed\) \.account-open-text/);
});

test('rules describe the current ten-option and 120-player game',()=>{
  assert.match(ui,/Pick one of ten players\./);
  assert.match(ui,/New games contain all 120 players/);
  assert.match(ui,/Elegí uno de los diez jugadores\./);
  assert.match(ui,/Las partidas nuevas incluyen los 120 jugadores/);
  assert.doesNotMatch(ui,/one of five players|uno de los cinco jugadores|all 70 players|los 70 jugadores/);
  assert.doesNotMatch(html,/id="answer-caption">Five names|<span class="footer-brand">90 PLAYERS/);
});

test('consent-clock edge paths and reminder announcement stay explicit',()=>{
  const analytics=script('analytics');
  assert.match(html,/id="guest-ranked-reminder"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(analytics,/if\(choice!==null\)window\.dispatchEvent\?\.\(new Event\('derabona:analytics-consent-resolved'\)\)/);
  assert.match(ui,/const startGuestClockFromInteraction=\(\)=>\{if\(!roundClockWaitingForConsent\)return;roundClockWaitingForConsent=false;saveRoundClock\(roundClockStart\);\}/);
  assert.match(ui,/startGuestClockFromInteraction\(\);\s*const before=CareerGame\.outcome/);
  assert.match(ui,/startGuestClockFromInteraction\(\);if\(CareerGame\.hint/);
});
