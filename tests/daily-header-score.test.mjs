import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const game=html.match(/<script id="game-ui">([\s\S]*?)<\/script>/)?.[1];
const migration=readFileSync(new URL('supabase/migrations/202609290001_combined_account_score.sql',root),'utf8');

test('ranked progress totals include both immutable career and Daily results',()=>{
  const projection=migration.slice(migration.indexOf('create or replace function ranked_private.projection('),migration.indexOf('create or replace function ranked_private.daily_projection('));
  assert.match(projection,/'totalPoints'[^\n]*ranked_private\.daily_results/);
});

test('Daily projection supplies an authoritative combined total for each Daily response',()=>{
  const projection=migration.slice(migration.indexOf('create or replace function ranked_private.daily_projection('));
  assert.match(projection,/'totalPoints'[^\n]*ranked_private\.results[^\n]*ranked_private\.daily_results/);
});

test('Daily responses update the shared account score while older career reads cannot roll it back',()=>{
  const daily=game.slice(game.indexOf('const DailyRankedUI ='),game.indexOf('const RankedUI ='));
  const ranked=game.slice(game.indexOf('const RankedUI ='));
  assert.match(daily,/RankedUI\.acceptDailyScore\(data\.totalPoints/);
  assert.match(ranked,/acceptDailyScore/);
  assert.match(ranked,/scoreRevision/);
});
