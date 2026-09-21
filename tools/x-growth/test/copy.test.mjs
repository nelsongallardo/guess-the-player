// Copy tests: terminology (jugadores, not carreras) and the AI-tell filter.
import assert from 'node:assert';
import { composeText, wantsLink } from '../post-daily.mjs';
import { composeReveal, colourLine } from '../post-reveal.mjs';
import { aiTell } from '../lib/draft.mjs';
import { dailyFor, EPOCH_DAY } from '../lib/daily.mjs';
import { playerById } from '../lib/roster.mjs';

let fail = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { fail++; console.log(`FAIL ${name} ${extra}`); }
  else console.log(`PASS ${name}`);
};

console.log('=== terminology: you guess JUGADORES, the carrera is the clue ===');

// The game's own string, from index.html: "Los mismos tres jugadores para todos hoy"
for (let i = 0; i < 20; i++) {
  const date = new Date((EPOCH_DAY + i) * 86400000).toISOString().slice(0, 10);
  const daily = dailyFor(date);
  const puzzle = composeText(daily, wantsLink(date));
  const reveal = composeReveal(daily);

  // "N carreras" counts the clue as if it were the answer.
  assert.ok(!/\b(tres|3|dos|2)\s+carreras\b/i.test(puzzle),
    `#${daily.challengeNumber} puzzle counts carreras: ${puzzle}`);
  assert.ok(!/\b(tres|3|dos|2)\s+carreras\b/i.test(reveal),
    `#${daily.challengeNumber} reveal counts carreras: ${reveal}`);
  // "tres nuevas" agrees with carreras, so it carries the same error.
  assert.ok(!/\btres nuevas\b/i.test(reveal),
    `#${daily.challengeNumber} reveal says "tres nuevas": ${reveal}`);

  // The card shows ONE career, so the reveal must name exactly one player.
  // Naming all three spoils two players the post gave no clue for.
  const shown = daily.rounds[0].player.name;
  assert.ok(reveal.includes(shown),
    `#${daily.challengeNumber} reveal omits the shown player ${shown}: ${reveal}`);
  for (const other of daily.rounds.slice(1)) {
    assert.ok(!reveal.includes(other.player.name),
      `#${daily.challengeNumber} reveal leaks unshown player ${other.player.name}: ${reveal}`);
  }
  // A numbered list implies the single grid had three answers.
  assert.ok(!/^\s*[12]\.\s/m.test(reveal),
    `#${daily.challengeNumber} reveal still lists answers: ${reveal}`);
}
check('no post counts the puzzle in "carreras"', true);
check('no reveal says "tres nuevas"', true);
check('reveal names only the player whose career was shown', true);

const d = dailyFor('2026-09-19');   // Messi, short career, exercises the text path
const p = composeText(d, false);
check('puzzle uses "jugadores"', /jugadores/i.test(p), p);
check('puzzle matches the game wording', /Los mismos tres jugadores para todos hoy/.test(p), p);

console.log('\n=== humanizer: no AI tells in our own copy ===');
for (let i = 0; i < 20; i++) {
  const date = new Date((EPOCH_DAY + i) * 86400000).toISOString().slice(0, 10);
  const daily = dailyFor(date);
  for (const [kind, text] of [['puzzle', composeText(daily, wantsLink(date))], ['reveal', composeReveal(daily)]]) {
    assert.ok(!/[—–]/.test(text), `${kind} #${daily.challengeNumber} has a dash: ${text}`);
    assert.ok(!/\bno es .* sino\b/i.test(text), `${kind} #${daily.challengeNumber} not-X-but-Y`);
  }
}
check('no dashes in any post', true);
check('no not-X-but-Y in any post', true);

// The colour line must state a fact, not reach for a metaphor.
const milito = playerById('diego-milito');
const c = colourLine(milito);
check('colour line explains the repeat concretely', /^Volvió a .+, por eso aparece dos veces\.$/.test(c), c);
check('colour line has no metaphor', !/mapa y valija|no es un error/.test(c), c);

console.log('\n=== aiTell filter rejects bot-sounding replies ===');
const bad = [
  ['No es solo un golazo, sino una obra de arte.', 'not-X-but-Y'],
  ['Tremenda carrera — pasó por media Europa.', 'dash'],
  ['¿Cuántos se acuerdan que pasó por Zaragoza antes del Inter?', 'opening-punctuation'],
  ['La realidad es que nadie se acuerda de esa etapa.', 'deep-sounding'],
  ['Mirá, ese equipo era otra cosa.', 'staged opener'],
  ['Che, posta', 'staged opener'],
  ['Che, posta, ese equipo era otra cosa.', 'staged opener'],
  ['Jugó en seis clubes. Así de simple.', 'closer'],
  ['Qué carrera tremenda!!', 'punctuation spam'],
  ['Hola! Buen dato sobre Riquelme.', 'greeting'],
];
for (const [text, want] of bad) {
  const got = aiTell(text);
  check(`rejects ${want}`, got === want, `got ${got} for "${text}"`);
}

const good = [
  'Ese año en Genoa lo tenía jugando de enganche, no de nueve.',
  'cuántos se acuerdan que pasó por Zaragoza antes del Inter?',
  'che y a esta altura vuelve para jugar en serio o más para el cariño de la gente?',
  'Dos etapas en Racing y la gente igual se acuerda más de la segunda.',
];
for (const text of good) {
  check(`accepts a real reply`, aiTell(text) === null, `rejected "${text}" as ${aiTell(text)}`);
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL COPY TESTS PASSED'}`);
process.exit(fail ? 1 : 0);
