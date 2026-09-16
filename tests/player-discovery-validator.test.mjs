import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../', import.meta.url);
const validator = new URL('../.agents/skills/derabona-player-addition/scripts/validate-shortlist.mjs', import.meta.url);
const templatePath = new URL('../.agents/skills/derabona-player-addition/templates/candidate-shortlist.json', import.meta.url);
const bankPath = new URL('../research/verified-distractors.json', import.meta.url);

function makeCandidate(id, decision) {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const candidate = structuredClone(template.candidates[0]);
  Object.assign(candidate, {
    name: `Synthetic Candidate ${id}`,
    proposedId: id,
    discoveredFrom: [{
      sourceFamily: 'official competition or federation material',
      query: `synthetic query ${id}`,
      url: `https://discovery.example/${id}`,
      retrievedAt: '2026-09-16T08:00:00Z',
    }],
    country: 'Testland',
    position: 'Midfielder',
    firstSeniorSystem: 'Testland',
    era: { start: 1990, end: 2000 },
    evidenceLeads: [
      { url: `https://source-one.example/${id}`, domain: 'source-one.example', reason: 'career overview' },
      { url: `https://source-two.example/${id}`, domain: 'source-two.example', reason: 'independent corroboration' },
    ],
    scores: {
      recognizability: 2,
      careerDistinctiveness: 2,
      rosterBalance: 2,
      evidenceAvailability: 2,
      crestWorkload: 2,
      rivalCoverage: 2,
    },
    totalScore: 12,
    hardGates: {
      notAlreadyPlayable: true,
      bankStatusResolved: true,
      promotionHandled: null,
      distinctCareer: true,
      seniorScopePlausible: true,
      twoDomainsLikely: true,
      identityResolved: true,
      rivalPlan: true,
      constraintsFit: true,
    },
    decision,
    rationale: decision === 'selected' ? 'Best balanced eligible candidate.' : 'Recorded for comparison.',
    rejectionReason: decision === 'reject' ? 'Lower value than the selected candidate.' : '',
  });
  return candidate;
}

function makeValidShortlist() {
  const shortlist = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  shortlist.targetCount = 1;
  shortlist.baseline = {
    commit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-09-16T08:00:00Z',
    playableCount: 110,
    bankOnlyCount: 177,
    rankedCompetitionCount: 6,
    gaps: ['underrepresented test system'],
    longlistCounts: { discovered: 4, beforeDeduplication: 4, afterDeduplication: 3 },
  };
  shortlist.candidates = [
    makeCandidate('synthetic-selected', 'selected'),
    makeCandidate('synthetic-reserve', 'reserve'),
    makeCandidate('synthetic-reject', 'reject'),
  ];
  shortlist.results = {
    selected: ['synthetic-selected'],
    reserve: ['synthetic-reserve'],
    rejected: ['synthetic-reject'],
  };
  shortlist.summary = {
    expectedPlayableRecords: 111,
    expectedBankOnlyProfiles: 177,
    expectedNewCrestKeys: [],
    unresolvedDecisions: [],
  };
  return shortlist;
}

function runValidator(shortlist) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derabona-shortlist-'));
  const file = path.join(dir, 'shortlist.json');
  fs.writeFileSync(file, JSON.stringify(shortlist));
  const result = spawnSync(process.execPath, [validator.pathname, file], {
    cwd: repoRoot.pathname,
    encoding: 'utf8',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('shortlist validator accepts a complete, internally consistent discovery result', () => {
  assert.equal(fs.existsSync(validator), true, 'validator script must exist');
  const result = runValidator(makeValidShortlist());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"passed":true/);
});

test('shortlist validator rejects inconsistent scores and result partitions', () => {
  const shortlist = makeValidShortlist();
  shortlist.candidates[0].totalScore = 17;
  shortlist.results.selected = ['synthetic-reserve'];
  const result = runValidator(shortlist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /totalScore/);
  assert.match(result.stderr, /results\.selected/);
});

test('shortlist validator rejects two subdomains controlled by one organization', () => {
  const shortlist = makeValidShortlist();
  shortlist.candidates[0].evidenceLeads = [
    { url: 'https://news.publisher.example/a', domain: 'news.publisher.example', reason: 'career overview' },
    { url: 'https://stats.publisher.example/a', domain: 'stats.publisher.example', reason: 'apparent corroboration' },
  ];
  const result = runValidator(shortlist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /distinct organizational domains/);
});

test('shortlist validator verifies bank-promotion match metadata against the live bank', () => {
  const shortlist = makeValidShortlist();
  const bankPlayer = JSON.parse(fs.readFileSync(bankPath, 'utf8'))[0];
  const candidate = shortlist.candidates[1];
  candidate.name = bankPlayer.name;
  candidate.proposedId = bankPlayer.id;
  candidate.existingStatus = 'bank-promotion';
  candidate.existingMatch = {
    dataset: 'verified-distractors',
    id: 'wrong-id',
    name: bankPlayer.name,
    evidenceFile: 'research/verified-distractors.json',
  };
  candidate.hardGates.promotionHandled = true;
  shortlist.results.reserve = [bankPlayer.id];

  const result = runValidator(shortlist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existingMatch\.id/);
});

test('shortlist validator permits an exact supplied-name batch without a 3x discovery longlist', () => {
  const shortlist = makeValidShortlist();
  shortlist.mode = 'supplied';
  shortlist.candidates = [shortlist.candidates[0]];
  shortlist.results = { selected: ['synthetic-selected'], reserve: [], rejected: [] };
  shortlist.baseline.longlistCounts = { discovered: 1, beforeDeduplication: 1, afterDeduplication: 1 };

  const result = runValidator(shortlist);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
