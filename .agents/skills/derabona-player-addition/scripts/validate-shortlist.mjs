#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shortlistPath = process.argv[2];
if (!shortlistPath) {
  console.error(JSON.stringify({ passed: false, errors: ['Usage: node validate-shortlist.mjs <shortlist.json>'] }));
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../..');
const playablePath = path.join(repoRoot, 'research', 'verified-players.json');
const bankPath = path.join(repoRoot, 'research', 'verified-distractors.json');
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function loadJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${label} could not be read as JSON: ${error.message}`);
    return null;
  }
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameStrings(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function organizationalDomain(hostname) {
  const host = String(hostname ?? '').trim().toLocaleLowerCase('en-US').replace(/^www\./, '').replace(/\.$/, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const commonSecondLevelSuffixes = new Set([
    'co.uk', 'org.uk', 'com.ar', 'com.br', 'com.co', 'com.mx', 'com.uy',
  ]);
  const lastTwo = parts.slice(-2).join('.');
  return commonSecondLevelSuffixes.has(lastTwo)
    ? parts.slice(-3).join('.')
    : lastTwo;
}

const shortlist = loadJson(path.resolve(shortlistPath), 'shortlist');
const playable = loadJson(playablePath, 'playable roster');
const bank = loadJson(bankPath, 'distractor bank');

if (!shortlist || !Array.isArray(playable) || !Array.isArray(bank)) {
  console.error(JSON.stringify({ passed: false, errors }));
  process.exit(1);
}

const targetCount = shortlist.targetCount;
const mode = shortlist.mode;
const candidates = shortlist.candidates;
check(mode === 'discovery' || mode === 'supplied', 'mode must be discovery or supplied');
check(Number.isInteger(targetCount) && targetCount > 0, 'targetCount must be an integer greater than zero');
check(Array.isArray(candidates), 'candidates must be an array');

if (!Array.isArray(candidates)) {
  console.error(JSON.stringify({ passed: false, errors }));
  process.exit(1);
}

if (mode === 'discovery') {
  check(candidates.length >= targetCount * 3, 'candidates must contain at least three times targetCount after deduplication in discovery mode');
}

const seenIds = new Set();
const seenNames = new Set();
const scoreFields = [
  'recognizability',
  'careerDistinctiveness',
  'rosterBalance',
  'evidenceAvailability',
  'crestWorkload',
  'rivalCoverage',
];
const hardGateFields = [
  'notAlreadyPlayable',
  'bankStatusResolved',
  'distinctCareer',
  'seniorScopePlausible',
  'twoDomainsLikely',
  'identityResolved',
  'rivalPlan',
  'constraintsFit',
];
const allowedStatuses = new Set(['new', 'bank-promotion', 'already-playable']);
const allowedDecisions = new Set(['selected', 'reserve', 'reject']);
const byDecision = { selected: [], reserve: [], reject: [] };
let selectedPromotions = 0;

for (const [index, candidate] of candidates.entries()) {
  const label = `candidates[${index}]`;
  const id = normalize(candidate.proposedId);
  const name = normalize(candidate.name);
  check(Boolean(id), `${label}.proposedId must be non-empty`);
  check(Boolean(name), `${label}.name must be non-empty`);
  check(!seenIds.has(id), `${label}.proposedId duplicates another shortlist candidate`);
  check(!seenNames.has(name), `${label}.name duplicates another shortlist candidate`);
  seenIds.add(id);
  seenNames.add(name);

  const playableMatches = playable.filter((player) => normalize(player.id) === id || normalize(player.name) === name);
  const bankMatches = bank.filter((player) => normalize(player.id) === id || normalize(player.name) === name);
  check(playableMatches.length <= 1, `${label} ID and name resolve to different playable records`);
  check(bankMatches.length <= 1, `${label} ID and name resolve to different bank records`);
  const playableRecord = playableMatches[0] ?? null;
  const bankRecord = bankMatches[0] ?? null;
  const playableMatch = Boolean(playableRecord);
  const bankMatch = Boolean(bankRecord);
  const expectedStatus = playableMatch ? 'already-playable' : bankMatch ? 'bank-promotion' : 'new';
  check(allowedStatuses.has(candidate.existingStatus), `${label}.existingStatus must be new, bank-promotion or already-playable`);
  check(candidate.existingStatus === expectedStatus, `${label}.existingStatus must be ${expectedStatus} for the current datasets`);
  check(candidate.hardGates?.bankStatusResolved === true, `${label}.hardGates.bankStatusResolved must be true`);
  check(candidate.hardGates?.notAlreadyPlayable === !playableMatch, `${label}.hardGates.notAlreadyPlayable does not match the playable roster`);

  if (expectedStatus === 'new') {
    check(candidate.hardGates?.promotionHandled === null, `${label}.hardGates.promotionHandled must be null for a new candidate`);
    check(candidate.existingMatch?.dataset === null, `${label}.existingMatch.dataset must be null for a new candidate`);
  } else {
    check(typeof candidate.existingMatch?.dataset === 'string' && candidate.existingMatch.dataset.length > 0, `${label}.existingMatch.dataset must identify the matching dataset`);
  }
  if (expectedStatus === 'already-playable') {
    check(candidate.existingMatch?.dataset === 'verified-players', `${label}.existingMatch.dataset must be verified-players for a playable match`);
    check(normalize(candidate.existingMatch?.id) === normalize(playableRecord?.id), `${label}.existingMatch.id must match the playable record`);
    check(normalize(candidate.existingMatch?.name) === normalize(playableRecord?.name), `${label}.existingMatch.name must match the playable record`);
    check(candidate.existingMatch?.evidenceFile === 'research/verified-players.json', `${label}.existingMatch.evidenceFile must identify research/verified-players.json`);
  }
  if (expectedStatus === 'bank-promotion') {
    check(candidate.hardGates?.promotionHandled === true, `${label}.hardGates.promotionHandled must be true for a bank promotion`);
    check(candidate.existingMatch?.dataset === 'verified-distractors', `${label}.existingMatch.dataset must be verified-distractors for a bank promotion`);
    check(normalize(candidate.existingMatch?.id) === normalize(bankRecord?.id), `${label}.existingMatch.id must match the bank record`);
    check(normalize(candidate.existingMatch?.name) === normalize(bankRecord?.name), `${label}.existingMatch.name must match the bank record`);
    check(candidate.existingMatch?.evidenceFile === 'research/verified-distractors.json', `${label}.existingMatch.evidenceFile must identify research/verified-distractors.json`);
  }

  check(allowedDecisions.has(candidate.decision), `${label}.decision must be selected, reserve or reject`);
  if (allowedDecisions.has(candidate.decision)) byDecision[candidate.decision].push(candidate.proposedId);
  if (playableMatch) check(candidate.decision === 'reject', `${label} already exists in the playable roster and must be rejected`);

  const discoveries = candidate.discoveredFrom;
  check(Array.isArray(discoveries) && discoveries.length > 0, `${label}.discoveredFrom must contain at least one discovery record`);
  for (const [leadIndex, discovery] of (discoveries ?? []).entries()) {
    const leadLabel = `${label}.discoveredFrom[${leadIndex}]`;
    for (const field of ['sourceFamily', 'query', 'url', 'retrievedAt']) {
      check(typeof discovery[field] === 'string' && discovery[field].trim().length > 0, `${leadLabel}.${field} must be non-empty`);
    }
    try {
      const url = new URL(discovery.url);
      check(url.protocol === 'https:' || url.protocol === 'http:', `${leadLabel}.url must use HTTP(S)`);
    } catch {
      check(false, `${leadLabel}.url must be a valid URL`);
    }
  }

  const evidence = candidate.evidenceLeads;
  check(Array.isArray(evidence) && evidence.length >= 2, `${label}.evidenceLeads must contain at least two leads`);
  const domains = new Set();
  for (const [leadIndex, lead] of (evidence ?? []).entries()) {
    const leadLabel = `${label}.evidenceLeads[${leadIndex}]`;
    check(typeof lead.domain === 'string' && lead.domain.trim().length > 0, `${leadLabel}.domain must be non-empty`);
    check(typeof lead.reason === 'string' && lead.reason.trim().length > 0, `${leadLabel}.reason must be non-empty`);
    try {
      const url = new URL(lead.url);
      check(url.protocol === 'https:' || url.protocol === 'http:', `${leadLabel}.url must use HTTP(S)`);
      const declaredDomain = organizationalDomain(lead.domain);
      const urlDomain = organizationalDomain(url.hostname);
      check(declaredDomain === urlDomain, `${leadLabel}.domain must match the URL's organizational domain`);
      domains.add(urlDomain);
    } catch {
      check(false, `${leadLabel}.url must be a valid URL`);
    }
  }
  check(domains.size >= 2, `${label}.evidenceLeads must use at least two distinct organizational domains`);

  let computedTotal = 0;
  for (const field of scoreFields) {
    const value = candidate.scores?.[field];
    check(integerInRange(value, 0, 3), `${label}.scores.${field} must be an integer from 0 to 3`);
    if (Number.isInteger(value)) computedTotal += value;
  }
  check(candidate.totalScore === computedTotal, `${label}.totalScore must equal the six score fields`);

  if (candidate.decision === 'selected') {
    for (const field of hardGateFields) {
      check(candidate.hardGates?.[field] === true, `${label}.hardGates.${field} must be true for a selected candidate`);
    }
    check(computedTotal >= 12, `${label}.scores.totalScore must be at least 12 when selected`);
    check(candidate.scores?.evidenceAvailability >= 2, `${label}.scores.evidenceAvailability must be at least 2 when selected`);
    check(candidate.scores?.rivalCoverage >= 2, `${label}.scores.rivalCoverage must be at least 2 when selected`);
    check(typeof candidate.rationale === 'string' && candidate.rationale.trim().length > 0, `${label}.rationale must be non-empty when selected`);
    if (expectedStatus === 'bank-promotion') selectedPromotions += 1;
  }
  if (candidate.decision === 'reject') {
    check(typeof candidate.rejectionReason === 'string' && candidate.rejectionReason.trim().length > 0, `${label}.rejectionReason must be non-empty when rejected`);
  }
}

