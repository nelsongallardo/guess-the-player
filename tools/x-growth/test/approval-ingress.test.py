"""Actual installed Hermes dispatch + Derabona plugin, with isolated state/I/O."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, os.environ.get('HERMES_SOURCE', '/Users/openclaw/.hermes/hermes-agent'))
from gateway.config import Platform, GatewayConfig, PlatformConfig
from gateway.platforms.base import MessageEvent
from gateway.session import SessionSource
from gateway.run import GatewayRunner

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins/derabona-approvals/__init__.py'

async def main():
    with tempfile.TemporaryDirectory(prefix='derabona-ingress-') as tmp:
        home = Path(tmp)
        config = dict(enabled=True, chat_id='fixture-chat', thread_id='fixture-topic', user_id='fixture-owner', runner='/fixture/runner')
        (home / 'derabona-replies.json').write_text(json.dumps(config))
        callbacks = {}
        if PLUGIN.exists():
            spec = importlib.util.spec_from_file_location('approval_plugin_test', PLUGIN)
            plugin = importlib.util.module_from_spec(spec)
            with patch.dict(os.environ, HERMES_HOME=str(home)):
                spec.loader.exec_module(plugin)
            plugin.register(SimpleNamespace(register_hook=lambda name, callback: callbacks.update({name:callback})))
        else:
            plugin = SimpleNamespace()
        source = SessionSource(platform=Platform.TELEGRAM, chat_id=config['chat_id'], thread_id=config['thread_id'], user_id=config['user_id'], chat_type='dm')
        runner = object.__new__(GatewayRunner)
        runner.config = GatewayConfig(platforms={Platform.TELEGRAM:PlatformConfig(enabled=True)})
        runner.session_store = Mock()
        runner._running_agents = {}
        adapter = SimpleNamespace(send=AsyncMock(return_value=SimpleNamespace(success=True)))
        runner.adapters = {Platform.TELEGRAM:adapter}
        runner._handle_message_with_agent = AsyncMock(side_effect=AssertionError('ordinary agent must never run'))
        spawned=[]
        def launch(*args, **kwargs):
            spawned.append(args[0]); return SimpleNamespace(wait=lambda:0)
        def invoke(name, **kwargs):
            return [callbacks[name](**kwargs)] if name in callbacks else []
        event = MessageEvent(text='derabona 2026-09-22-123 1,3', message_id='fixture-message', source=source)
        with patch('hermes_cli.plugins.invoke_hook', side_effect=invoke), patch('subprocess.Popen', side_effect=launch):
            # RED before plugin: observer hook cannot consume this event.
            assert runner._hm_pre_gateway_dispatch_hook(event, source) is None, 'approval must terminate normal routing'
            assert len(spawned)==1 and spawned[0][:5]==[config['runner'],'approve','2026-09-22-123','1','3']
            assert spawned[0][5]=='--request-id' and len(spawned[0][6])==64
            # Full ingress, including the busy-session branch, must stop before chat.
            runner._running_agents['busy-fixture'] = object()
            assert await runner._handle_message(event) is None
            runner._handle_message_with_agent.assert_not_awaited()
            runner.session_store.get_or_create.assert_not_called()
            baseline=len(spawned)
            for field in ('user_id','thread_id','chat_id'):
                bad = SessionSource(platform=Platform.TELEGRAM, chat_id=config['chat_id'], thread_id=config['thread_id'], user_id=config['user_id'], chat_type='dm')
                setattr(bad,field,'wrong')
                e=MessageEvent(text=event.text,message_id='wrong',source=bad)
                assert runner._hm_pre_gateway_dispatch_hook(e,bad) is None
            for text in ('derabona 2026-09-22-123 0', 'derabona 2026-09-22-123 1;rm', 'derabona 2026-09-22-123', 'derabona skip', '/derabona@fixture_bot 2026-09-22-123 1'):
                e=MessageEvent(text=text,message_id='invalid',source=source)
                assert runner._hm_pre_gateway_dispatch_hook(e,source) is None
            config['enabled']=False;(home/'derabona-replies.json').write_text(json.dumps(config))
            assert runner._hm_pre_gateway_dispatch_hook(event,source) is None
            assert len(spawned)==baseline, 'wrong route, malformed or disabled input must not launch'
            normal=MessageEvent(text='how is derabona doing?',message_id='normal',source=source)
            assert runner._hm_pre_gateway_dispatch_hook(normal,source) is normal
            config['enabled']=True;(home/'derabona-replies.json').write_text(json.dumps(config))
            with patch('subprocess.Popen',side_effect=OSError('fixture launch failure')):
                assert runner._hm_pre_gateway_dispatch_hook(event,source) is None
            if getattr(plugin,'TASKS',None): await asyncio.gather(*list(plugin.TASKS))
            assert any('no se pudo iniciar' in str(call.args) for call in adapter.send.await_args_list)
        assert all(call.kwargs.get('metadata',{}).get('thread_id')==source.thread_id for call in adapter.send.await_args_list)
        print('PASS actual Hermes ingress consumes approvals; no agent/session even when busy; route/auth/disabled/invalid guards; ordinary chat preserved')

asyncio.run(main())
