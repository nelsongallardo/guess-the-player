#!/usr/bin/env python3
"""Stage/activate an immutable engineering-only repair; never copy mutable state.
Stage: python ops/install-release.py stage
Activate (after installed-artifact tests): python ops/install-release.py activate RELEASE
Leaves ingress disabled for gateway restart + live plugin verification. Enable separately.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
HOME=Path('/Users/openclaw/.hermes/profiles/engineering')
ROOT=Path(__file__).resolve().parents[3]
def verify_release(release):
    manifest=json.loads((release/'manifest.json').read_text())
    required={'tools/x-growth/package.json','tools/x-growth/package-lock.json','tools/x-growth/ops/runtime.py','tools/x-growth/plugins/derabona-approvals/__init__.py','tools/x-growth/plugins/derabona-approvals/plugin.yaml'}
    if not required <= manifest.keys():raise RuntimeError('missing mandatory release files')
    actual=set()
    for p in release.rglob('*'):
        rel=p.relative_to(release)
        if {'node_modules','test-results','__pycache__'} & set(rel.parts):continue
        if p.is_symlink():raise RuntimeError('release symlink rejected')
        if p.is_file() and str(rel)!='manifest.json':actual.add(str(rel))
    if actual!=set(manifest):raise RuntimeError('manifest file-set mismatch')
    for rel,digest in manifest.items():
        target=release/rel
        if not target.resolve().is_relative_to(release.resolve()):raise RuntimeError('manifest path escapes release')
        if hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise RuntimeError('manifest mismatch')
    return manifest

command=sys.argv[1]
if command=='verify':
    verify_release(Path(sys.argv[2]).resolve());print('manifest verified')
elif command=='stage':
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release=HOME/'releases'/('derabona-replies-'+stamp)
    release.mkdir(parents=True,exist_ok=False)
    files=set(subprocess.check_output(['git','ls-files','-co','--exclude-standard'],cwd=ROOT,text=True).splitlines())
    manifest={}
    for rel in sorted(files):
        if rel!='index.html' and not rel.startswith('tools/x-growth/'):continue
        source=ROOT/rel
        if not source.is_file():continue
        target=release/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
        manifest[rel]=hashlib.sha256(target.read_bytes()).hexdigest()
    if not {'tools/x-growth/package.json','tools/x-growth/package-lock.json'} <= manifest.keys():
        raise RuntimeError('release missing pinned package manifest/lockfile')
    (release/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(release)
elif command=='activate':
    release=Path(sys.argv[2]).resolve()
    if release.parent!=HOME/'releases':raise RuntimeError('release outside engineering home')
    manifest=verify_release(release)
    result=json.loads((release/'tools/x-growth/test-results/consistency-suite.json').read_text())
    test_files={p.name for p in (release/'tools/x-growth/test').glob('*.test.*')}
    if {r['file'] for r in result}!=test_files or any(r['exit'] for r in result):raise RuntimeError('installed suite incomplete/failing')
    config_path=HOME/'derabona-replies.json';config=json.loads(config_path.read_text());state=Path(config['state'])
    backup=HOME/'backups'/release.name;backup.mkdir(parents=True,exist_ok=False)
    shutil.copy2(config_path,backup/'derabona-replies.json')
    # Disable first; ingress and the cron launcher both observe the same switch.
    config['enabled']=False
    tmp=config_path.with_suffix('.tmp');tmp.write_text(json.dumps(config,indent=2));tmp.chmod(0o600);tmp.replace(config_path)
    lock=state/'reply-service.lock'
    fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.write(fd,str(os.getpid()).encode())
    try:
        queue=json.loads((state/'reply-jobs.json').read_text())
        if any(j['status'] in ('queued','publishing') for j in queue['jobs']):raise RuntimeError('pending execution; leave disabled for review')
        if (state/'reply-jobs.json.worker.lock').exists():raise RuntimeError('browser worker active')
        for relative in ['hooks/derabona-approvals','plugins/derabona-approvals']:
            current=HOME/relative
            if current.exists():shutil.move(str(current),str(backup/relative.replace('/','-')))
        shutil.copytree(release/'tools/x-growth/plugins/derabona-approvals',HOME/'plugins/derabona-approvals',ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copy2(HOME/'scripts/derabona-runtime.py',backup/'derabona-runtime.py')
        shutil.copy2(release/'tools/x-growth/ops/runtime.py',HOME/'scripts/derabona-runtime.py')
        config['release']=str(release);tmp.write_text(json.dumps(config,indent=2));tmp.chmod(0o600);tmp.replace(config_path)
        print(json.dumps(dict(installed=True,enabled=False,backup=str(backup),state_migrated=False)))
    finally:os.close(fd);lock.unlink()
else:raise SystemExit('usage: install-release.py stage | activate RELEASE')
