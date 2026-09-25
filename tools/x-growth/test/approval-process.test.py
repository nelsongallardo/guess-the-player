"""Replay a fixture approval through real Hermes ingress and a real Node service process.
Telegram delivery is captured locally; X publication is not invoked.
"""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
sys.path.insert(0, os.environ.get('HERMES_SOURCE','/Users/openclaw/.hermes/hermes-agent'))
from gateway.config import Platform,GatewayConfig,PlatformConfig
from gateway.platforms.base import MessageEvent
from gateway.session import SessionSource
from gateway.run import GatewayRunner
ROOT=Path(__file__).resolve().parents[1]

async def main():
    with tempfile.TemporaryDirectory(prefix='derabona-process-') as tmp:
        home=Path(tmp);state=home/'state';state.mkdir()
        runner_file=home/'runner'
        runner_file.write_text('#!'+sys.executable+'\nimport os,sys\nos.environ["DERABONA_STATE"]='+repr(str(state))+'\nos.execv('+repr(shutil.which('node'))+', ["node","--input-type=module","-e",'+repr('const {runService}=await import('+json.dumps((ROOT/'reply-service.mjs').as_uri())+');const fs=await import("node:fs");await runService({batchId:process.argv[1],picks:process.argv.slice(2,-2),requestId:process.argv.at(-1),notify:async text=>fs.appendFileSync('+json.dumps(str(home/'notices.jsonl'))+',JSON.stringify(text)+"\\n")});')+',*sys.argv[2:]])\n')
        runner_file.chmod(0o700)
        config=dict(enabled=True,chat_id='test-chat',thread_id='test-topic',user_id='test-owner',runner=str(runner_file))
        (home/'derabona-replies.json').write_text(json.dumps(config))
        from datetime import datetime,timezone
        batch=dict(id='2026-09-22-123',at=datetime.now(timezone.utc).isoformat(),drafts=[dict(id='a',n=1,handle='club',sourceId='123',sourceUrl='https://x.com/club/status/123',sourceText='approved source',reply='approved reply',status='pending'),dict(id='b',n=2,status='pending')])
        (state/'drafts.json').write_text(json.dumps(dict(batches=[batch])))
        plugin_path=home/'plugins/derabona-approvals/__init__.py';plugin_path.parent.mkdir(parents=True);shutil.copy2(ROOT/'plugins/derabona-approvals/__init__.py',plugin_path)
        spec=importlib.util.spec_from_file_location('process_plugin',plugin_path);assert spec and spec.loader
        plugin=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(plugin)
        hooks={};plugin.register(SimpleNamespace(register_hook=lambda name,fn:hooks.update({name:fn})))
        runner=object.__new__(GatewayRunner);runner.config=GatewayConfig(platforms={Platform.TELEGRAM:PlatformConfig(enabled=True)})
        runner.session_store=Mock();runner._running_agents={};runner.adapters={Platform.TELEGRAM:SimpleNamespace(send=AsyncMock())};runner._handle_message_with_agent=AsyncMock(side_effect=AssertionError('chat forbidden'))
        source=SessionSource(platform=Platform.TELEGRAM,chat_id=config['chat_id'],thread_id=config['thread_id'],user_id=config['user_id'],chat_type='dm')
        event=MessageEvent(text='derabona '+batch['id']+' 1',message_id='fixture-1',source=source)
        async def invoke(name,**kw):return [hooks[name](**kw)] if name in hooks else []
        with patch('hermes_cli.lifecycle.ainvoke_hook',side_effect=invoke):
            for _ in range(2):
                assert await runner._handle_message(event) is None
                await asyncio.gather(*list(plugin.TASKS))
        queue=json.loads((state/'reply-jobs.json').read_text())
        assert len(queue['jobs'])==1 and queue['jobs'][0]['status']=='queued'
        assert queue['jobs'][0]['batchId']==batch['id'] and queue['jobs'][0]['draftId']=='a'
        assert json.loads((state/'drafts.json').read_text())['batches'][0]['drafts'][1]['status']=='pending'
        assert not (state/'posts.json').exists()
        notices=[json.loads(line) for line in (home/'notices.jsonl').read_text().splitlines()]
        assert len(notices)==1 and all(batch['id'] in text for text in notices)
        runner._handle_message_with_agent.assert_not_awaited();runner.session_store.get_or_create.assert_not_called()
        print('PASS real Hermes ingress → real subprocess → durable selected job/ack; replay creates no second job, no browser, no chat session (fixture input/delivery)')
asyncio.run(main())
