import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, digest, validateJob } from '../lib/manifest.mjs';
import { defaultConfig, validateConfig, loadConfig, writeGate } from '../lib/config.mjs';
import { validJob, validConfig } from './fixtures.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vg-manifest-'));

test('default config ships disabled with no targets and zero caps', () => {
  const c = defaultConfig();
  assert.equal(c.enabled, false);
  assert.deepEqual(c.buffer.channels, []);
  assert.equal(c.caps.variableUsd, 0);
  assert.equal(c.caps.ttsCharacters, 0);
  assert.equal(c.tts.authorized, false);
  assert.deepEqual(validateConfig(c), []);
});

test('missing config file loads as the disabled default', () => {
  const c = loadConfig(path.join(tmp(), 'config.json'));
  assert.equal(c.enabled, false);
});

test('config rejects non-boolean enable, unknown platforms and unknown keys', () => {
  assert.ok(validateConfig(validConfig({ enabled: 'yes' })).length);
  const bad = validConfig();
  bad.buffer.channels[0].platform = 'instagram';
  assert.ok(validateConfig(bad).some(e => /platform/.test(e)));
  assert.ok(validateConfig({ ...validConfig(), surprise: 1 }).some(e => /unknown/.test(e)));
});

test('a malformed config file fails closed instead of defaulting', () => {
  const file = path.join(tmp(), 'config.json');
  fs.writeFileSync(file, '{"enabled": true,');
  assert.throws(() => loadConfig(file), /config/);
});

test('write gate refuses disabled, paused and non-allowlisted targets', () => {
  const dir = tmp();
  const target = { platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmockmockmockmockmockmo' };
  assert.throws(() => writeGate(defaultConfig(), { stateDir: dir, target }), /disabled/);
  assert.throws(() => writeGate(validConfig(), { stateDir: dir, target: { ...target, channelId: 'other' } }), /allowlist/);
  assert.throws(() => writeGate(validConfig(), { stateDir: dir, target: { ...target, nativeAccount: 'UCother' } }), /allowlist/);
  fs.writeFileSync(path.join(dir, 'PAUSE'), '');
  assert.throws(() => writeGate(validConfig(), { stateDir: dir, target }), /PAUSE/);
  fs.unlinkSync(path.join(dir, 'PAUSE'));
  assert.doesNotThrow(() => writeGate(validConfig(), { stateDir: dir, target }));
});

test('a complete job validates', () => {
  assert.deepEqual(validateJob(validJob()), []);
});

test('job rejects missing source, missing license and unknown schema', () => {
  assert.ok(validateJob(validJob({ source: undefined })).some(e => /source/.test(e)));
  assert.ok(validateJob(validJob({ license: undefined })).some(e => /license/.test(e)));
  assert.ok(validateJob(validJob({ schemaVersion: 2 })).some(e => /schemaVersion/.test(e)));
  const short = validJob(); short.source.commit = 'abc';
  assert.ok(validateJob(short).some(e => /commit/.test(e)));
});

test('job rejects a target without an explicit privacy choice', () => {
  for (const privacy of [undefined, null, '']) {
    const job = validJob(); job.targets[0].privacy = privacy;
    assert.ok(validateJob(job).some(e => /privacy/.test(e)), `privacy=${privacy}`);
  }
  const job = validJob(); job.targets[0].privacy = 'everyone';
  assert.ok(validateJob(job).some(e => /privacy/.test(e)));
});

test('job rejects unknown target platforms and non-UTC times', () => {
  const job = validJob(); job.targets[0].platform = 'instagram';
  assert.ok(validateJob(job).some(e => /platform/.test(e)));
  for (const t of ['2026-10-19T16:00:00+01:00', '2026-10-19 16:00', '2026-10-19T16:00:00.000Z', 'soon']) {
    const j = validJob(); j.targets[0].publishAtUtc = t;
    assert.ok(validateJob(j).some(e => /publishAtUtc/.test(e)), t);
  }
});

test('canonical JSON sorts keys and refuses implicit values', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, { d: 'x', c: 2 }] }), '{"a":[true,null,{"c":2,"d":"x"}],"b":1}');
  assert.throws(() => canonicalJson({ a: undefined }), /undefined/);
  assert.throws(() => canonicalJson({ a: NaN }), /finite/);
  assert.throws(() => canonicalJson({ a: new Date() }), /plain/);
});

test('digest ignores key order but changes on any tampering', () => {
  const job = validJob();
  const reordered = Object.fromEntries(Object.entries(job).reverse());
  assert.equal(digest(job), digest(reordered));
  assert.match(digest(job), /^[0-9a-f]{64}$/);
  const tampered = validJob(); tampered.career.clubs[1].name = 'Club C';
  assert.notEqual(digest(tampered), digest(job));
  const retimed = validJob(); retimed.targets[0].publishAtUtc = '2026-10-19T16:00:01Z';
  assert.notEqual(digest(retimed), digest(job));
});
