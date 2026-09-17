import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = new URL('../.agents/skills/derabona-player-addition/SKILL.md', import.meta.url);
const referencePath = new URL('../.agents/skills/derabona-player-addition/references/player-record.md', import.meta.url);
const discoveryReferencePath = new URL('../.agents/skills/derabona-player-addition/references/player-discovery.md', import.meta.url);
const shortlistTemplatePath = new URL('../.agents/skills/derabona-player-addition/templates/candidate-shortlist.json', import.meta.url);
const shortlistValidatorPath = new URL('../.agents/skills/derabona-player-addition/scripts/validate-shortlist.mjs', import.meta.url);
const exporterPath = new URL('../scripts/export-ranked-roster.mjs', import.meta.url);
const optimizerPath = new URL('../research/optimize-crests.py', import.meta.url);
const embedDistractorsPath = new URL('../research/embed-distractors.py', import.meta.url);
const rosterBatchAutomationPath = new URL('../scripts/roster-batch.mjs', import.meta.url);
const automationReferencePath = new URL('../.agents/skills/derabona-player-addition/references/automation.md', import.meta.url);

const readSkill = () => fs.readFileSync(path, 'utf8');

test('project-local player-addition skill has valid, focused metadata', () => {
  const skill = readSkill();
  assert.ok(skill.startsWith('---\n'));
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, 'frontmatter must be present');
  assert.match(frontmatter[1], /^name: derabona-player-addition$/m);
  const description = frontmatter[1].match(/^description: (.+)$/m)?.[1]?.replace(/^"|"$/g, '');
  assert.ok(description);
  assert.ok(description.length <= 60, `description is ${description.length} characters`);
  assert.ok(description.endsWith('.'));
  assert.match(description, /^Discover and add /);
  assert.match(frontmatter[1], /^platforms: \[linux, macos, windows\]$/m);
  assert.doesNotMatch(skill, /\/Users\/|\/home\//);
});

test('repository exposes one canonical skill to major agent harnesses', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\.agents\/skills\/derabona-player-addition\/SKILL\.md/);
  assert.match(readme, /discovering, researching and integrating/);
  assert.match(readme, /hermes skills trust/);
  const canonical = fs.realpathSync(new URL('../.agents/skills/derabona-player-addition', import.meta.url));
  for (const harness of ['.claude', '.codex', '.gemini']) {
    const alias = new URL(`../${harness}/skills/derabona-player-addition`, import.meta.url);
    assert.ok(fs.lstatSync(alias).isSymbolicLink(), `${harness} skill alias must be a symlink`);
    assert.equal(fs.realpathSync(alias), canonical, `${harness} alias must resolve to the canonical skill`);
    assert.match(readme, new RegExp(`\\${harness}/skills/derabona-player-addition`));
  }
});

