import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const spanish = html.match(/<section id="about-game"[^>]*>([\s\S]*?)<\/section>/)[1];
const english = JSON.parse(html.match(/const ABOUT_EN = ("[^\n]*");/)[1]);

for (const [language, markup, heading, terms] of [
  ['Spanish', spanish, '¿Cómo funcionan los puntos?', [
    '100 puntos', 'tres respuestas incorrectas', '0 puntos',
    '100, 80, 60', '40 puntos', '2 segundos', '24 segundos', '25%',
    '20 puntos', 'redondea',
    'país', 'posición', 'años en cada club', 'servidor', 'recargar',
    'una sola vez', 'no se transfieren', 'competición',
  ]],
  ['English', english, 'How do points work?', [
    '100 points', 'three wrong guesses', '0 points',
    '100, 80, 60', '40 points', '2 seconds', '24 seconds', '25%',
    '20 points', 'rounded',
    'country', 'position', "club's years", 'server', 'refreshing',
    'only once', 'never transfer', 'competition',
  ]],
]) {
  test(`${language} has an expandable points FAQ with timing, hints and ranked boundaries`, () => {
    const faq = markup.match(/<details id="points-faq">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(faq, 'Points FAQ exists (Spanish must be in the initial HTML)');
    assert.ok(faq.startsWith(`<summary>${heading}</summary>`));
    for (const term of terms) assert.ok(faq.includes(term), `Missing explanation: ${term}`);
    assert.equal((markup.match(/id="points-faq"/g) || []).length, 1);
    assert.ok(markup.indexOf('id="points-faq"') > markup.indexOf('<ol>'), 'Scoring follows how-to-play');
  });
}

test('FAQ hint ceilings and worked example match the guest scoring model', () => {
  const context = vm.createContext({});
  for (const id of ['roster-data', 'game-model']) {
    vm.runInContext(html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1], context);
  }
  const examples = vm.runInContext(`JSON.stringify([0,1,2,3].map(hints => {
    const state = CareerGame.create();
    for (let i=0;i<hints;i++) CareerGame.hint(state);
    CareerGame.answer(state, CareerGame.playerAt(state).name, 2000);
    return CareerGame.roundAt(state).points;
  }))`, context);
  assert.deepEqual(JSON.parse(examples), [100, 80, 60, 40]);
  assert.equal(vm.runInContext(`(() => {
    const state = CareerGame.create();
    CareerGame.hint(state);
    CareerGame.answer(state, CareerGame.playerAt(state).name, 24000);
    return CareerGame.roundAt(state).points;
  })()`, context), 20);
});
