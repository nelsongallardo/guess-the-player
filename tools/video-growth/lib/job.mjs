// Re-derives a job's render inputs from its pinned commit and refuses any
// drift between the manifest and those bytes.

import fs from 'node:fs';
import { readSnapshot } from './source.mjs';
import { careerFor } from './select.mjs';
import { assertValidJob, canonicalJson } from './manifest.mjs';

export function resolveJobSources(job, repo) {
  const snapshot = readSnapshot({ repo, commit: job.source.commit });
  for (const [k, v] of Object.entries(snapshot.hashes)) {
    if (job.source[k] !== v) throw new Error(`source.${k} does not match commit ${job.source.commit}`);
  }
  const fresh = careerFor(snapshot, job.career.playerId);
  if (fresh.name !== job.career.name || fresh.clubs.length !== job.career.clubs.length
    || fresh.clubs.some((c, i) => c.name !== job.career.clubs[i].name)) {
    throw new Error('job career does not match the pinned roster');
  }
  fresh.clubs.forEach((c, i) => {
    if (c.crestSha256 !== job.career.clubs[i].crestSha256) throw new Error(`crest for club ${i + 1} differs from the job manifest`);
  });
  const player = snapshot.players.find(p => p.id === job.career.playerId);
  return { snapshot, crests: player.clubCrests.map(ref => snapshot.crests[ref].dataUrl) };
}

export function readJob(file) {
  let job;
  try { job = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(`cannot read job manifest ${file}`); }
  return assertValidJob(job);
}

export function writePrivateJson(file, value) {
  canonicalJson(value); // refuses undefined/NaN before anything is written
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
