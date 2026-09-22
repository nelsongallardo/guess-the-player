"""Consume batch-bound approvals before Hermes starts/interrupts an agent turn."""
import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess

HOME = Path(os.environ.get('HERMES_HOME', Path.home() / '.hermes/profiles/engineering'))
CONFIG = HOME / 'derabona-replies.json'
COMMAND = re.compile(r'^/?derabona\s+(\d{4}-\d{2}-\d{2}-\d+)\s+(skip|[1-9]\d*(?:\s*,\s*[1-9]\d*)*)$', re.I)
CANDIDATE = re.compile(r'^/?derabona(?=\s|@|$)', re.I)
TASKS = set()
logger = logging.getLogger(__name__)


def schedule(coroutine):
    task = asyncio.get_running_loop().create_task(coroutine)
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)


async def notice(gateway, source, text):
    try:
        result = await gateway.adapters[source.platform].send(
            source.chat_id, text, metadata={'thread_id': source.thread_id})
        if not result.success:
            logger.error('Derabona approval notice delivery failed')
    except Exception:
        logger.error('Derabona approval notice delivery failed')


async def monitor(process, gateway, source, batch_id):
    code = await asyncio.to_thread(process.wait)
    if code:
        await notice(gateway, source, f'derabona · lote {batch_id}: no se completó la aprobación. No se inició ninguna publicación desde este comando. Revisá el estado antes de repetirlo.')


def dispatch(*, event, gateway, **_):
    source = event.source
    if getattr(source.platform, 'value', source.platform) != 'telegram':
        return None
    text = str(event.text or '').strip()
    if not CANDIDATE.match(text):
        return None
    # Every command-shaped input is consumed, including malformed/unauthorized
    # requests. The hook runs BEFORE Hermes auth, so enforce our own exact route.
    handled = {'action':'skip', 'reason':'derabona-approval-consumed'}
    authorized = False
    try:
        config = json.loads(CONFIG.read_text())
        if any(str(getattr(source, key, '') or '') != str(config[key]) for key in ('chat_id','thread_id','user_id')):
            return handled
        authorized = True
        match = COMMAND.fullmatch(text)
        if not match:
            schedule(notice(gateway,source,'derabona: comando inválido. Copiá el comando del lote: derabona LOTE 1,3 (o skip). No se aprobó nada.'))
            return handled
        if not config.get('enabled'):
            schedule(notice(gateway,source,'derabona: aprobaciones pausadas por mantenimiento. No se aprobó ni publicó nada.'))
            return handled
        batch_id, selection = match.groups()
        picks = [p.strip().lower() for p in selection.split(',')]
        if not event.message_id:
            schedule(notice(gateway,source,'derabona: falta el identificador del mensaje. No se aprobó nada.'))
            return handled
        receipt = hashlib.sha256(json.dumps([str(source.chat_id),str(source.thread_id),str(source.user_id),str(event.message_id)]).encode()).hexdigest()
        log = HOME / 'logs/derabona-reply-service.log'
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open('ab') as output:
            process = subprocess.Popen([config['runner'],'approve',batch_id,*picks,'--request-id',receipt],
                stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True)
        schedule(monitor(process,gateway,source,batch_id))
        logger.info('Derabona approval consumed before agent dispatch; batch=%s selection=%s',batch_id,','.join(picks))
    except Exception:
        # Never let the framework's fail-open hook exception policy route an
        # approval into the conversational agent when our handler fails.
        logger.error('Derabona approval intake failed; command consumed without agent dispatch')
        if authorized:
            schedule(notice(gateway,source,'derabona: no se pudo iniciar la aprobación. El comando no pasó al chat; no se inició ninguna publicación desde este comando.'))
    return handled


def register(ctx):
    ctx.register_hook('pre_gateway_dispatch', dispatch)
    logger.info('Derabona approval ingress registered: pre_gateway_dispatch v1')
