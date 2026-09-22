import json,runpy,sys
from pathlib import Path
from unittest.mock import patch
runtime=Path(__file__).resolve().parents[1]/'ops/runtime.py'
with patch.object(Path,'read_text',return_value=json.dumps({'enabled':False})):
 with patch.object(sys,'argv',[str(runtime),'drain']):
  try:runpy.run_path(str(runtime),run_name='__main__')
  except SystemExit as e:assert e.code==0,'disabled scheduled drain must be a silent no-op'
 with patch.object(sys,'argv',[str(runtime),'approve','batch','1']):
  try:runpy.run_path(str(runtime),run_name='__main__');raise AssertionError('disabled approval accepted')
  except SystemExit as e:assert e.code!=0
print('PASS disabled maintenance drain is silent success; approvals remain refused')
