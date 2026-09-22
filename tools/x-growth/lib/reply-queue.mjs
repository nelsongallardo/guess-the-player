import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const INITIAL = { version: 1, jobs: [], events: [] };
const STATUSES = new Set(['queued', 'publishing', 'published', 'uncertain', 'blocked', 'cancelled']);

function iso(value) { return (value instanceof Date ? value : new Date(value)).toISOString(); }
function clone(value) { return structuredClone(value); }

export class ReplyQueue {
  constructor({ filePath }) {
    if (!filePath) throw new Error('ReplyQueue requires filePath');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(filePath)) this._write(INITIAL);
    this._read();
  }

  close() {}

  _read() {
    let state;
    try { state = JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
    catch (error) { throw new Error(`corrupt reply queue ${this.filePath}: ${error.message}`); }
    if (state?.version !== 1 || !Array.isArray(state.jobs) || !Array.isArray(state.events)) throw new Error('invalid reply queue format');
    return state;
  }

  _write(state) {
    const tmp = `${this.filePath}.tmp.${process.pid}.${crypto.randomUUID()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  _mutate(fn) {
    const state = this._read();
    const result = fn(state);
    this._write(state);
    return clone(result);
  }

  _event(state, jobId, event, now, detail = null) {
    state.events.push({ id: crypto.randomUUID(), jobId, at: iso(now), event, detail });
  }

  get(id) { return clone(this._read().jobs.find(job => job.id === id) || null); }
  all() { return clone(this._read().jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))); }

  enqueue(candidate, { mode, now = new Date(), expiresAt }) {
    if (!['approved', 'automatic'].includes(mode)) throw new Error('invalid reply mode');
    const batchAt = iso(candidate.batchAt || now);
    const deadline = new Date(Date.parse(batchAt) + 12 * 3600e3);
    expiresAt = new Date(Math.min(new Date(expiresAt || deadline).getTime(), deadline.getTime()));
    return this._mutate(state => {
      const existing = state.jobs.find(job => job.sourceId === candidate.sourceId);
      if (existing) {
        const fields = ['sourceId','sourceUrl','sourceHandle','sourceText','replyText','draftId','batchId'];
        if ((candidate.batchAt && existing.batchAt && existing.batchAt !== batchAt) || fields.some(key => existing[key] !== candidate[key]) || JSON.stringify(existing.sourceLinks || []) !== JSON.stringify(candidate.sourceLinks || [])) throw new Error('source id already admitted with different payload');
        return existing;
      }
      const job = {
        id: crypto.randomUUID(),
        sourceId: candidate.sourceId, sourceUrl: candidate.sourceUrl,
        sourceHandle: candidate.sourceHandle, sourceText: candidate.sourceText,
        sourceLinks: candidate.sourceLinks || [],
        replyText: candidate.replyText, draftId: candidate.draftId, batchId: candidate.batchId,
        mode, status: 'queued', batchAt, createdAt: iso(now), expiresAt: iso(expiresAt),
        attemptStartedAt: null, publishedAt: null, publishedId: null, publishedUrl: null,
        errorCode: null, errorDetail: null,
      };
      state.jobs.push(job);
      this._event(state, job.id, 'queued', now);
      return job;
    });
  }

  retryComposerBlocked(id, { approved = false, now = new Date() } = {}) {
    if (!approved) throw new Error('fresh approval required');
    return this._mutate(state => {
      const job = state.jobs.find(item => item.id === id);
      if (job?.status !== 'blocked' || job.errorCode !== 'composer_mismatch') throw new Error('only a known pre-submit composer failure can be retried');
      if (job.expiresAt <= iso(now)) throw new Error('approval expired');
      job.status = 'queued'; job.errorCode = null;
      this._event(state, id, 'reapproved', now, 'explicit retry of pre-submit composer failure');
      return job;
    });
  }

  reapproveSourceBlocked(id, { approved = false, now = new Date(), batchAt } = {}) {
    if (!approved) throw new Error('fresh approval required');
    return this._mutate(state => {
      const job = state.jobs.find(item => item.id === id);
      if (job?.status !== 'blocked' || job.errorCode !== 'source_changed') throw new Error('only pre-submit source rejection may be reapproved');
      if (batchAt) {
        job.batchAt = iso(batchAt);
        job.expiresAt = iso(Math.min(Date.parse(job.expiresAt), Date.parse(batchAt) + 12 * 3600e3));
      }
      if (job.expiresAt <= iso(now)) throw new Error('approval expired');
      job.status = 'queued'; job.errorCode = null;
      this._event(state,id,'reapproved',now,'new explicit approval after pre-submit source rejection');
      return job;
    });
  }

  claimNext({ now = new Date() } = {}) {
    return this._mutate(state => {
      for (const job of state.jobs) {
        if (job.status === 'queued' && job.expiresAt <= iso(now)) {
          job.status = 'cancelled'; job.errorCode = 'expired'; this._event(state, job.id, 'cancelled', now, 'expired');
        }
      }
      const job = state.jobs.filter(item => item.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!job) return null;
      job.status = 'publishing'; job.attemptStartedAt = iso(now); job.attempt = (job.attempt || 0) + 1;
      this._event(state, job.id, 'publishing', now);
      return job;
    });
  }

  recoverStalePublishing({ now = new Date() } = {}) {
    return this._mutate(state => {
      const publishing = state.jobs.filter(job => job.status === 'publishing');
      for (const job of publishing) {
        job.status = 'uncertain'; job.errorCode = 'restart_recovery';
        this._event(state, job.id, 'uncertain', now, 'restart_recovery');
      }
      return publishing.length;
    });
  }

  markUncertain(id, code, { now = new Date() } = {}) { return this._transition(id, ['publishing'], 'uncertain', code, now); }
  block(id, code, { now = new Date() } = {}) { return this._transition(id, ['queued', 'publishing'], 'blocked', code, now); }

  _transition(id, allowed, status, code, now) {
    if (!STATUSES.has(status)) throw new Error('invalid reply status');
    return this._mutate(state => {
      const job = state.jobs.find(item => item.id === id);
      if (!job) throw new Error('unknown reply job');
      if (allowed.includes(job.status)) { job.status = status; job.errorCode = code; this._event(state, id, status, now, code); }
      return job;
    });
  }

  markPublished(id, publication, { now = new Date() } = {}) {
    return this._mutate(state => {
      const job = state.jobs.find(item => item.id === id);
      if (!job) throw new Error('unknown reply job');
      if (job.status === 'published') throw new Error('reply job already published');
      if (!['publishing', 'uncertain'].includes(job.status)) throw new Error(`cannot publish reply job in ${job.status}`);
      if (publication.parentId !== job.sourceId || publication.authorHandle?.toLowerCase() !== 'derabona_club' || publication.text !== job.replyText) throw new Error('publication verification mismatch');
      job.status = 'published'; job.publishedAt = iso(now); job.publishedId = publication.id; job.publishedUrl = publication.url; job.errorCode = null;
      this._event(state, id, 'published', now, publication.id);
      return job;
    });
  }

  cancelExpired({ now = new Date() } = {}) {
    return this._mutate(state => {
      let count = 0;
      for (const job of state.jobs) if (job.status === 'queued' && job.expiresAt <= iso(now)) {
        job.status = 'cancelled'; job.errorCode = 'expired'; this._event(state, job.id, 'cancelled', now, 'expired'); count++;
      }
      return count;
    });
  }

  listUncertain() { return clone(this._read().jobs.filter(job => job.status === 'uncertain').sort((a, b) => a.attemptStartedAt.localeCompare(b.attemptStartedAt))); }
}
