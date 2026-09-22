#!/usr/bin/env python3
"""Launch an immutable Derabona release with explicit engineering ownership."""
import json
import os
import subprocess
import sys
from pathlib import Path
HOME=Path('/Users/openclaw/.hermes/profiles/engineering')
config=json.loads((HOME/'derabona-replies.json').read_text())
command=sys.argv[1] if len(sys.argv)>1 else 'drain'
if command == 'drain' and not config.get('enabled'):
    raise SystemExit(0)  # Deliberate maintenance idleness is not a cron failure.
if command == 'approve' and not config.get('enabled'):
    raise SystemExit('Derabona browser reply integration is disabled')
release=Path(config['release'])/'tools/x-growth'
api=Path(config['api_root'])/'tools/x-growth'
names={'scout':(release,'scout.mjs'),'daily':(api,'post-daily.mjs'),'reveal':(api,'post-reveal.mjs'),'metrics':(api,'metrics.mjs'),'check':(release,'check-replies.mjs')}
if command in ('approve','drain'):
    root=release;args=['reply-service.mjs',command,*sys.argv[2:]]
elif command in names:
    root,name=names[command];args=[name,*sys.argv[2:]]
else:
    raise SystemExit('Unknown Derabona command')
env=dict(os.environ,HERMES_HOME=str(HOME),DERABONA_STATE=config['state'],DERABONA_REPLY_TRANSPORT='browser',DERABONA_REPLY_AUTO_SEND='0',DERABONA_TG_CHAT=str(config['chat_id']),DERABONA_TG_THREAD=str(config['thread_id']))
# Reply queue must follow the selected state, never an inherited shell override.
env['DERABONA_REPLY_QUEUE']=str(Path(config['state'])/'reply-jobs.json')
raise SystemExit(subprocess.call([config['node'],*args],cwd=root,env=env))
