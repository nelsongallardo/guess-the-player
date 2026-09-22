import fs from 'node:fs';
import path from 'node:path';
export function acquireProcessLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let fd;
  try { fd=fs.openSync(file,'wx',0o600); }
  catch(error) {
    if(error.code!=='EEXIST') throw error;
    const pid=Number(fs.readFileSync(file,'utf8'));
    if(!Number.isInteger(pid)||pid<=0) throw new Error('reply lock has no valid owner; manual reconciliation required');
    try {process.kill(pid,0);} catch(e) {if(e.code==='ESRCH') throw new Error('stale reply lock; manual reconciliation required before unlocking');}
    return null;
  }
  fs.writeFileSync(fd,String(process.pid));
  return () => { fs.closeSync(fd); fs.unlinkSync(file); };
}
