import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');

test('privacy page exposes only the project contact alias', () => {
  const mailtoTargets = [...privacy.matchAll(/href="(mailto:[^"]+)"/gi)].map((match) => match[1]);

  assert.deepEqual(mailtoTargets, [
    'mailto:contact@derabona.club',
    'mailto:contact@derabona.club',
  ]);
  assert.doesNotMatch(privacy, /(?:Operator|Responsable):/i);
  assert.doesNotMatch(privacy, /@gmail\.com/i);
  assert.equal((privacy.match(/>contact@derabona\.club</g) ?? []).length, 2);
});

test('privacy page explains contact-message forwarding in both languages', () => {
  assert.match(privacy, /ImprovMX reenvía los mensajes/i);
  assert.match(privacy, /ImprovMX forwards messages/i);
});
