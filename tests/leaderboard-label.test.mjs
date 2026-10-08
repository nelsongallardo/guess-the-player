import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const game=read('index.html'),board=read('leaderboard.html');
const rankedCopy=vm.runInNewContext('('+game.match(/const RankedUI = \(\(\)=>\{\s*const TEXT=(\{[\s\S]*?\n  \});/)[1]+')');
const boardCopy=vm.runInNewContext('('+board.match(/const text=(\{[\s\S]*?\});\nconst COMPETITION_LOGOS/)[1]+')');

test('Both pages expose the same three labeled navigation destinations',()=>{
  for(const html of [game,board]){
    const nav=html.match(/<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    assert.match(nav,/<a id="nav-play"[^>]*>Jugar<\/a>/);
    assert.match(nav,/<a id="nav-groups"[^>]*>Grupos<\/a>/);
    assert.match(nav,/<a id="nav-board"[^>]*>Clasificación<\/a>/);
  }
  assert.equal(boardCopy.es.title,'Clasificación pública');
  assert.equal(boardCopy.en.title,'Public leaderboard');
  assert.match(board,/<link rel="canonical" href="https:\/\/derabona.club\/leaderboard.html">/);
});

test('Public leaderboard metadata states its scope while loading remains translated',()=>{
  assert.match(board,/<title>Clasificación pública — derabona<\/title>/);
  assert.match(board,/<meta property="og:title" content="Clasificación pública — derabona">/);
  assert.match(board,/<meta name="description" content="La clasificación pública de derabona:/);
  assert.match(board,/<meta property="og:description" content="La clasificación pública de derabona:/);
  assert.match(board,/<h1>Clasificación pública<\/h1>/);
  assert.match(board,/<p id="leaderboard-status"[^>]+role="status">Cargando tabla…<\/p>/);
  assert.match(board,/<span id="board-loading-label">Cargando tabla…<\/span>/);
  assert.match(board,/<noscript><p>La tabla necesita JavaScript y conexión\./);
  assert.equal(boardCopy.es.loading,'Cargando tabla…');
  assert.equal(boardCopy.en.loading,'Loading leaderboard…');
  assert.equal(rankedCopy.es.boardLoading,'Cargando tabla…');
});

test('Direct Spanish destination references use tabla, not unrelated ranked-play terminology',()=>{
  assert.equal(boardCopy.es.guest,'Los puntos de invitado no pasan a la tabla.');
  assert.equal(boardCopy.es.error,'No pudimos cargar la tabla. Tus resultados guardados no cambian.');
  assert.equal(boardCopy.es.offline,'La tabla necesita conexión. Podés seguir jugando como invitado sin conexión.');
  assert.equal(boardCopy.es.disabled,'La tabla todavía no está configurada.');
  assert.match(rankedCopy.es.guestRankedDetail,/no aparece en la tabla\./);
  assert.match(rankedCopy.es.loginWarn,/ni a la tabla\./);
  assert.equal(rankedCopy.es.boardError,'Tabla no disponible. Reintentá con conexión.');
  // These refer to ranked gameplay, not the leaderboard destination.
  assert.equal(rankedCopy.es.practiceAction,'Práctica sin clasificación');
  assert.equal(rankedCopy.es.returnRanked,'Volver a clasificación');
  assert.equal(rankedCopy.es.guest,'INVITADO · SIN CLASIFICACIÓN');
});
