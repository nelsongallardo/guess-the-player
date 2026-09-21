// Scout filter tests. The blocklist must reject before any model call.
import assert from 'node:assert';
import { classify } from '../scout.mjs';

const ago = min => new Date(Date.now() - min * 60000).toISOString();

const cases = [
  { name: 'obituary',      text: 'Una tristeza enorme. Murió un grande del fútbol argentino, se nos fue un ídolo de verdad.', age: 120, want: false },
  { name: 'qepd variant',  text: 'Q.E.P.D. leyenda. Hoy el fútbol está de luto por una noticia terrible que nadie esperaba.', age: 120, want: false },
  { name: 'nostalgia',     text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', age: 120, want: true },
  { name: 'politics',      text: 'La política se metió otra vez en el fútbol argentino y el gobierno ahora opina de las elecciones.', age: 120, want: false },
  { name: 'transfer',      text: 'Confirmado el fichaje del año: vuelve al club donde debutó tras una carrera enorme en Europa.', age: 120, want: true },
  { name: 'too short',     text: 'Qué golazo', age: 120, want: false },
  { name: 'too fresh',     text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', age: 5, want: false },
  // Age boundary sits at 96h now (was 12h): the round-robin only revisits an
  // account every ~82h, so a 12h window rejected 68% of everything scanned.
  { name: 'still in window', text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', age: 60 * 20, want: true },
  { name: 'too old',       text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', age: 60 * 120, want: false },
  // No longer gated on the ALLOW keywords: ordinary football talk reaches the
  // model, which answers SKIP if it has nothing worth saying. Safety stays in code.
  { name: 'general talk',  text: 'Buen día a todos, hoy hace un calor insoportable en Buenos Aires y no se aguanta nada.', age: 120, want: true },
  { name: 'injury',        text: 'Confirmada la lesión grave, rotura de ligamentos, se pierde lo que queda de la temporada entera.', age: 120, want: false },
  { name: 'referee row',   text: 'El árbitro lo arruinó todo otra vez, el VAR es un escándalo y nadie dice nada al respecto.', age: 120, want: false },
];

let fail = 0;
for (const c of cases) {
  const r = classify({ text: c.text, created_at: ago(c.age) });
  const ok = r.ok === c.want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name.padEnd(16)} -> ok=${r.ok}${r.reason ? ` (${r.reason})` : ` tag=${r.tag} topic=${r.topic}`}`);
}

// A post that trips both lists must be rejected: blocklist wins.
const both = classify({ text: 'Qué carrera tuvo, un ídolo, pero hoy estamos de luto porque murió.', created_at: ago(120) });
const bothOk = both.ok === false && both.reason.startsWith('blocklist');
console.log(`${bothOk ? 'PASS' : 'FAIL'} blocklist beats allowlist -> ${both.reason}`);
if (!bothOk) fail++;

// Dropping the ALLOW gate must not weaken the blocklist: an unmatched-keyword
// post that is ALSO unsafe still has to be rejected in code, never forwarded
// to the model on the assumption it will decline.
const unsafeGeneral = classify({ text: 'Tremendo escándalo en el vestuario, hubo una agresión y terminó todo muy mal ayer.', created_at: ago(120) });
const unsafeOk = unsafeGeneral.ok === false && unsafeGeneral.reason.startsWith('blocklist');
console.log(`${unsafeOk ? 'PASS' : 'FAIL'} blocklist still beats un-tagged post -> ${unsafeGeneral.reason}`);
if (!unsafeOk) fail++;

// Keyword posts keep their descriptive topic; un-tagged ones read 'general'.
// ALLOW.find returns the FIRST match in array order, so this text (which
// contains both 'se acuerdan' and 'carrera') reports 'carrera' — assert the
// real contract (a keyword from the list) rather than a specific one.
const tagged = classify({ text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', created_at: ago(120) });
const untagged = classify({ text: 'Buen día a todos, hoy hace un calor insoportable en Buenos Aires y no se aguanta nada.', created_at: ago(120) });
const topicOk = tagged.topic !== 'general' && tagged.tag === 'nostalgia'
  && untagged.topic === 'general' && untagged.tag === 'general';
console.log(`${topicOk ? 'PASS' : 'FAIL'} topic labelling -> tagged=${tagged.topic}/${tagged.tag} untagged=${untagged.topic}/${untagged.tag}`);
if (!topicOk) fail++;

assert.strictEqual(fail, 0, `${fail} filter case(s) failed`);
console.log('\nALL FILTER TESTS PASSED');