check(byDecision.selected.length <= targetCount, 'selected candidate count must not exceed targetCount');

const baseline = shortlist.baseline ?? {};
check(typeof baseline.commit === 'string' && baseline.commit.trim().length > 0, 'baseline.commit must be non-empty');
for (const field of ['playableCount', 'bankOnlyCount', 'rankedCompetitionCount']) {
  check(Number.isInteger(baseline[field]) && baseline[field] >= 0, `baseline.${field} must be a non-negative integer`);
}
const counts = baseline.longlistCounts ?? {};
for (const field of ['discovered', 'beforeDeduplication', 'afterDeduplication']) {
  check(Number.isInteger(counts[field]) && counts[field] >= 0, `baseline.longlistCounts.${field} must be a non-negative integer`);
}
check(counts.discovered >= counts.beforeDeduplication, 'baseline.longlistCounts.discovered must be at least beforeDeduplication');
check(counts.beforeDeduplication >= counts.afterDeduplication, 'baseline.longlistCounts.beforeDeduplication must be at least afterDeduplication');
check(counts.afterDeduplication === candidates.length, 'baseline.longlistCounts.afterDeduplication must equal candidates.length');

const results = shortlist.results ?? {};
check(sameStrings(results.selected ?? [], byDecision.selected), 'results.selected must exactly match candidates with decision selected');
check(sameStrings(results.reserve ?? [], byDecision.reserve), 'results.reserve must exactly match candidates with decision reserve');
check(sameStrings(results.rejected ?? [], byDecision.reject), 'results.rejected must exactly match candidates with decision reject');
const partition = [...(results.selected ?? []), ...(results.reserve ?? []), ...(results.rejected ?? [])];
check(partition.length === candidates.length && new Set(partition).size === candidates.length, 'results must partition every candidate exactly once');

const summary = shortlist.summary ?? {};
check(summary.expectedPlayableRecords === baseline.playableCount + byDecision.selected.length, 'summary.expectedPlayableRecords must equal baseline playableCount plus selected candidates');
check(Number.isInteger(summary.expectedBankOnlyProfiles) && summary.expectedBankOnlyProfiles >= baseline.bankOnlyCount - selectedPromotions, 'summary.expectedBankOnlyProfiles is inconsistent with selected bank promotions');
check(Array.isArray(summary.expectedNewCrestKeys), 'summary.expectedNewCrestKeys must be an array');
check(Array.isArray(summary.unresolvedDecisions), 'summary.unresolvedDecisions must be an array');

if (errors.length > 0) {
  console.error(JSON.stringify({ passed: false, errors }));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  mode,
  targetCount,
  candidates: candidates.length,
  selected: byDecision.selected.length,
  reserve: byDecision.reserve.length,
  rejected: byDecision.reject.length,
}));
