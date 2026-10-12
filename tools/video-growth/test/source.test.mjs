import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, readSnapshot, dailyIds, compareLive } from '../lib/source.mjs';
import { careerFor, excludedDailyIds, selectCareer, stillValid } from '../lib/select.mjs';
import { syntheticIndex, syntheticResearch } from './synthetic-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HEAD = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// Eight players, six schedule slots (two days of three). Only p7/p8 are never
// a Daily answer, so any correct selection inside the window must be one of them.
const players = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`, name: `Player ${i + 1}`,
  clubs: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Alpha' }, { name: 'Gamma' }],
}));
const synth = (over = {}) => parseSnapshot({
  commit: 'b'.repeat(40),
  indexHtml: syntheticIndex({ players, scheduleIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], ...over }),
  researchJson: syntheticResearch(over.research ?? players),
});

test('snapshot reads index and research from the exact commit with hashes', () => {
  const snap = readSnapshot({ repo: REPO, commit: HEAD });
  assert.equal(snap.commit, HEAD);
  assert.ok(snap.players.length > 100);
  for (const k of ['indexSha256', 'rosterSha256', 'scheduleSha256', 'researchSha256']) assert.match(snap.hashes[k], /^[0-9a-f]{64}$/);
  assert.throws(() => readSnapshot({ repo: REPO, commit: 'f'.repeat(40) }), /commit/);
});

test('Daily rounds match the x-growth implementation for 60 days', async () => {
  process.env.DERABONA_REPO = REPO;
  const { dailyFor } = await import('../../x-growth/lib/daily.mjs');
  const snap = readSnapshot({ repo: REPO, commit: HEAD });
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2026, 8, 17 + i)).toISOString().slice(0, 10);
    assert.deepEqual(dailyIds(snap, date), dailyFor(date).rounds.map(r => r.playerId), date);
  }
});

test('repeated club spells are preserved in order', () => {
  const snap = readSnapshot({ repo: REPO, commit: HEAD });
  const c = careerFor(snap, 'cristiano-ronaldo');
  const names = c.clubs.map(x => x.name);
  assert.equal(names.filter(n => n === 'Manchester United').length, 2);
  assert.deepEqual(names, snap.players.find(p => p.id === 'cristiano-ronaldo').clubs.map(x => x.name));
  assert.ok(c.clubs.every(x => /^[0-9a-f]{64}$/.test(x.crestSha256)));
  assert.ok(c.evidenceSources.length >= 1);
});

test('every Daily round in the window is excluded, not only the first', () => {
  const snap = synth();
  // 2026-09-17 is challenge #1 (p1,p2,p3); #2 is p4,p5,p6; then it wraps.
  const ex = excludedDailyIds(snap, { fromDate: '2026-09-17', toDate: '2026-09-18' });
  assert.deepEqual([...ex].sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  for (let seed = 0; seed < 40; seed++) {
    const c = selectCareer(snap, { nowUtc: '2026-09-17T08:00:00Z', publishAtUtc: '2026-09-19T16:00:00Z', recentUses: [], seed: `s${seed}` });
    assert.ok(['p7', 'p8'].includes(c.playerId), `seed ${seed} chose ${c.playerId}`);
  }
});

test('the exclusion window runs from today through 14 days after publication', () => {
  const snap = synth();
  const c = selectCareer(snap, { nowUtc: '2026-09-17T08:00:00Z', publishAtUtc: '2026-10-19T16:00:00Z', recentUses: [], seed: 'x' });
  const ex = excludedDailyIds(snap, { fromDate: '2026-09-17', toDate: '2026-11-02' });
  assert.ok(!ex.has(c.playerId));
});

test('careers used by this lane in the last 30 days are skipped', () => {
  const snap = synth();
  const base = { nowUtc: '2026-09-17T08:00:00Z', publishAtUtc: '2026-09-19T16:00:00Z', seed: 'x' };
  const used = [{ playerId: 'p7', publishAtUtc: '2026-09-01T16:00:00Z' }];
  assert.equal(selectCareer(snap, { ...base, recentUses: used }).playerId, 'p8');
  const both = [...used, { playerId: 'p8', publishAtUtc: '2026-09-18T16:00:00Z' }];
  assert.throws(() => selectCareer(snap, { ...base, recentUses: both }), /no eligible career/);
  const old = [{ playerId: 'p7', publishAtUtc: '2026-08-01T16:00:00Z' }, { playerId: 'p8', publishAtUtc: '2026-08-01T16:00:00Z' }];
  assert.doesNotThrow(() => selectCareer(snap, { ...base, recentUses: old }));
});

test('missing research evidence or crest rejects a career', () => {
  const noEvidence = synth({ research: players.filter(p => p.id !== 'p7') });
  assert.throws(() => careerFor(noEvidence, 'p7'), /research/);
  const unsourced = synth({ research: players.map(p => p.id === 'p7' ? { ...p, sources: [] } : p) });
  assert.throws(() => careerFor(unsourced, 'p7'), /source/);
  const reordered = synth({ research: players.map(p => p.id === 'p7' ? { ...p, clubs: [...p.clubs].reverse() } : p) });
  assert.throws(() => careerFor(reordered, 'p7'), /club/);
  const noCrest = synth({ dropCrestFor: 'p7' });
  assert.throws(() => careerFor(noCrest, 'p7'), /crest/);
  assert.equal(selectCareer(noCrest, { nowUtc: '2026-09-17T08:00:00Z', publishAtUtc: '2026-09-19T16:00:00Z', recentUses: [], seed: 'x' }).playerId, 'p8');
});

test('careers outside the readable club range are not selected', () => {
  const long = players.map(p => p.id === 'p7' ? { ...p, clubs: Array.from({ length: 9 }, (_, i) => ({ name: `Club ${i}` })) } : p);
  const snap = synth({ players: long, research: long });
  for (let seed = 0; seed < 20; seed++) {
    assert.equal(selectCareer(snap, { nowUtc: '2026-09-17T08:00:00Z', publishAtUtc: '2026-09-19T16:00:00Z', recentUses: [], seed: `s${seed}` }).playerId, 'p8');
  }
});

test('a live site whose roster or schedule differs from the snapshot is flagged', () => {
  const snap = synth();
  assert.deepEqual(compareLive(snap, syntheticIndex({ players, scheduleIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] })), { rosterMatches: true, scheduleMatches: true, ok: true });
  const changedSchedule = compareLive(snap, syntheticIndex({ players, scheduleIds: ['p7', 'p2', 'p3', 'p4', 'p5', 'p6'] }));
  assert.equal(changedSchedule.ok, false);
  assert.equal(changedSchedule.scheduleMatches, false);
  const changedRoster = compareLive(snap, syntheticIndex({ players: players.slice(0, 7), scheduleIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] }));
  assert.equal(changedRoster.rosterMatches, false);
  assert.equal(compareLive(snap, '<html>maintenance</html>').ok, false);
});

test('a schedule change that makes the chosen career a Daily answer invalidates the job', () => {
  const snap = synth();
  const job = { career: { playerId: 'p7' }, source: { ...snap.hashes, commit: snap.commit }, targets: [{ publishAtUtc: '2026-09-19T16:00:00Z' }] };
  assert.deepEqual(stillValid(job, snap, { nowUtc: '2026-09-17T08:00:00Z' }), []);
  const moved = synth({ scheduleIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p7'] });
  const errors = stillValid(job, moved, { nowUtc: '2026-09-17T08:00:00Z' });
  assert.ok(errors.some(e => /schedule/.test(e)));
  assert.ok(errors.some(e => /Daily/.test(e)));
});
