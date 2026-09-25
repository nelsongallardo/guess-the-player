import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { approvalMessages, sendApprovalMessages } from '../scout.mjs';

const batch = {
  id: '2026-09-25-1790339442013',
  drafts: [{
    n: 1,
    handle: 'fixture',
    sourceText: 'El equipo sumó un torneo más al calendario.',
    reply: 'otro torneo que promete encontrar lugar entre mil fechas?',
    sourceUrl: 'https://x.com/fixture/status/123',
  }],
};
const messages = approvalMessages(batch);
assert.equal(messages.length, 2, 'preview and approval command must be separate Telegram messages');
assert.match(messages[0], /otro torneo que promete/);
assert.doesNotMatch(messages[0], /2026-09-25-1790339442013/);
assert.equal(messages[1], 'derabona 2026-09-25-1790339442013 1');
assert.equal(messages[1].includes('\n'), false, 'copyable approval command must be one plain line');
const delivered = [];
await sendApprovalMessages(batch, async text => delivered.push(text));
assert.deepEqual(delivered, messages, 'Telegram sender receives two independent messages in order');
console.log('PASS approval preview and copyable batch command are delivered as separate messages');

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-scout-output-'));
fs.writeFileSync(path.join(state, 'watchlist.json'), JSON.stringify({ accounts: [], cursor: 0 }));

try {
  const result = spawnSync(process.execPath, ['scout.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DERABONA_STATE: state },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'no-op scout output would be delivered by no-agent cron');
  assert.match(result.stderr, /nothing to scout/, 'diagnostic should remain available in cron logs');
  console.log('PASS no-op scout keeps delivery stdout empty');
} finally {
  fs.rmSync(state, { recursive: true, force: true });
}
