#!/usr/bin/env node
import path from 'node:path';
import { STATE_DIR, readState, writeState, isPaused } from './lib/state.mjs';
import { acquireProcessLock } from './lib/process-lock.mjs';
import { ReplyQueue } from './lib/reply-queue.mjs';
import { approve } from './approve.mjs';
import { runWorker } from './publish-replies.mjs';
import { XBrowserPublisher } from './lib/x-browser-publisher.mjs';
import { projectPublishedReply } from './lib/reply-reporting.mjs';
import { sendTelegram } from './lib/telegram.mjs';

export async function approveBatch(batchId, picks, { queue, notify = sendTelegram, freshRequest = false } = {}) {
  if (isPaused()) throw new Error('paused');
  const state = readState('drafts.json', {batches:[]});
  const batch = state.batches.find(b=>b.id===batchId);
  if (!batch || !Number.isFinite(Date.parse(batch.at)) || Date.now()-Date.parse(batch.at)>=12*3600e3) throw new Error('batch missing or expired');
  if (picks.length===1 && picks[0]==='skip') {
    for(const d of batch.drafts) if(d.status==='pending') d.status='skipped';
    writeState('drafts.json',state); await notify(`derabona · lote ${batchId}: borradores pendientes descartados.`); return [];
  }
  const unique=[...new Set(picks)];
  const selected=unique.map(n=>batch.drafts.find(d=>String(d.n)===String(n)));
  if(!selected.length||selected.some(d=>!d)) throw new Error('invalid draft selection');
  const results=[];
  for(const draft of selected) {
    const previous=queue?.all().find(j=>j.batchId===batchId&&j.draftId===draft.id);
    if(freshRequest && draft.status==='blocked' && previous?.status==='blocked' && previous.errorCode==='source_changed') {
      queue.enqueue({sourceId:draft.sourceId,sourceUrl:draft.sourceUrl,sourceHandle:draft.handle,sourceText:draft.sourceText,sourceLinks:draft.sourceLinks,replyText:draft.reply,draftId:draft.id,batchId,batchAt:batch.at},{mode:'approved'});
      const job=queue.reapproveSourceBlocked(previous.id,{approved:true,batchAt:batch.at});
      const current=readState('drafts.json',{batches:[]});
      const target=current.batches.find(b=>b.id===batchId).drafts.find(d=>d.id===draft.id);
      target.status='queued';delete target.blockedReason;
      writeState('drafts.json',current);results.push({n:draft.n,status:'queued',jobId:job.id});continue;
    }
    if(draft.status!=='pending') { results.push({n:draft.n,status:draft.status}); continue; }
    try { const r=await approve(draft.id,{transport:'browser',queue,batchId}); results.push({n:draft.n,status:'queued',jobId:r.jobId}); }
    catch(error) { results.push({n:draft.n,status:'rejected',reason:error.message}); }
  }
  await notify(`derabona · lote ${batchId}: `+results.map(r=>`${r.n}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`).join('; ')+'. En cola no significa publicada.');
  return results;
}

