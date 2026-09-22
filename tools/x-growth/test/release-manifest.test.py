"""Release verification rejects extra executable files and changed/missing payloads."""
from pathlib import Path
import hashlib,json,subprocess,sys,tempfile
script=Path(__file__).resolve().parents[1]/'ops/install-release.py'
with tempfile.TemporaryDirectory() as d:
 root=Path(d);manifest={}
 files=['tools/x-growth/plugins/derabona-approvals/__init__.py','tools/x-growth/plugins/derabona-approvals/plugin.yaml','tools/x-growth/ops/runtime.py','tools/x-growth/package.json','tools/x-growth/package-lock.json']
 for relative in files:
  p=root/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('fixture');manifest[relative]=hashlib.sha256(p.read_bytes()).hexdigest()
 (root/'manifest.json').write_text(json.dumps(manifest))
 def verify():return subprocess.run([sys.executable,str(script),'verify',str(root)],capture_output=True,text=True)
 assert verify().returncode==0,'valid complete manifest should verify'
 extra=root/'tools/x-growth/plugins/derabona-approvals/injected.py';extra.write_text('unexpected executable')
 assert verify().returncode!=0,'unmanifested plugin must be rejected'
 extra.unlink();(root/files[0]).write_text('changed');assert verify().returncode!=0
 (root/files[0]).unlink();assert verify().returncode!=0
print('PASS release exact file-set, missing files and changed bytes fail closed')
