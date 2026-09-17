import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(root, 'scripts', 'roster-batch.mjs');
const batch10 = path.join(root, 'research', 'player-addition-batch10');
const verifiedPlayers = JSON.parse(fs.readFileSync(path.join(root, 'research', 'verified-players.json'), 'utf8'));
const verifiedDistractors = JSON.parse(fs.readFileSync(path.join(root, 'research', 'verified-distractors.json'), 'utf8'));
const batchFiles = ['records.json', 'selected-ids.json', 'origin-systems.json', 'crest-assets.json', 'peer-bank-records.json', 'audit-allowlist.json'];


function copyBatch(target) {
  for (const name of batchFiles) fs.copyFileSync(path.join(batch10, name), path.join(target, name));
}

const runJson = (...args) => JSON.parse(execFileSync(process.execPath, [scriptPath, ...args], {
  cwd: root,
  encoding: 'utf8',
}));

test('audits the completed batch deterministically', () => {
  const result = runJson('audit', '--batch-dir', batch10);
  assert.equal(result.passed, true);
  assert.equal(result.state, 'integrated');
  assert.equal(result.counts.playable, verifiedPlayers.length);
  assert.equal(result.counts.bankOnly, verifiedDistractors.length);
  assert.equal(result.counts.candidates, verifiedPlayers.length + verifiedDistractors.length);
  assert.equal(result.coverage.gapCount, 0);
  assert.equal(result.records, 50);
  assert.equal(result.newCrestKeys.length, 0);
});

test('fails closed when a reviewed batch record loses an independent source domain', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-audit-'));
  copyBatch(temp);
  const recordsPath = path.join(temp, 'records.json');
  const records = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
  records[0].sources[1].url = records[0].sources[0].url;
  fs.writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(error => /independent source domains/.test(error)));
});

test('rejects a truncated crest that contains only the PNG signature', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-crest-'));
  copyBatch(temp);
  const crestsPath = path.join(temp, 'crest-assets.json');
  const crests = JSON.parse(fs.readFileSync(crestsPath, 'utf8'));
  const club = Object.keys(crests)[0];
  crests[club].dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  fs.writeFileSync(crestsPath, `${JSON.stringify(crests, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => new RegExp(`${club} crest dataUrl`).test(error)));
});


test('fails closed when selected-ids.json has an unsupported shape', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-selected-'));
  copyBatch(temp);
  fs.writeFileSync(path.join(temp, 'selected-ids.json'), '{}\n');
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /selected-ids\.json/);
});

test('fails closed when integrated batch records drift from canonical data', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-drift-'));
  copyBatch(temp);
  const recordsPath = path.join(temp, 'records.json');
  const records = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
  records[0].notes += ' Unpublished drift.';
  fs.writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => /differs between records\.json/.test(error)));
});

test('fails closed when inline PLAYERS drift from canonical verified players', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-inline-drift-'));
  fs.mkdirSync(path.join(temp, 'research'));
  fs.copyFileSync(path.join(root, 'research', 'verified-players.json'), path.join(temp, 'research', 'verified-players.json'));
  fs.copyFileSync(path.join(root, 'research', 'verified-distractors.json'), path.join(temp, 'research', 'verified-distractors.json'));
  const players = JSON.parse(fs.readFileSync(path.join(root, 'research', 'verified-players.json'), 'utf8'));
  const originalHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const original = JSON.stringify(players[0].notes);
  const html = originalHtml.replace(`"notes": ${original}`, `"notes": ${JSON.stringify(`${players[0].notes} Drift.`)}`);
  assert.notEqual(html, originalHtml);
  fs.writeFileSync(path.join(temp, 'index.html'), html);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--root', temp, '--batch-dir', batch10], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => /inline PLAYERS differs from research\/verified-players\.json/.test(error)));
});

test('rejects peer collisions before integration can overwrite the bank', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-peer-collision-'));
  copyBatch(temp);
  const peersPath = path.join(temp, 'peer-bank-records.json');
  const peers = JSON.parse(fs.readFileSync(peersPath, 'utf8'));
  peers[1].id = peers[0].id;
  fs.writeFileSync(peersPath, `${JSON.stringify(peers, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => /Duplicate peer id/.test(error)));
});

