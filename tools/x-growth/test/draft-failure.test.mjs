// A successful Hermes process with no output is an infrastructure failure, not
// the model choosing SKIP. It must propagate so cron failure delivery can alert.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-draft-test-'));
const hermes = path.join(dir, 'empty-hermes');
fs.writeFileSync(hermes, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
process.env.HERMES_BIN = hermes;

try {
  const { draftReply, DraftCallError } = await import('../lib/draft.mjs');
  await assert.rejects(
    () => draftReply({ sourceText: 'un post de fútbol suficientemente largo para probar', handle: 'test' }),
    error => error instanceof DraftCallError && /returned empty output/.test(error.message),
    'empty Hermes output must raise DraftCallError',
  );
  console.log('PASS empty Hermes output raises DraftCallError');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
