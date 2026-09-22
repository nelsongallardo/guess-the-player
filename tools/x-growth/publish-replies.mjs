#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, isPaused } from './lib/state.mjs';
import { ReplyQueue } from './lib/reply-queue.mjs';
import { checkReplyPolicy } from './lib/reply-policy.mjs';
import { XBrowserPublisher } from './lib/x-browser-publisher.mjs';
import { projectPublishedReply } from './lib/reply-reporting.mjs';

function acquireLock(lockPath) {
  try { return fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return null; throw error; }
}

export async function runWorker({
  queue,
  publisher,
  lockPath,
  now = new Date(),
  paused = isPaused,
  check = false,
  project = projectPublishedReply,
} = {}) {
  const fd = acquireLock(lockPath);
  if (fd === null) return { kind: 'locked' };
  try {
    queue.recoverStalePublishing({ now });
    if (check) return { kind: 'preflight', result: await publisher.preflight() };
    if (paused()) return { kind: 'paused' };
    const job = queue.claimNext({ now });
    if (!job) return { kind: 'empty' };
    const policy = checkReplyPolicy({ handle: job.sourceHandle, reply: job.replyText, batchAt: job.batchAt || job.createdAt }, { queue: queue.all().filter(item => item.id !== job.id), now });
    if (!policy.ok) { queue.block(job.id, policy.reason, { now }); return { kind: 'blocked', jobId: job.id, reason: policy.reason }; }
    let publicationReturned = false;
    try {
      const publication = await publisher.publish(job);
      publicationReturned = true;
      const published = queue.markPublished(job.id, publication, { now });
      let projectionError = null;
      try { project(published); } catch (error) { projectionError = error.message; }
      return { kind: 'published', job: published, projectionError };
    } catch (error) {
      const code = publicationReturned ? 'uncertain_submission' : (error.code || 'publish_failed');
      const jobAfter = code === 'uncertain_submission'
        ? queue.markUncertain(job.id, code, { now })
        : queue.block(job.id, code, { now });
      return { kind: jobAfter.status, job: jobAfter, error: code };
    }
  } finally {
    try { await publisher.close(); }
    finally { fs.closeSync(fd); fs.unlinkSync(lockPath); }
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const filePath = process.env.DERABONA_REPLY_QUEUE || path.join(STATE_DIR, 'reply-jobs.json');
  const queue = new ReplyQueue({ filePath });
  const publisher = new XBrowserPublisher();
  const result = await runWorker({ queue, publisher, lockPath: `${filePath}.worker.lock`, check });
  queue.close();
  if (check) console.log(JSON.stringify(result));
  else if (!['empty', 'locked', 'paused'].includes(result.kind)) console.log(JSON.stringify({ kind: result.kind, jobId: result.job?.id || result.jobId, error: result.error }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('derabona publisher FAILED:', error.message); process.exit(1); });
}
