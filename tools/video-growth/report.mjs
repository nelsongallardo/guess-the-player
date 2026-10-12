#!/usr/bin/env node
// Read-only pilot tracker export (CSV on stdout, summary on stderr).
//
//   node report.mjs --state DIR --campaign pilot-20261019 [--metrics METRICS.json] [--checkpoint 24h|7d]
//
// METRICS.json: [{ key, checkpoint: "24h"|"7d", views, likes, comments, source, observedAtUtc, consentedArrivals?, ... }]
// Missing numbers stay N/A. Metrics observed before a checkpoint is due are ignored.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { openLedger } from './lib/ledger.mjs';
import { trackerRows, toCsv, summary } from './lib/report.mjs';

const { values: a } = parseArgs({ options: { state: { type: 'string' }, campaign: { type: 'string' }, metrics: { type: 'string' }, checkpoint: { type: 'string' } } });
try {
  if (!a.state || !a.campaign) throw new Error('usage: report.mjs --state DIR --campaign ID [--metrics FILE] [--checkpoint 24h|7d]');
  const jobsDir = path.join(a.state, 'jobs');
  const jobs = fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8'))).filter(j => j.campaignId === a.campaign) : [];
  const metrics = a.metrics ? JSON.parse(fs.readFileSync(a.metrics, 'utf8')) : [];
  const rows = trackerRows({ jobs, entries: openLedger(a.state).entries, metrics, nowUtc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
  process.stdout.write(toCsv(rows));
  console.error(JSON.stringify({ campaign: a.campaign, checkpoint: a.checkpoint ?? null, ...summary(rows) }));
} catch (e) {
  console.error(`report failed: ${e.message}`);
  process.exit(1);
}
