// Daily reminder templates (ADR 0030): copy, required EmailOctopus merge tags,
// the daily card fields and a single canonical CTA. Rendering in real mail
// clients is NOT verified here.
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const COPY={
  es:{h1:'¿Quién hizo esta carrera?',button:'Adiviná quién es →',note:'El desafío cambia a las 00:00 UTC'},
  en:{h1:'Whose career is this?',button:'Guess the player →',note:'The challenge changes at 00:00 UTC'},
};
const TAGS=['{{RewardsURL}}','{{SenderInfo}}','{{UnsubscribeURL}}','{{DailyCard}}','{{DailyNumber}}'];

test('both languages: copy, vendor footer tags, card fields and one canonical Daily link',()=>{
  for(const [lang,c] of Object.entries(COPY))for(const ext of ['html','txt']){
    const t=read(`emails/daily-reminder.${lang}.${ext}`);
    for(const text of Object.values(c))assert.ok(t.includes(text),`${lang}.${ext}: ${text}`);
    assert.ok(t.includes('{{UnsubscribeURL}}')&&t.includes('{{SenderInfo}}'),`${lang}.${ext} vendor footer`);
    for(const tag of new Set(t.match(/\{\{[^}]+\}\}/g)))assert.ok(TAGS.includes(tag),tag);
    if(ext==='html')assert.match(t,/<img src="\{\{DailyCard\}\}"[^>]+alt="[^"]+"/);
    const links=[...new Set(t.match(/https:\/\/derabona\.club[^\s"<]*/g))];
    assert.deepEqual(links,[`https://derabona.club/?lang=${lang}&utm_source=emailoctopus&utm_medium=email&utm_campaign=daily_reminder`]);
    assert.doesNotMatch(t,/<script|<form|<iframe/i);
    // Truthful for both cohorts: never claims the recipient confirmed or signed up through a form.
    assert.doesNotMatch(t.replace(/<!--[\s\S]*?-->|<[^>]+>/g,' '),/confirm|suscribiste|you signed up|you subscribed/i);
  }
});

test('templates are not deployed as public site assets',()=>{
  assert.doesNotMatch(read('.github/workflows/pages.yml'),/emails\//);
});
