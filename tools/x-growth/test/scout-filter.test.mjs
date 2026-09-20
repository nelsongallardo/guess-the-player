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
  { name: 'too old',       text: '¿Se acuerdan de aquel equipazo del 2004? Qué carrera tuvo ese muchacho, pasó por media Europa.', age: 60 * 20, want: false },
  { name: 'off-topic',     text: 'Buen día a todos, hoy hace un calor insoportable en Buenos Aires y no se aguanta nada.', age: 120, want: false },
  { name: 'injury',        text: 'Confirmada la lesión grave, rotura de ligamentos, se pierde lo que queda de la temporada entera.', age: 120, want: false },
  { name: 'referee row',   text: 'El árbitro lo arruinó todo otra vez, el VAR es un escándalo y nadie dice nada al respecto.', age: 120, want: false },
];

let fail = 0;
for (const c of cases) {
  const r = classify({ text: c.text, created_at: ago(c.age) });
  const ok = r.ok === c.want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name.padEnd(14)} -> ok=${r.ok}${r.reason ? ` (${r.reason})` : ` tag=${r.tag}`}`);
}

// A post that trips both lists must be rejected: blocklist wins.
const both = classify({ text: 'Qué carrera tuvo, un ídolo, pero hoy estamos de luto porque murió.', created_at: ago(120) });
const bothOk = both.ok === false && both.reason.startsWith('blocklist');
console.log(`${bothOk ? 'PASS' : 'FAIL'} blocklist beats allowlist -> ${both.reason}`);
if (!bothOk) fail++;

assert.strictEqual(fail, 0, `${fail} filter case(s) failed`);
console.log('\nALL FILTER TESTS PASSED');
