"""The retired observer hook must never execute an approval."""
import asyncio
import importlib.util
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('retired_hook',Path(__file__).resolve().parents[1]/'hooks/derabona-approvals/handler.py')
assert spec and spec.loader
hook=importlib.util.module_from_spec(spec);spec.loader.exec_module(hook)
with patch('subprocess.Popen') as spawn:
    asyncio.run(hook.handle('agent:start',dict(platform='telegram',message='derabona 2026-09-22-123 1,3')))
    spawn.assert_not_called()
print('PASS retired agent:start observer cannot double-approve or drain')