export async function reportResults(queue, {notify=sendTelegram,project=projectPublishedReply}={}) {
  const reports=readState('reply-reports.json',{});
  for(const job of queue.all()) {
    if(!['published','blocked','uncertain','cancelled'].includes(job.status)) continue;
    const signature=JSON.stringify([job.status,job.publishedId,job.errorCode,...(job.attempt?[job.attempt]:[])]);
    // History repair is independent of result-delivery deduplication. A verified
    // publication stays published even when its local projection needs retrying.
    let projectionPending=false;
    if(job.status==='published') {try {project(job);} catch {projectionPending=true;}}
    if(reports[job.id]===signature) continue;
    const drafts=readState('drafts.json',{batches:[]});
    const draft=drafts.batches.find(b=>b.id===job.batchId)?.drafts.find(d=>d.id===job.draftId);
    if(draft) {
      draft.status=job.status==='published'?'approved':job.status;
      if(job.status==='published') {draft.tweetId=job.publishedId;draft.publishedUrl=job.publishedUrl;delete draft.blockedReason;}
      else draft.blockedReason=job.errorCode;
      writeState('drafts.json',drafts);
    }
    const text=job.status==='published'
      ? `derabona · lote ${job.batchId} · borrador ${draft?.n ?? job.draftId}: respuesta publicada a @${job.sourceHandle}\n${job.publishedUrl}${projectionPending ? "\nEl historial local está pendiente de sincronizar. No se reenviará la respuesta." : ""}`
      : `derabona · lote ${job.batchId} · borrador ${draft?.n ?? job.draftId}: respuesta ${job.status} a @${job.sourceHandle} (${job.errorCode}). ${job.status==='uncertain'?'No se reenviará: requiere verificar si ya se publicó.':'No se publicó. Revisar antes de una nueva aprobación.'}`;
    // Delivery failure leaves the report pending, never the X publication.
    await notify(text);
    reports[job.id]=signature;writeState('reply-reports.json',reports);
  }
}

export async function runService({batchId,picks=[],requestId,queue=new ReplyQueue({filePath:path.join(STATE_DIR,'reply-jobs.json')}),publisherFactory=()=>new XBrowserPublisher({launchOptions:{channel:'chrome',headless:true,chromiumSandbox:true}}),notify=sendTelegram}={}) {
  const release=acquireProcessLock(path.join(STATE_DIR,'reply-service.lock'));
  if(!release) { if(batchId) await notify('derabona: procesando otra operación. Repetí la aprobación en un minuto.'); return {kind:'locked'}; }
  try {
    if(isPaused()) { if(batchId) await notify(`derabona · lote ${batchId}: automatización pausada. No se aprobó ni publicó nada.`); return {kind:'paused'}; }
    // Ingress only enqueues. The separately scheduled worker is the sole browser
    // consumer; approval/skip/replay can never drain an unrelated queued job.
    if(batchId) {
      if(requestId) {
        if(!/^[a-f0-9]{64}$/.test(requestId)) throw new Error('invalid approval receipt');
        const receipts=readState('approval-receipts.json',{});
        if(receipts[requestId]) return {kind:'duplicate'};
        // Persist consumption before mutations: redelivery after a crash is never
        // fresh authority to retry a job that might already have been attempted.
        receipts[requestId]={batchId,picks,at:new Date().toISOString()};
        writeState('approval-receipts.json',receipts);
      }
      return {kind:'approved',results:await approveBatch(batchId,picks,{queue,notify,freshRequest:!!requestId})};
    }
    for(const job of queue.all()) if(job.status==='queued' && job.mode!=='approved') queue.block(job.id,'approval_required');
    await reportResults(queue,{notify});
    const results=[];
    for(let i=0;i<5;i++) {
      const result=await runWorker({queue,publisher:publisherFactory(),lockPath:path.join(STATE_DIR,'reply-jobs.json.worker.lock')});
      results.push(result.kind);
      await reportResults(queue,{notify});
      if(['empty','locked','paused','uncertain'].includes(result.kind)) break;
    }
    return {kind:'complete',results};
  } finally {release();}
}
if(import.meta.url===`file://${process.argv[1]}`) {
  const args=process.argv.slice(2);
  const requestIndex=args.indexOf('--request-id');
  let requestId;
  if(requestIndex>=0) {requestId=args[requestIndex+1];args.splice(requestIndex,2);}
  const [command,batchId,...picks]=args;
  if(!['approve','drain'].includes(command)) throw new Error('usage: reply-service.mjs approve BATCH PICK... | drain');
  runService(command==='approve'?{batchId,picks,requestId}:{}).catch(error=>{console.error(`derabona reply service failed: ${error.code||error.message}`);process.exitCode=1;});
}