test('skill preserves the complete researched-player workflow', () => {
  const skill = readSkill();
  assert.ok(fs.existsSync(referencePath), 'player-record reference must exist');
  const reference = fs.readFileSync(referencePath, 'utf8');
  assert.match(skill, /references\/player-record\.md/);
  assert.doesNotMatch(reference, /\/Users\/|\/home\//);
  for (const field of ['"id"', '"clubs"', '"sources"', '"verifiedAt"', '"competitions"']) {
    assert.ok(reference.includes(field), `reference missing ${field}`);
  }
  for (const status of ['active', 'retired', 'deceased', 'signing-announced']) {
    assert.ok(reference.includes(status), `reference missing status ${status}`);
  }
  for (const required of [
    'research/data-policy.md',
    'research/verified-players.json',
    'CAREER_SOURCES.md',
    'DATA_AUDIT.md',
    'research/game-ledger.json',
    'research/reaudit-citations.json',
    'ORIGIN_CLUBS',
    'research/assemble-distractors.py',
    'research/embed-distractors.py',
    'research/audit-distractor-coverage.mjs',
    'scripts/export-ranked-roster.mjs --check',
    'two independently retrieved domains',
    'English and Spanish',
    'forward migration',
    'saved deck',
    'Do not deploy',
  ]) assert.ok(skill.includes(required), `missing ${required}`);
  assert.doesNotMatch(skill, /\b110\b/, 'the workflow must derive the live count instead of freezing it');
});

test('skill defines checkable phases and fail-closed gates', () => {
  const skill = readSkill();
  for (const heading of [
    '## When to Use',
    '## Prerequisites',
    '## Procedure',
    '## Pitfalls',
    '## Verification',
  ]) assert.ok(skill.includes(heading), `missing ${heading}`);
  assert.match(skill, /identical ordered club careers/i);
  assert.match(skill, /debut-year difference.*8/i);
  assert.match(skill, /promotion/i);
  assert.match(skill, /literal excerpts/i);
  assert.match(skill, /current roster count/i);
});

test('skill keeps data-only roster releases on a proportional fast path', () => {
  const skill = readSkill();
  assert.match(skill, /Data-only lane/);
  assert.match(skill, /roster-batch\.mjs promotions/);
  assert.match(skill, /exact set difference between displayed club keys/i);
  assert.match(skill, /deep archival.*ambiguous cases/i);
  assert.match(skill, /full Node\/native-PostgreSQL suite \*\*once\*\*/);
  assert.match(skill, /browser\/offline\/storage-denied\/responsive playthroughs are not a default release gate/i);
  assert.match(skill, /duplicate run as additional evidence/i);
  assert.match(skill, /second code\/docs commit solely to replace a pre-deployment placeholder/i);
});

test('skill delegates deterministic batch work to the reusable automation', () => {
  const skill = readSkill();
  assert.equal(fs.existsSync(rosterBatchAutomationPath), true, 'roster batch automation must exist');
  assert.equal(fs.existsSync(automationReferencePath), true, 'automation reference must exist');
  assert.match(skill, /scripts\/roster-batch\.mjs audit/);
  assert.match(skill, /scripts\/roster-batch\.mjs integrate/);
  assert.match(skill, /scripts\/roster-batch\.mjs guard/);
  assert.match(skill, /scripts\/roster-batch\.mjs migration/);
  assert.match(skill, /references\/automation\.md/);
  assert.match(fs.readFileSync(automationReferencePath, 'utf8'), /does not decide historical truth/i);
});

test('skill can discover and rank new player candidates before research', () => {
  const skill = readSkill();
  assert.ok(fs.existsSync(discoveryReferencePath), 'player-discovery reference must exist');
  assert.ok(fs.existsSync(shortlistTemplatePath), 'candidate-shortlist template must exist');
  const discovery = fs.readFileSync(discoveryReferencePath, 'utf8');
  const template = JSON.parse(fs.readFileSync(shortlistTemplatePath, 'utf8'));
  assert.equal(fs.existsSync(shortlistValidatorPath), true, 'shortlist validator must exist');

  assert.match(skill, /references\/player-discovery\.md/);
  assert.match(skill, /templates\/candidate-shortlist\.json/);
  assert.match(skill, /web_search/);
  assert.match(skill, /web_extract/);
  assert.match(skill, /at least three times the target count/i);
  assert.match(skill, /selected, reserve and rejected/i);
  assert.match(discovery, /targetCount.*greater than zero/i);
  assert.match(discovery, /fewer than `targetCount`.*do not lower/i);

  for (const section of [
    '## Baseline Gap Audit',
    '## Candidate Source Families',
    '## Hard Gates',
    '## Candidate Scorecard',
    '## Selection Rules',
    '## Shortlist Validation',
    '## Required Output',
  ]) assert.ok(discovery.includes(section), `discovery reference missing ${section}`);
  for (const dimension of [
    'recognizability',
    'careerDistinctiveness',
    'rosterBalance',
    'evidenceAvailability',
    'crestWorkload',
    'rivalCoverage',
  ]) assert.ok(discovery.includes(dimension), `discovery reference missing score ${dimension}`);

  assert.deepEqual(Object.keys(template).sort(), ['baseline', 'candidates', 'constraints', 'mode', 'results', 'summary', 'targetCount']);
  assert.equal(template.mode, 'discovery');
  assert.deepEqual(Object.keys(template.results).sort(), ['rejected', 'reserve', 'selected']);
  assert.deepEqual(Object.keys(template.summary).sort(), [
    'expectedBankOnlyProfiles', 'expectedNewCrestKeys', 'expectedPlayableRecords', 'unresolvedDecisions',
  ]);
  assert.deepEqual(Object.keys(template.baseline.longlistCounts).sort(), ['afterDeduplication', 'beforeDeduplication', 'discovered']);
  assert.equal(template.baseline.rankedCompetitionCount, 0);
  assert.deepEqual(template.summary.expectedNewCrestKeys, []);
  assert.equal(template.candidates.length, 1);
  const candidate = template.candidates[0];
  assert.equal(candidate.existingStatus, 'new');
  assert.equal(candidate.hardGates.promotionHandled, null, 'new candidates must mark promotion as not applicable');
  assert.equal(candidate.existingMatch.dataset, null);
  assert.equal(candidate.hardGates.bankStatusResolved, false);
  assert.equal(candidate.discoveredFrom.length, 1);
  assert.deepEqual(Object.keys(candidate.discoveredFrom[0]).sort(), ['query', 'retrievedAt', 'sourceFamily', 'url']);
  for (const key of ['name', 'proposedId', 'existingMatch', 'evidenceLeads', 'scores', 'hardGates', 'decision', 'rationale', 'rejectionReason']) {
    assert.ok(Object.hasOwn(candidate, key), `shortlist candidate missing ${key}`);
  }
  assert.deepEqual(Object.keys(candidate.scores).sort(), [
    'careerDistinctiveness', 'crestWorkload', 'evidenceAvailability',
    'recognizability', 'rivalCoverage', 'rosterBalance',
  ]);
  assert.deepEqual(Object.keys(candidate.hardGates).sort(), [
    'bankStatusResolved', 'constraintsFit', 'distinctCareer', 'identityResolved',
    'notAlreadyPlayable', 'promotionHandled', 'rivalPlan', 'seniorScopePlausible',
    'twoDomainsLikely',
  ]);
  assert.equal(candidate.totalScore, 0);
  assert.match(discovery, /totalScore.*exact sum/i);
  assert.match(discovery, /distinct organizational domains/i);
  assert.match(discovery, /decision.*selected.*reserve.*reject/i);
  assert.match(discovery, /existingStatus.*new.*bank-promotion.*already-playable/i);
  assert.doesNotMatch(discovery, /existingStatus.*duplicate/i);
  assert.match(discovery, /bankStatusResolved/);
  assert.match(discovery, /results.*partition.*every candidate/i);
  assert.match(skill, /scripts\/validate-shortlist\.mjs/);
  assert.match(discovery, /node \.agents\/skills\/derabona-player-addition\/scripts\/validate-shortlist\.mjs/);
});

test('skill handles the frozen ranked export without an impossible post-edit gate', () => {
  const skill = readSkill();
  const exporter = fs.readFileSync(exporterPath, 'utf8');
  assert.match(exporter, /202609130002_ranked_roster\.sql/);
  assert.match(exporter, /process\.argv\.includes\('--check'\).*assert\.equal/);
  assert.equal(
    (skill.match(/terminal\(command="node scripts\/export-ranked-roster\.mjs --check"/g) || []).length,
    1,
    '--check must appear only in the pre-edit baseline phase',
  );
  assert.match(skill, /expected to fail after the inline roster changes/i);
  assert.match(skill, /not a post-edit completion gate/i);
  assert.match(skill, /tests\/ranked-backend\.test\.mjs/);
  assert.match(skill, /database-vs-inline assertions/i);
});

test('skill respects crest optimizer and distractor embed boundaries', () => {
  const skill = readSkill();
  const optimizer = fs.readFileSync(optimizerPath, 'utf8');
  const embed = fs.readFileSync(embedDistractorsPath, 'utf8');
  assert.match(optimizer, /assert set\(crests\)==set\(current\)/);
  assert.match(skill, /different crest-key set/i);
  assert.match(skill, /do not run[^\n]*optimize-crests\.py[^\n]*pre-addition/i);
  assert.match(skill, /optimize only the new source image/i);
  assert.match(embed, /BEGIN DISTRACTOR BANK/);
  assert.doesNotMatch(embed, /incorrectOptions/);
  assert.match(skill, /do \*\*not\*\* rewrite playable `incorrectOptions`/);
});
