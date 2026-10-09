// Daily reminder templates (ADR 0030): exact owner-approved copy, required
// EmailOctopus merge tags, a single allowlisted CTA and no personal data.
// Rendering in real mail clients is NOT verified here.
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const COPY={
  es:{subject:'Tu desafío diario de derabona',body:'¿Cuántos jugadores sacás hoy? Entrá a derabona y jugá el desafío diario.',button:'Jugar el desafío',note:'El desafío se renueva a las 00:00 UTC. El enlace abre el desafío disponible cuando lo visites.'},
  en:{subject:'Your daily Derabona challenge',body:'How many players can you get today? Open Derabona and play the daily challenge.',button:'Play the daily challenge',note:'The challenge changes at 00:00 UTC. The link opens the challenge available when you visit.'},
};

test('both languages carry the exact copy in HTML and plain text',()=>{
  for(const [lang,c] of Object.entries(COPY))for(const ext of ['html','txt']){
    const t=read(`emails/daily-reminder.${lang}.${ext}`);
    for(const text of Object.values(c))assert.ok(t.includes(text),`${lang}.${ext}: ${text}`);
  }
});

test('required vendor footer tags, one canonical Daily link, no personal or puzzle data',()=>{
  for(const lang of ['es','en'])for(const ext of ['html','txt']){
    const t=read(`emails/daily-reminder.${lang}.${ext}`);
    assert.ok(t.includes('{{UnsubscribeURL}}')&&t.includes('{{SenderInfo}}'),`${lang}.${ext} vendor footer`);
    if(ext==='html')assert.match(t,/href="\{\{UnsubscribeURL\}\}"/);
    const links=[...new Set(t.match(/https:\/\/derabona\.club[^\s"<]*/g))];
    assert.deepEqual(links,[`https://derabona.club/?lang=${lang}&utm_source=emailoctopus&utm_medium=email&utm_campaign=daily_reminder`]);
    const params=new URL(links[0]).searchParams;
    for(const [k,v] of params)assert.ok(['lang','utm_source','utm_medium','utm_campaign'].includes(k)&&v.length<=64,k);
    // Only vendor footer tags: no address, name, contact or account merge fields.
    assert.deepEqual([...new Set(t.match(/\{\{[^}]+\}\}/g))].sort(),['{{RewardsURL}}','{{SenderInfo}}','{{UnsubscribeURL}}']);
    assert.doesNotMatch(t,/<script|<form|<iframe/i);
    const visible=t.replace(/<!--[\s\S]*?-->|<[^>]+>/g,' ');
    assert.doesNotMatch(visible,/#\d|desafío n|challenge #|puntos|points|pista|clue/i,'no challenge number, score or clue');
    // Truthful for both cohorts: never claims the recipient confirmed or signed up through a form.
    assert.doesNotMatch(visible,/confirm|suscribiste|you signed up|you subscribed/i);
  }
});

test('templates are not deployed as public site assets',()=>{
  const workflow=read('.github/workflows/pages.yml');
  assert.doesNotMatch(workflow,/emails\//);
});
