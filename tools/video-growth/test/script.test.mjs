import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScript, validateScript } from '../lib/script.mjs';

const career = (name, clubs) => ({ playerId: 'x', name, clubs: clubs.map(n => ({ name: n })), evidenceSources: ['https://example.org'] });
const riquelme = career('Juan Román Riquelme', ['Boca Juniors', 'Barcelona', 'Villarreal', 'Boca Juniors', 'Argentinos Juniors']);

test('both platforms build valid source-only scripts', () => {
  for (const platform of ['youtube', 'tiktok']) {
    const s = buildScript(riquelme, platform);
    assert.deepEqual(validateScript(s, riquelme), [], platform);
    assert.equal(s.narration.answer, 'Era Juan Román Riquelme.');
    assert.match(s.narration.question, /¿Quién es\?/);
    assert.equal(s.narration.clubs, 'Arrancó en Boca Juniors. Pasó por Barcelona. Luego, Villarreal. Volvió a Boca Juniors. Y después, Argentinos Juniors.');
  }
});

test('repeat spells stay in order on screen', () => {
  const s = buildScript(riquelme, 'youtube');
  assert.deepEqual(s.clubs, ['Boca Juniors', 'Barcelona', 'Villarreal', 'Boca Juniors', 'Argentinos Juniors']);
  const deduped = { ...s, clubs: ['Boca Juniors', 'Barcelona', 'Villarreal', 'Argentinos Juniors'] };
  assert.ok(validateScript(deduped, riquelme).some(e => /clubs/.test(e)));
});

test('the name or a surname before the reveal is rejected, accents ignored', () => {
  const s = buildScript(riquelme, 'youtube');
  for (const leak of ['¿Sabés quién es Riquelme?', '¿Quién es? Pista: ROMAN', 'riquelme']) {
    assert.ok(validateScript({ ...s, title: leak }, riquelme).some(e => /answer/.test(e)), leak);
    assert.ok(validateScript({ ...s, narration: { ...s.narration, question: leak } }, riquelme).some(e => /answer/.test(e)), leak);
  }
  assert.ok(validateScript({ ...s, caption: 'Román en Villarreal #futbol' }, riquelme).some(e => /answer/.test(e)));
  assert.ok(validateScript({ ...s, onScreen: { ...s.onScreen, think: 'Era Riquelme' } }, riquelme).some(e => /answer/.test(e)));
});

test('the answer must be exactly the verified name', () => {
  const s = buildScript(riquelme, 'tiktok');
  assert.ok(validateScript({ ...s, narration: { ...s.narration, answer: 'Era Riquelme, el mejor.' } }, riquelme).length);
});

test('unsupported claims are rejected', () => {
  const s = buildScript(riquelme, 'youtube');
  for (const claim of ['Ganó 5 títulos', 'Fue campeón de América', 'Costó millones', 'Una leyenda del fútbol', 'Hizo 100 goles', 'Me acuerdo de su debut', 'Llegó a préstamo']) {
    assert.ok(validateScript({ ...s, narration: { ...s.narration, cta: claim } }, riquelme).some(e => /unsupported/.test(e)), claim);
  }
});

test('copy that presents an evergreen video as today\'s Daily is rejected', () => {
  const s = buildScript(riquelme, 'youtube');
  for (const today of ['El desafío de hoy', 'Jugá la Rabona Diaria', 'Today\'s puzzle', 'Carrera del día']) {
    assert.ok(validateScript({ ...s, caption: today }, riquelme).some(e => /Daily/.test(e)), today);
  }
});

test('copy may point only to derabona.club', () => {
  const s = buildScript(riquelme, 'tiktok');
  assert.match(s.caption, /derabona\.club/);
  for (const link of ['www.example.com', 'https://x.y', 'otro.club', 'mirá juegos.com']) {
    assert.ok(validateScript({ ...s, caption: `¿Quién es? ${link}` }, riquelme).some(e => /derabona\.club/.test(e)), link);
  }
  assert.ok(validateScript({ ...s, narration: { ...s.narration, clubs: 'Arrancó en Boca Juniors.' } }, riquelme).some(e => /clubs/.test(e)));
});

test('platform length limits are enforced', () => {
  const t = buildScript(riquelme, 'tiktok');
  assert.ok(t.caption.length <= 150);
  assert.ok(validateScript({ ...t, caption: '¿Quién es? '.padEnd(151, 'a') }, riquelme).some(e => /150/.test(e)));
  assert.ok(validateScript({ ...t, caption: '¿Quién es? #a #b #c #d #e #f' }, riquelme).some(e => /hashtag/.test(e)));
  const y = buildScript(riquelme, 'youtube');
  assert.ok(y.title.length <= 100);
  assert.ok(validateScript({ ...y, title: '¿Quién es? '.padEnd(101, 'a') }, riquelme).some(e => /100/.test(e)));
});

test('long names and accented clubs build valid scripts', () => {
  const c = career('Kevin De Bruyne', ['Genk', 'Chelsea', 'Werder Bremen', 'VfL Wolfsburg', 'Manchester City', 'Napoli']);
  assert.deepEqual(validateScript(buildScript(c, 'youtube'), c), []);
  const d = career('Martín Demichelis', ['River Plate', 'Bayern Munich', 'Málaga', 'Manchester City', 'Espanyol']);
  assert.deepEqual(validateScript(buildScript(d, 'tiktok'), d), []);
});