test('rejects an integrated peer whose id collides with a playable candidate', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-integrated-peer-collision-'));
  copyBatch(temp);
  const peersPath = path.join(temp, 'peer-bank-records.json');
  const peers = JSON.parse(fs.readFileSync(peersPath, 'utf8'));
  peers[0].id = 'cristiano-ronaldo';
  fs.writeFileSync(peersPath, `${JSON.stringify(peers, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => /collides with an existing candidate/.test(error)));
});

test('audit rejects generated incorrectOptions drift and integrate repairs it', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-options-drift-'));
  fs.mkdirSync(path.join(temp, 'research'));
  fs.copyFileSync(path.join(root, 'research', 'verified-players.json'), path.join(temp, 'research', 'verified-players.json'));
  fs.copyFileSync(path.join(root, 'research', 'verified-distractors.json'), path.join(temp, 'research', 'verified-distractors.json'));
  const originalHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const html = originalHtml.replace('      "Zinedine Zidane",\n', '');
  assert.notEqual(html, originalHtml);
  fs.writeFileSync(path.join(temp, 'index.html'), html);

  const auditResult = spawnSync(process.execPath, [scriptPath, 'audit', '--root', temp, '--batch-dir', batch10], { cwd: root, encoding: 'utf8' });
  assert.equal(auditResult.status, 1);
  assert.ok(JSON.parse(auditResult.stdout).errors.some(error => /generated inline roster data differs/.test(error)));

  const repair = runJson('integrate', '--root', temp, '--batch-dir', batch10, '--write');
  assert.equal(repair.changed, true);
  assert.equal(repair.written, true);
  assert.equal(runJson('audit', '--root', temp, '--batch-dir', batch10).passed, true);
});

test('requires explicit exact allowlisting for integrated historical origin mismatches', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-origin-allowlist-'));
  copyBatch(temp);
  fs.writeFileSync(path.join(temp, 'audit-allowlist.json'), '{"originMismatches":[],"careerSignatureCollisions":[]}\n');
  const result = spawnSync(process.execPath, [scriptPath, 'audit', '--batch-dir', temp], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => /predrag-mijatovic runtime origin/.test(error)));
});

test('data-only guard detects protected executable changes', () => {
  assert.equal(runJson('guard', '--base', 'HEAD').passed, true);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-guard-'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('const GRACE_MS = 2000', 'const GRACE_MS = 2001');
  const changed = path.join(temp, 'index.html');
  fs.writeFileSync(changed, html);
  const result = spawnSync(process.execPath, [scriptPath, 'guard', '--base', 'HEAD', '--html', changed], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, false);
  assert.ok(report.changedProtectedRegions.includes('script:game-model'));

  const markup = path.join(temp, 'markup.html');
  fs.writeFileSync(markup, fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<body>', '<body data-unreviewed="true">'));
  const markupResult = spawnSync(process.execPath, [scriptPath, 'guard', '--base', 'HEAD', '--html', markup], { cwd: root, encoding: 'utf8' });
  assert.equal(markupResult.status, 1);
  assert.ok(JSON.parse(markupResult.stdout).changedProtectedRegions.includes('html:tag-structure'));
});

test('promotion planner reports deterministic coverage impact before research', () => {
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'research', 'verified-distractors.json'), 'utf8'));
  const result = runJson('promotions', '--ids', bank[0].id);
  assert.equal(result.promotions.length, 1);
  assert.equal(result.promotions[0].id, bank[0].id);
  assert.ok(Array.isArray(result.affectedTargets));
  assert.ok(Array.isArray(result.gaps));
  for (const target of result.affectedTargets) assert.ok(target.after < target.before);
});

test('generic forward migration writer is reproducible, root-relative, and confined to new migrations', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-migration-'));
  fs.copyFileSync(path.join(root, 'index.html'), path.join(temp, 'index.html'));
  fs.mkdirSync(path.join(temp, 'supabase', 'migrations'), { recursive: true });
  const relativeOutput = 'supabase/migrations/209901010001_forward.sql';
  const output = path.join(fs.realpathSync(temp), relativeOutput);
  const written = runJson('migration', '--root', temp, '--output', relativeOutput, '--write');
  assert.equal(written.players, verifiedPlayers.length);
  assert.equal(written.candidates, verifiedPlayers.length + verifiedDistractors.length);
  assert.equal(written.output, output);
  assert.equal(written.written, true);
  const sql = fs.readFileSync(output, 'utf8');
  assert.match(sql, new RegExp(`Generated forward roster migration from the reviewed ${verifiedPlayers.length}-player runtime model`));
  assert.match(sql, /never rewrites results or active rounds/);
  assert.match(sql, /delete from ranked_private\.rivals/);
  const checked = runJson('migration', '--root', temp, '--output', relativeOutput, '--check');
  assert.equal(checked.check, true);
  const overwrite = spawnSync(process.execPath, [scriptPath, 'migration', '--root', temp, '--output', relativeOutput, '--write'], { cwd: root, encoding: 'utf8' });
  assert.equal(overwrite.status, 1);
  assert.match(overwrite.stderr, /refusing to overwrite existing migration/i);
  fs.appendFileSync(output, '-- stale\n');
  const stale = spawnSync(process.execPath, [scriptPath, 'migration', '--root', temp, '--output', relativeOutput, '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale/i);

  const outside = path.join(temp, 'outside.sql');
  const escaped = spawnSync(process.execPath, [scriptPath, 'migration', '--root', temp, '--output', outside, '--write'], { cwd: root, encoding: 'utf8' });
  assert.equal(escaped.status, 1);
  assert.match(escaped.stderr, /supabase\/migrations/);
  assert.equal(fs.existsSync(outside), false);

  const symlinkTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-migration-outside-'));
  fs.symlinkSync(symlinkTarget, path.join(temp, 'supabase', 'migrations', 'escape'), 'dir');
  const symlinkEscape = spawnSync(
    process.execPath,
    [scriptPath, 'migration', '--root', temp, '--output', 'supabase/migrations/escape/209901010002_forward.sql', '--write'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(symlinkEscape.status, 1);
  assert.match(symlinkEscape.stderr, /supabase\/migrations/);
  assert.equal(fs.existsSync(path.join(symlinkTarget, '209901010002_forward.sql')), false);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-migration-symlink-root-'));
  fs.copyFileSync(path.join(root, 'index.html'), path.join(symlinkRoot, 'index.html'));
  fs.mkdirSync(path.join(symlinkRoot, 'supabase'));
  const migrationsTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-roster-migrations-target-'));
  fs.symlinkSync(migrationsTarget, path.join(symlinkRoot, 'supabase', 'migrations'), 'dir');
  const migrationsSymlink = spawnSync(
    process.execPath,
    [scriptPath, 'migration', '--root', symlinkRoot, '--output', 'supabase/migrations/209901010003_forward.sql', '--write'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(migrationsSymlink.status, 1);
  assert.match(migrationsSymlink.stderr, /must not be a symbolic link/);
  assert.equal(fs.existsSync(path.join(migrationsTarget, '209901010003_forward.sql')), false);
});

test('keeps baseline signature collisions from blocking a new pending batch but rejects new collisions', async () => {
  const { findProjectionIssues } = await import(pathToFileURL(scriptPath));
  const legacyA = { id: 'legacy-a', name: 'Legacy A', clubs: ['Only FC'] };
  const legacyB = { id: 'legacy-b', name: 'Legacy B', clubs: ['Only FC'] };
  const unique = { id: 'new-unique', name: 'New Unique', clubs: ['Other FC'] };
  const batchIds = new Set(['new-unique']);
  const inherited = findProjectionIssues([legacyA, legacyB, unique], [], {}, { state: 'pending', baselinePlayers: [legacyA, legacyB], batchIds });
  assert.equal(inherited.errors.length, 0);
  assert.equal(inherited.warnings.length, 1);
  const integrated = findProjectionIssues([legacyA, legacyB, unique], [], {}, { state: 'integrated', batchIds });
  assert.equal(integrated.errors.length, 0);
  assert.equal(integrated.warnings.length, 1);
  const collision = findProjectionIssues([legacyA, legacyB, { ...unique, clubs: ['Only FC'] }], [], {}, { state: 'pending', baselinePlayers: [legacyA, legacyB], batchIds });
  assert.ok(collision.errors.some(error => /new-unique/.test(error)));
  const attemptedWaiver = findProjectionIssues(
    [legacyA, legacyB, { ...unique, clubs: ['Only FC'] }],
    [],
    { careerSignatureCollisions: [{ ids: ['legacy-b', 'new-unique'], reason: 'Not historical yet.' }] },
    { state: 'pending', baselinePlayers: [legacyA, legacyB], batchIds },
  );
  assert.ok(attemptedWaiver.errors.some(error => /new-unique/.test(error)));
});

test('core integration is deterministic and updates coordinated data only', async () => {
  const { integrateCore } = await import(pathToFileURL(scriptPath));
  const oldPlayer = {
    id: 'old', name: 'Old Player', continent: 'Europe', country: 'France', position: 'Forward',
    clubs: [{ name: 'Old FC', years: '2000–2005' }], clubCrests: ['old-url'], incorrectOptions: [],
    competitions: [], notes: 'Old.', verifiedAt: '2026-01-01', status: 'retired', sources: [{ url: 'https://a.example/old' }, { url: 'https://b.example/old' }],
  };
  const promoted = {
    id: 'new', name: 'New Player', continent: 'Europe', country: 'France', position: 'Forward',
    clubs: [{ name: 'New FC', years: '2001–2006' }], competitions: [], notes: 'New.</script><script>alert(1)</script>', verifiedAt: '2026-01-01', status: 'retired',
    sources: [{ url: 'https://a.example/new' }, { url: 'https://b.example/new' }], esNotes: 'Nuevo.', esClubNotes: { 0: 'Primero.' },
  };
  const bank = [{ id: 'new', name: 'New Player', country: 'France', position: 'Forward', start: 2001, end: 2006, clubs: ['New FC'], system: 'france', region: 'europe', sources: [{ url: 'https://a.example/new', excerpt: 'a' }, { url: 'https://b.example/new', excerpt: 'b' }] }];
  const html = `<script id="roster-data">const PLAYERS = ${JSON.stringify([oldPlayer])};</script>\n<script id="crest-data">const CREST_ASSETS = ${JSON.stringify({ 'old-url': { sourceUrl: 'old-url', dataUrl: 'data:image/png;base64,AA==' } })};</script>\n<script id="locale-data">const SPANISH_NOTES = ${JSON.stringify({ old: { notes: 'Viejo.', clubNotes: [''] } })};</script>\n<script id="game-model">const DISTRACTOR_PROFILES = ${JSON.stringify(bank)};\nconst ORIGIN_CLUBS = {\n    france: ["Old FC"]\n  };</script>`;
  const input = {
    html,
    verifiedPlayers: [oldPlayer],
    bank,
    records: [promoted],
    peers: [],
    origins: { new: 'belgium' },
    crestAssets: { 'New FC': { sourceURL: 'new-url', sourcePage: 'https://club.example', sourceTitle: 'New FC', dataUrl: 'data:image/png;base64,AA==' } },
  };
  const once = integrateCore(input);
  assert.throws(
    () => integrateCore({ ...input, origins: { new: 'belgium};alert(1);//' } }),
    /Invalid origin system/,
  );
  assert.equal(once.verifiedPlayers.length, 2);
  assert.equal(once.bank.length, 0);
  assert.match(once.html, /"New Player"/);
  assert.match(once.html, /"Nuevo\."/);
  assert.match(once.html, /"New FC"/);
  assert.match(once.html, /belgium: \["New FC"\]/);
  assert.doesNotMatch(once.html, /<\/script><script>alert\(1\)<\/script>/);
  assert.match(once.html, /New\.\\u003c\/script>\\u003cscript>alert\(1\)\\u003c\/script>/);
  assert.doesNotThrow(() => new vm.Script(once.html.match(/<script id="game-model">([\s\S]*?)<\/script>/)[1]));
  const evilClub = 'Evil FC</script><script>alert(99)</script>';
  const evil = integrateCore({
    ...input,
    records: [{ ...promoted, clubs: [{ name: evilClub, years: '2001–2006' }] }],
    crestAssets: { [evilClub]: input.crestAssets['New FC'] },
  });
  assert.doesNotMatch(evil.html, /Evil FC<\/script><script>alert\(99\)<\/script>/);
  assert.match(evil.html, /Evil FC\\u003c\/script>\\u003cscript>alert\(99\)\\u003c\/script>/);
  const twice = integrateCore({ ...input, html: once.html, verifiedPlayers: once.verifiedPlayers, bank: once.bank });
  assert.deepEqual(twice, once);
});
