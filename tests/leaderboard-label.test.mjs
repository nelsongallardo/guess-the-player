import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const game=read('index.html'),board=read('leaderboard.html');
const rankedCopy=vm.runInNewContext('('+game.match(/const RankedUI = \(\(\)=>\{\s*const TEXT=(\{[\s\S]*?\n  \});/)[1]+')');
const boardCopy=vm.runInNewContext('('+board.match(/const text=(\{[\s\S]*?\});\nconst COMPETITION_LOGOS/)[1]+')');

test('Spanish leaderboard navigation and page naming use Tabla without changing English or routes',()=>{
  assert.match(game,/<span id="leaderboard-open-label">Tabla<\/span>/);
  assert.equal(rankedCopy.es.board,'Tabla');
  assert.equal(rankedCopy.en.board,'Leaderboards');
  assert.equal(boardCopy.es.title,'Tabla');
  assert.equal(boardCopy.en.title,'Leaderboard');
  assert.match(game,/<a[^>]+id="leaderboard-open"[^>]+href="leaderboard\.html"/);
  assert.match(board,/<link rel="canonical" href="https:\/\/derabona.club\/leaderboard.html">/);
});

test('Spanish static metadata and accessible loading name the same Tabla destination',()=>{
  assert.match(board,/<title>Tabla — derabona<\/title>/);
  assert.match(board,/<meta property="og:title" content="Tabla — derabona">/);
  assert.match(board,/<meta name="description" content="La tabla de derabona:/);
  assert.match(board,/<meta property="og:description" content="La tabla de derabona:/);
  assert.match(board,/<h1>Tabla<\/h1>/);
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
