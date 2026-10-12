// Exclusive per-lane process lock (O_EXCL). A stale lock is never auto-removed:
// the dead holder may have been mid-write, so reconcile first.

import fs from 'node:fs';
import path from 'node:path';

export function acquireLock(stateDir) {
  const file = path.join(stateDir, 'publish.lock');
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(fs.readFileSync(file, 'utf8'));
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); throw new Error(`another publisher is running (pid ${pid})`); }
      catch (k) { if (k.code !== 'ESRCH' && k.code !== 'EPERM') throw k; if (k.code === 'EPERM') throw new Error(`another publisher is running (pid ${pid})`); }
    }
    throw new Error(`stale publish lock at ${file}; reconcile every unresolved target before removing it by hand`);
  }
  fs.writeSync(fd, String(process.pid));
  fs.fsyncSync(fd);
  return () => { fs.closeSync(fd); fs.unlinkSync(file); };
}
