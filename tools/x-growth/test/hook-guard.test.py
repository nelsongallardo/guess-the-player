"""Portable guard: no dependency on any live/default-profile hook."""
import importlib.util
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
with tempfile.TemporaryDirectory(prefix='derabona-hook-guard-') as root:
    with patch.dict(os.environ,HERMES_HOME=root):
        spec=importlib.util.spec_from_file_location('approval_guard',Path(__file__).resolve().parents[1]/'plugins/derabona-approvals/__init__.py')
        assert spec and spec.loader
        plugin=importlib.util.module_from_spec(spec);spec.loader.exec_module(plugin)
    source=SimpleNamespace(platform=SimpleNamespace(value='telegram'))
    with patch('subprocess.Popen') as spawn:
        for text in ['1','1,2','skip','hola, todo bien?','dale, el 1 me gusta más']:
            assert plugin.dispatch(event=SimpleNamespace(source=source,text=text),gateway=None) is None
        spawn.assert_not_called()
print('PASS bare numbers/skip and ordinary chat cannot authorize any job')
