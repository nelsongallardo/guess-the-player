#!/usr/bin/env python3
"""Run every focused X-growth test; keep results scoped to this artifact."""
from pathlib import Path
import json
import os
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
files=sorted(ROOT.glob('test/*.test.mjs'))+sorted(ROOT.glob('test/*.test.py'))
results=[]
for file in files:
    command=[os.environ.get('HERMES_PYTHON',sys.executable) if file.suffix=='.py' else 'node',str(file)]
    run=subprocess.run(command,cwd=ROOT,env=dict(os.environ,PLAYWRIGHT_BROWSERS_PATH='0'),capture_output=True,text=True,timeout=120)
    results.append(dict(file=file.name,exit=run.returncode,output=run.stdout+run.stderr))
    print(('PASS' if run.returncode==0 else 'FAIL'),file.name,flush=True)
    if run.returncode:print(run.stdout+run.stderr)
(ROOT/'test-results').mkdir(exist_ok=True)
(ROOT/'test-results/consistency-suite.json').write_text(json.dumps(results,indent=2))
failed=[r['file'] for r in results if r['exit']]
print(json.dumps(dict(files=len(results),failed=failed)))
sys.exit(bool(failed))
