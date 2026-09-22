import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
