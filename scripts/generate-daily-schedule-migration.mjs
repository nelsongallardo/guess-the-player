#!/usr/bin/env node
// One-time authoring aid: extracts the already-frozen, already-shipped
// DAILY_SCHEDULE_V1 array straight out of index.html's daily-challenge
// script block and emits the jsonb_to_recordset SQL literal for the
// ranked_private.daily_schedule seed migration. Deliberately does not
// regenerate/recompute anything (no seeded PRNG, no distractor logic run
// here) - it only re-serializes data that is already committed and tested,
// so the server-side schedule is byte-identical to every existing guest
// client by construction. Not part of the runtime or test suite.
//
// Usage: node scripts/generate-daily-schedule-migration.mjs
// Prints the SQL insert statement (one line) to stdout.

import {readFileSync} from 'node:fs';

const indexUrl=new URL('../index.html',import.meta.url);
const html=readFileSync(indexUrl,'utf8');
const block=id=>html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1];
const source=block('daily-challenge');
if(!source)throw new Error('Missing daily-challenge script block');

const marker='const DAILY_SCHEDULE_V1=dailyDeepFreeze(';
const start=source.indexOf(marker);
if(start===-1)throw new Error('Missing DAILY_SCHEDULE_V1 declaration');
const arrayStart=start+marker.length;
if(source[arrayStart]!=='[')throw new Error('Expected DAILY_SCHEDULE_V1 to open with [');
let depth=0,end=-1;
for(let i=arrayStart;i<source.length;i++){
  if(source[i]==='[')depth++;
  else if(source[i]===']'){depth--;if(depth===0){end=i+1;break;}}
}
if(end===-1)throw new Error('Could not find end of DAILY_SCHEDULE_V1 array literal');
const descriptors=JSON.parse(source.slice(arrayStart,end));
if(descriptors.length!==220)throw new Error(`Expected 220 descriptors, found ${descriptors.length}`);

const rows=descriptors.map((descriptor,slotIndex)=>{
  if(!Array.isArray(descriptor.optionIds)||descriptor.optionIds.length!==10)throw new Error(`Slot ${slotIndex}: expected 10 optionIds`);
  if(!descriptor.optionIds.includes(descriptor.playerId))throw new Error(`Slot ${slotIndex}: correct player missing from its own option list`);
  return {slot_index:slotIndex,player_id:descriptor.playerId,option_candidate_ids:descriptor.optionIds};
});

const literal=JSON.stringify(rows);
const sql=`insert into ranked_private.daily_schedule select * from jsonb_to_recordset('${literal}'::jsonb) as x(slot_index integer, player_id text, option_candidate_ids text[]) on conflict (slot_index) do update set player_id=excluded.player_id, option_candidate_ids=excluded.option_candidate_ids;`;
process.stdout.write(sql+'\n');
