#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const JSON_DECODER_MARKERS = {
  players: 'const PLAYERS =',
  crests: 'const CREST_ASSETS =',
  spanish: 'const SPANISH_NOTES =',
  bank: 'const DISTRACTOR_PROFILES =',
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (['write', 'check'].includes(key)) options[key] = true;
    else {
      if (index + 1 >= rest.length || rest[index + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[key] = rest[++index];
    }
  }
  return { command, options };
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function extractAssignedJson(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Missing ${marker}`);
  let start = markerAt + marker.length;
  while (/\s/.test(source[start])) start += 1;
  const opener = source[start];
  if (opener !== '[' && opener !== '{') throw new Error(`Expected JSON after ${marker}`);
  let depth = 0;
  let string = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (string) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') string = false;
      continue;
    }
    if (char === '"') string = true;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return { value: JSON.parse(source.slice(start, index + 1)), start, end: index + 1 };
    }
  }
  throw new Error(`Unterminated JSON after ${marker}`);
}

function serializeInlineJson(value, space = 2) {
  return JSON.stringify(value, null, space)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePngDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[1].length % 4 !== 0) throw new Error('invalid PNG data URL');
  const png = Buffer.from(match[1], 'base64');
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('invalid PNG signature');

  let offset = 8;
  let ihdr;
  let sawIdat = false;
  let sawIend = false;
  const idat = [];
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('truncated PNG chunk');
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error('truncated PNG chunk data');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    if (pngCrc32(typeAndData) !== png.readUInt32BE(offset + 8 + length)) throw new Error(`invalid ${type} CRC`);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (!ihdr) {
      if (type !== 'IHDR' || length !== 13) throw new Error('PNG must begin with a 13-byte IHDR');
      ihdr = data;
    } else if (type === 'IHDR') throw new Error('duplicate PNG IHDR');
    if (type === 'IDAT') {
      sawIdat = true;
      idat.push(data);
    }
    if (type === 'IEND') {
      if (length !== 0 || end !== png.length) throw new Error('invalid PNG IEND');
      sawIend = true;
    }
    offset = end;
  }
  if (!ihdr || !sawIdat || !sawIend) throw new Error('PNG is missing required chunks');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  if (!width || !height) throw new Error('invalid PNG dimensions');
  if (!inflateSync(Buffer.concat(idat)).length) throw new Error('empty PNG image data');
}

function replaceAssignedJson(source, marker, value) {
  const found = extractAssignedJson(source, marker);
  return source.slice(0, found.start) + serializeInlineJson(value) + source.slice(found.end);
}

function scriptBlock(html, id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`Missing script block ${id}`);
  return match[1];
}

function loadRuntime(html) {
  const context = vm.createContext({});
  vm.runInContext(scriptBlock(html, 'roster-data') + scriptBlock(html, 'game-model'), context);
  return vm.runInContext('({players: PLAYERS, game: CareerGame})', context);
}

function normalizeClubs(profile) {
  return profile.clubs.map(club => typeof club === 'string' ? club : club.name);
}

function signature(profile) {
  return JSON.stringify(normalizeClubs(profile));
}

function organizationalDomain(rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const parts = host.split('.').filter(Boolean);
  const common = new Set(['co.uk', 'org.uk', 'com.ar', 'com.br', 'com.co', 'com.mx', 'com.uy']);
  const lastTwo = parts.slice(-2).join('.');
  return common.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

function loadBatch(batchDir) {
  const records = readJson(path.join(batchDir, 'records.json'), null);
  if (!Array.isArray(records)) throw new Error(`${batchDir}/records.json must contain an array`);
  const selectedFile = readJson(path.join(batchDir, 'selected-ids.json'), null);
  if (!selectedFile?.continents || typeof selectedFile.continents !== 'object' || Array.isArray(selectedFile.continents)) {
    throw new Error(`${batchDir}/selected-ids.json must contain a continents object`);
  }
  const selectedGroups = Object.values(selectedFile.continents);
  if (!selectedGroups.length || selectedGroups.some(group => !Array.isArray(group) || !group.length || group.some(id => typeof id !== 'string' || !id))) {
    throw new Error(`${batchDir}/selected-ids.json continents must contain non-empty id arrays`);
  }
  const selected = selectedGroups.flat();
  return {
    records,
    selected,
    peers: readJson(path.join(batchDir, 'peer-bank-records.json'), []),
    origins: readJson(path.join(batchDir, 'origin-systems.json'), {}),
    crestAssets: readJson(path.join(batchDir, 'crest-assets.json'), {}),
    allowlist: readJson(path.join(batchDir, 'audit-allowlist.json'), { originMismatches: [], careerSignatureCollisions: [] }),
  };
}

function cleanRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['esNotes', 'esClubNotes'].includes(key)));
}

function regionForSystem(system) {
  return ['argentina', 'brazil', 'uruguay', 'peru', 'chile', 'colombia', 'paraguay'].includes(system)
    ? 'south-america'
    : 'europe';
}

function updateOrigins(html, records, peers, origins) {
  const match = html.match(/(?<prefix>\s*const ORIGIN_CLUBS = \{\n)(?<body>[\s\S]*?)(?<suffix>\n\s*\};)/);
  if (!match?.groups) throw new Error('Missing ORIGIN_CLUBS block');
  let body = match.groups.body;
  const additions = new Map();
  const add = (system, club) => {
    if (!system || !club) return;
    if (!/^[a-z][a-z-]*$/.test(system)) throw new Error(`Invalid origin system: ${system}`);
    if (!additions.has(system)) additions.set(system, new Set());
    additions.get(system).add(club.replace(/ [BC]$/, ''));
  };
  for (const record of records) add(origins[record.id], normalizeClubs(record)[0]);
  for (const peer of peers) add(peer.system, normalizeClubs(peer)[0]);
  const assigned = new Set([...additions.values()].flatMap(set => [...set]));
  const lines = body.split('\n');
  const parsed = new Map();
  for (const [index, line] of lines.entries()) {
    const item = line.match(/^(\s*)([a-z-]+): (\[[^\n]*\])(,?)$/);
    if (!item) continue;
    const current = JSON.parse(item[3]).filter(club => !assigned.has(club));
    parsed.set(item[2], { index, indent: item[1], comma: item[4], clubs: current });
  }
  for (const [system, clubs] of additions) {
    if (!parsed.has(system)) {
      const last = [...parsed.values()].at(-1);
      if (!last) throw new Error('No origin buckets found');
      if (!last.comma) last.comma = ',';
      lines.push(`    ${system}: []`);
      parsed.set(system, { index: lines.length - 1, indent: '    ', comma: '', clubs: [] });
    }
    parsed.get(system).clubs.push(...[...clubs].filter(club => !parsed.get(system).clubs.includes(club)).sort());
  }
  for (const item of parsed.values()) lines[item.index] = `${item.indent}${[...parsed].find(([, value]) => value === item)[0]}: ${serializeInlineJson(item.clubs, 0)}${item.comma}`;
  body = lines.join('\n');
  return html.slice(0, match.index + match[0].indexOf(match.groups.body)) + body
    + html.slice(match.index + match[0].indexOf(match.groups.body) + match.groups.body.length);
}

export function integrateCore({ html, verifiedPlayers, bank, records, peers = [], origins, crestAssets = {} }) {
  const inlinePlayers = extractAssignedJson(html, JSON_DECODER_MARKERS.players).value;
  const inlineCrests = extractAssignedJson(html, JSON_DECODER_MARKERS.crests).value;
  const spanish = extractAssignedJson(html, JSON_DECODER_MARKERS.spanish).value;
  const selectedIds = new Set(records.map(record => record.id));
  const selectedNames = new Set(records.map(record => record.name));

  const playersById = new Map(verifiedPlayers.map(player => [player.id, player]));
  for (const record of records) playersById.set(record.id, cleanRecord(record));
  const nextPlayers = [...playersById.values()];

  const bankById = new Map();
  const bankByName = new Map();
  for (const profile of [...bank, ...peers]) {
    if (selectedIds.has(profile.id) || selectedNames.has(profile.name)) continue;
    const sameId = bankById.get(profile.id);
    const sameName = bankByName.get(profile.name);
    if (sameId && JSON.stringify(sameId) !== JSON.stringify(profile)) throw new Error(`Candidate id collision: ${profile.id}`);
    if (sameName && sameName.id !== profile.id) throw new Error(`Candidate name collision: ${profile.name}`);
    bankById.set(profile.id, profile);
    bankByName.set(profile.name, profile);
  }
  const nextBank = [...bankById.values()];

  const clubCrests = new Map();
  for (const player of inlinePlayers) {
    for (const [index, club] of player.clubs.entries()) clubCrests.set(club.name, player.clubCrests[index]);
  }
  for (const [club, asset] of Object.entries(crestAssets)) {
    clubCrests.set(club, asset.sourceURL);
    if (!inlineCrests[asset.sourceURL]) {
      inlineCrests[asset.sourceURL] = {
        sourceUrl: asset.sourceURL,
        dataUrl: asset.dataUrl,
        sourcePage: asset.sourcePage,
        notes: `Public club crest source reviewed for roster expansion. Decoded and resized to a maximum of 128px PNG. Source page identifies ${asset.sourceTitle}. Current/source-era crest, not necessarily historical career-era crest.`,
      };
    }
  }

  const inlineById = new Map(inlinePlayers.map(player => [player.id, player]));
  const combined = nextPlayers.map(player => {
    if (!selectedIds.has(player.id) && inlineById.has(player.id)) return structuredClone(inlineById.get(player.id));
    const integrated = structuredClone(player);
    integrated.clubCrests = integrated.clubs.map(club => {
      const crest = clubCrests.get(club.name);
      if (!crest) throw new Error(`Missing crest for ${club.name}`);
      return crest;
    });
    return integrated;
  });
  const candidates = [...combined, ...nextBank];
  for (const player of combined) {
    player.incorrectOptions = candidates
      .filter(candidate => candidate.id !== player.id && signature(candidate) !== signature(player))
      .map(candidate => candidate.name);
  }
  for (const record of records) {
    const clubNotes = record.clubs.map(() => '');
    for (const [index, note] of Object.entries(record.esClubNotes ?? {})) clubNotes[Number(index)] = note;
    spanish[record.id] = { notes: record.esNotes, clubNotes };
  }

  let nextHtml = html;
  nextHtml = replaceAssignedJson(nextHtml, JSON_DECODER_MARKERS.players, combined);
  nextHtml = replaceAssignedJson(nextHtml, JSON_DECODER_MARKERS.crests, inlineCrests);
  nextHtml = replaceAssignedJson(nextHtml, JSON_DECODER_MARKERS.spanish, spanish);
  nextHtml = replaceAssignedJson(nextHtml, JSON_DECODER_MARKERS.bank, nextBank);
  nextHtml = updateOrigins(nextHtml, records, peers, origins);
  return { html: nextHtml, verifiedPlayers: nextPlayers, bank: nextBank };
}

function validateBatch(batch, currentPlayers, currentBank, html) {
  const errors = [];
  const ids = new Set();
  const names = new Set();
  const currentIds = new Set(currentPlayers.map(player => player.id));
  const currentById = new Map(currentPlayers.map(player => [player.id, player]));
  const currentBankById = new Map(currentBank.map(profile => [profile.id, profile]));
  const currentBankByName = new Map(currentBank.map(profile => [profile.name, profile]));
  const integratedCount = batch.records.filter(record => currentIds.has(record.id)).length;
  const state = integratedCount === 0 ? 'pending' : integratedCount === batch.records.length ? 'integrated' : 'mixed';
  if (state === 'mixed') errors.push('Batch is partially integrated; restore a coherent baseline before continuing');
  if (new Set(batch.selected).size !== batch.selected.length) errors.push('selected-ids contains duplicates');
  if (batch.selected.length !== batch.records.length || batch.records.some(record => !batch.selected.includes(record.id))) {
    errors.push('selected-ids must match records.json exactly');
  }
  for (const record of batch.records) {
    if (!record.id || ids.has(record.id)) errors.push(`Duplicate or missing player id: ${record.id}`);
    if (!record.name || names.has(record.name)) errors.push(`Duplicate or missing player name: ${record.name}`);
    ids.add(record.id); names.add(record.name);
    if (!Array.isArray(record.clubs) || !record.clubs.length) errors.push(`${record.id} must have at least one club`);
    if (!record.esNotes || typeof record.esNotes !== 'string') errors.push(`${record.id} is missing esNotes`);
    if (!record.esClubNotes || typeof record.esClubNotes !== 'object') errors.push(`${record.id} is missing esClubNotes`);
    const sources = Array.isArray(record.sources) ? record.sources : [];
    let domains = new Set();
    try { domains = new Set(sources.map(source => organizationalDomain(source.url))); } catch { errors.push(`${record.id} has an invalid source URL`); }
    if (domains.size < 2) errors.push(`${record.id} needs at least two independent source domains`);
    if (!batch.origins[record.id]) errors.push(`${record.id} is missing an origin-system assignment`);
    if (state === 'integrated' && JSON.stringify(currentById.get(record.id)) !== JSON.stringify(cleanRecord(record))) {
      errors.push(`${record.id} differs between records.json and research/verified-players.json`);
    }
  }
  const peerIds = new Set();
  const peerNames = new Set();
  const currentNames = new Set(currentPlayers.map(player => player.name));
  const currentBankNames = new Set(currentBank.map(profile => profile.name));
  for (const peer of batch.peers) {
    if (!peer.id || peerIds.has(peer.id)) errors.push(`Duplicate peer id: ${peer.id}`);
    if (!peer.name || peerNames.has(peer.name)) errors.push(`Duplicate peer name: ${peer.name}`);
    peerIds.add(peer.id); peerNames.add(peer.name);
    if (ids.has(peer.id) || names.has(peer.name)) errors.push(`${peer.id} collides with a selected playable record`);
    if (currentIds.has(peer.id) || currentNames.has(peer.name)) {
      errors.push(`${peer.id} collides with an existing candidate`);
    } else if (state === 'pending' && (currentBankById.has(peer.id) || currentBankNames.has(peer.name))) {
      errors.push(`${peer.id} collides with an existing candidate`);
    } else if (state === 'integrated') {
      if (!currentBankById.has(peer.id)) errors.push(`${peer.id} is missing from research/verified-distractors.json`);
      const sameName = currentBankByName.get(peer.name);
      if (sameName && sameName.id !== peer.id) errors.push(`${peer.id} name collides with existing candidate ${sameName.id}`);
    }
    const sources = Array.isArray(peer.sources) ? peer.sources : [];
    let domains = new Set();
    try { domains = new Set(sources.map(source => organizationalDomain(source.url))); } catch { errors.push(`${peer.id} has an invalid source URL`); }
    if (domains.size < 2) errors.push(`${peer.id} needs at least two independent source domains`);
    if (sources.some(source => !source.excerpt?.trim())) errors.push(`${peer.id} has a source without a literal excerpt`);
    if (!peer.system || !peer.region) errors.push(`${peer.id} is missing system/region`);
    if (state === 'integrated' && currentBankById.has(peer.id) && JSON.stringify(currentBankById.get(peer.id)) !== JSON.stringify(peer)) {
      errors.push(`${peer.id} differs between peer-bank-records.json and research/verified-distractors.json`);
    }
  }

  const inlinePlayers = extractAssignedJson(html, JSON_DECODER_MARKERS.players).value;
  const inlineBank = extractAssignedJson(html, JSON_DECODER_MARKERS.bank).value;
  const inlineSpanish = extractAssignedJson(html, JSON_DECODER_MARKERS.spanish).value;
  const inlineCrests = extractAssignedJson(html, JSON_DECODER_MARKERS.crests).value;
  const inlineCanonicalPlayers = inlinePlayers.map(({ clubCrests: _clubCrests, incorrectOptions: _incorrectOptions, ...player }) => player);
  try {
    assert.deepEqual(inlineCanonicalPlayers, currentPlayers);
  } catch {
    errors.push('inline PLAYERS differs from research/verified-players.json');
  }
  try {
    assert.deepEqual(inlineBank, currentBank);
  } catch {
    errors.push('inline DISTRACTOR_PROFILES differs from research/verified-distractors.json');
  }
  const knownCrests = new Set(inlinePlayers.flatMap(player => player.clubs.map((club, index) => [club.name, player.clubCrests[index]])).map(([club]) => club));
  if (state === 'integrated') {
    for (const record of batch.records) {
      const clubNotes = record.clubs.map(() => '');
      for (const [index, note] of Object.entries(record.esClubNotes ?? {})) clubNotes[Number(index)] = note;
      if (JSON.stringify(inlineSpanish[record.id]) !== JSON.stringify({ notes: record.esNotes, clubNotes })) {
        errors.push(`${record.id} Spanish notes differ from the reviewed batch record`);
      }
    }
  }
  const missingCrests = [...new Set(batch.records.flatMap(record => normalizeClubs(record)).filter(club => !knownCrests.has(club)))].sort();
  if (state === 'pending') {
    for (const club of missingCrests) if (!batch.crestAssets[club]) errors.push(`Missing reviewed crest asset for ${club}`);
    for (const club of Object.keys(batch.crestAssets)) if (!missingCrests.includes(club)) errors.push(`Unexpected crest asset not required by the pending batch: ${club}`);
  }
  for (const [club, asset] of Object.entries(batch.crestAssets)) {
    for (const field of ['sourceURL', 'sourcePage', 'sourceTitle', 'dataUrl']) {
      if (!asset[field] || typeof asset[field] !== 'string') errors.push(`${club} crest is missing ${field}`);
    }
    try {
      validatePngDataUrl(asset.dataUrl);
    } catch {
      errors.push(`${club} crest dataUrl is not a complete decodable PNG`);
    }
    if (state === 'integrated') {
      const embedded = inlineCrests[asset.sourceURL];
      if (!embedded || embedded.dataUrl !== asset.dataUrl) {
        errors.push(`${club} crest differs from the reviewed batch asset`);
      }
    }
  }
  return { errors, state, newCrestKeys: missingCrests };
}

function coverageReport(html) {
  const { players, game } = loadRuntime(html);
  const gaps = players.map(player => {
    const peers = game.eligibleRivals(player).filter(name => game.matchTier(player, game.candidates.find(candidate => candidate.name === name)) === 0);
    return { id: player.id, peers };
  }).filter(item => item.peers.length < 4);
  return { gapCount: gaps.length, gaps };
}

export function findProjectionIssues(players, bank, allowlist = {}, { state = 'integrated', baselinePlayers = [], batchIds = new Set() } = {}) {
  const errors = [];
  const warnings = [];
  const all = [...players, ...bank];
  for (const field of ['id', 'name']) {
    const seen = new Set();
    for (const profile of all) {
      if (seen.has(profile[field])) errors.push(`Projected candidates contain duplicate ${field}: ${profile[field]}`);
      seen.add(profile[field]);
    }
  }
  const pairKey = ids => JSON.stringify([...ids].sort());
  const baselinePairs = new Set();
  const baselineSignatures = new Map();
  for (const player of baselinePlayers) {
    const key = signature(player);
    if (baselineSignatures.has(key)) baselinePairs.add(pairKey([baselineSignatures.get(key), player.id]));
    baselineSignatures.set(key, player.id);
  }
  const signatures = new Map();
  for (const player of players) {
    const key = signature(player);
    if (signatures.has(key)) {
      const first = signatures.get(key);
      const pair = [first, player.id].sort();
      const message = `Playable career signature collision: ${first} and ${player.id}`;
      const approved = state === 'integrated' && (allowlist.careerSignatureCollisions ?? []).find(item => Array.isArray(item.ids) && pairKey(item.ids) === pairKey(pair) && item.reason?.trim());
      if (approved) warnings.push(`${message} (allowlisted: ${approved.reason})`);
      else if (!batchIds.has(first) && !batchIds.has(player.id)) warnings.push(`${message} (pre-existing outside this batch)`);
      else if (state === 'pending' && baselinePairs.has(pairKey(pair))) warnings.push(`${message} (pre-existing baseline collision)`);
      else errors.push(message);
    }
    signatures.set(key, player.id);
  }
  return { errors, warnings };
}

function runtimeOriginFindings(html, records, origins) {
  const findings = [];
  try {
    const { players, game } = loadRuntime(html);
    const byId = new Map(players.map(player => [player.id, player]));
    for (const record of records) {
      const player = byId.get(record.id);
      if (!player) continue;
      const runtime = game.originFor(player).system;
      const reviewed = origins[record.id];
      if (runtime !== reviewed) findings.push({ id: record.id, runtime, reviewed, message: `${record.id} runtime origin ${runtime} differs from reviewed ${reviewed}` });
    }
  } catch (error) {
    findings.push({ message: `Runtime origins could not be validated: ${error.message}` });
  }
  return findings;
}

function localeCoverageErrors(html, players) {
  const errors = [];
  const readObject = name => {
    const match = html.match(new RegExp(`const ${name} = (\\{[^\\n]*\\});`));
    if (!match) throw new Error(`Missing ${name}`);
    return vm.runInNewContext(`(${match[1]})`);
  };
  try {
    const countries = readObject('COUNTRIES_ES');
    const positions = readObject('POSITIONS_ES');
    for (const player of players) {
      if (!countries[player.country]) errors.push(`Missing Spanish country translation for ${player.country}`);
      if (!positions[player.position]) errors.push(`Missing Spanish position translation for ${player.position}`);
    }
  } catch (error) {
    errors.push(`Locale maps could not be validated: ${error.message}`);
  }
  return [...new Set(errors)];
}

function audit(root, batchDir, { allowGeneratedDrift = false } = {}) {
  const htmlPath = path.join(root, 'index.html');
  const playersPath = path.join(root, 'research', 'verified-players.json');
  const bankPath = path.join(root, 'research', 'verified-distractors.json');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const players = readJson(playersPath, []);
  const bank = readJson(bankPath, []);
  const batch = loadBatch(batchDir);
  const validation = validateBatch(batch, players, bank, html);
  let projected = { html, verifiedPlayers: players, bank };
  if (['pending', 'integrated'].includes(validation.state) && !validation.errors.length) {
    const integrationOrigins = { ...batch.origins };
    if (validation.state === 'integrated') {
      for (const item of batch.allowlist.originMismatches ?? []) {
        if (item.id && item.runtime && item.reason?.trim()) integrationOrigins[item.id] = item.runtime;
      }
    }
    projected = integrateCore({ html, verifiedPlayers: players, bank, ...batch, origins: integrationOrigins });
    if (validation.state === 'integrated') {
      const currentInlinePlayers = extractAssignedJson(html, JSON_DECODER_MARKERS.players).value;
      const projectedInlinePlayers = extractAssignedJson(projected.html, JSON_DECODER_MARKERS.players).value;
      const generatedDrift = JSON.stringify(currentInlinePlayers) !== JSON.stringify(projectedInlinePlayers);
      if (generatedDrift && !allowGeneratedDrift) {
        validation.errors.push('Integrated generated inline roster data differs from its deterministic projection');
      } else if (!generatedDrift) {
        projected.html = html;
      }
    }
  }
  const projection = findProjectionIssues(projected.verifiedPlayers, projected.bank, batch.allowlist, {
    state: validation.state,
    baselinePlayers: players,
    batchIds: new Set(batch.records.map(record => record.id)),
  });
  validation.errors.push(...projection.errors);
  let coverage = { gapCount: null, gaps: [] };
  try { coverage = coverageReport(projected.html); }
  catch (error) { validation.errors.push(`Projected runtime could not be evaluated: ${error.message}`); }
  if (coverage.gapCount > 0) validation.errors.push(`Projected roster has ${coverage.gapCount} contemporary-coverage gaps`);
  const originFindings = runtimeOriginFindings(projected.html, batch.records, batch.origins);
  for (const finding of originFindings) {
    const approved = validation.state === 'integrated' && finding.id && (batch.allowlist.originMismatches ?? []).find(item => item.id === finding.id && item.reviewed === finding.reviewed && item.runtime === finding.runtime && item.reason?.trim());
    if (approved) projection.warnings.push(`${finding.message} (allowlisted: ${approved.reason})`);
    else validation.errors.push(finding.message);
  }
  validation.errors.push(...localeCoverageErrors(projected.html, projected.verifiedPlayers));
  const report = {
    passed: validation.errors.length === 0,
    state: validation.state,
    records: batch.records.length,
    peers: batch.peers.length,
    newCrestKeys: validation.newCrestKeys,
    counts: {
      playable: projected.verifiedPlayers.length,
      bankOnly: projected.bank.length,
      candidates: projected.verifiedPlayers.length + projected.bank.length,
    },
    coverage,
    warnings: projection.warnings,
    errors: validation.errors,
  };
  return { report, projected, paths: { htmlPath, playersPath, bankPath } };
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function protectedRegions(html) {
  const regions = new Map();
  let shell = html;
  for (const id of ['roster-data', 'crest-data', 'locale-data']) {
    shell = shell.replace(new RegExp(`(<script id="${id}">)[\\s\\S]*?(<\\/script>)`), '$1/* data-only */$2');
  }
  const tags = [...shell.matchAll(/<\/?[a-z][^>]*>/gi)].map(match => match[0].replace(/\s+/g, ' ')).join('\n');
  regions.set('html:tag-structure', sha(tags));
  let styleIndex = 0;
  for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) regions.set(`style:${styleIndex++}`, sha(match[1]));
  let scriptIndex = 0;
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    if (['roster-data', 'crest-data', 'locale-data'].includes(id)) continue;
    regions.set(id ? `script:${id}` : `script:anonymous:${scriptIndex++}`, sha(match[2]));
  }
  return regions;
}

function guard(root, base, htmlFile) {
  const baseline = execFileSync('git', ['show', `${base}:index.html`], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const current = fs.readFileSync(htmlFile ?? path.join(root, 'index.html'), 'utf8');
  const before = protectedRegions(baseline);
  const after = protectedRegions(current);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changedProtectedRegions = [...keys].filter(key => before.get(key) !== after.get(key)).sort();
  return { passed: changedProtectedRegions.length === 0, base, changedProtectedRegions, protectedRegionCount: keys.size };
}

function promotionImpact(html, ids) {
  const { players, game } = loadRuntime(html);
  const bank = game.candidates.slice(players.length);
  const byId = new Map(bank.map(profile => [profile.id, profile]));
  const promotions = ids.map(id => {
    const profile = byId.get(id);
    if (!profile) throw new Error(`Promotion id is not in the current bank: ${id}`);
    return { id: profile.id, name: profile.name };
  });
  const removedNames = new Set(promotions.map(item => item.name));
  const byName = new Map(game.candidates.map(candidate => [candidate.name, candidate]));
  const affectedTargets = [];
  for (const player of players) {
    const tierZero = game.eligibleRivals(player).filter(name => game.matchTier(player, byName.get(name)) === 0);
    const remaining = tierZero.filter(name => !removedNames.has(name));
    if (remaining.length !== tierZero.length) affectedTargets.push({ id: player.id, before: tierZero.length, after: remaining.length, removed: tierZero.filter(name => removedNames.has(name)) });
  }
  return { promotions, affectedTargets, gaps: affectedTargets.filter(target => target.after < 4) };
}

function rankedProjection(html) {
  const { players, game } = loadRuntime(html);
  const byName = new Map(game.candidates.map(candidate => [candidate.name, candidate]));
  const candidates = game.candidates.map(candidate => ({ id: candidate.id, label: candidate.name }));
  const roster = players.map(player => ({ id: player.id, country: player.country, position: player.position }));
  const memberships = players.flatMap(player => ['all', ...player.competitions].map(competition => ({ player_id: player.id, competition })));
  const rivals = players.flatMap(player => game.eligibleRivals(player).map(name => {
    const candidate = byName.get(name);
    assert(candidate && candidate.id !== player.id);
    assert.notDeepEqual(normalizeClubs(player), normalizeClubs(candidate));
    return { player_id: player.id, candidate_id: candidate.id, tier: game.matchTier(player, candidate), similarity: game.similarity(player, candidate), competitions: candidate.competitions };
  }));
  for (const player of players) assert(rivals.filter(rival => rival.player_id === player.id && rival.tier === 0).length >= 4, player.id);
  return { candidates, roster, memberships, rivals };
}

function migrationSql(html) {
  const { candidates, roster, memberships, rivals } = rankedProjection(html);
  const quoted = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const records = (value, columns) => `select * from jsonb_to_recordset(${quoted(value)}) as x(${columns})`;
  const sql = `-- Generated forward roster migration from the reviewed ${roster.length}-player runtime model.\n`
    + '-- Adds candidates/players/memberships, refreshes future rival pools, and never rewrites results or active rounds.\n'
    + 'begin;\n'
    + `insert into ranked_private.candidates ${records(candidates, 'id text, label text')} on conflict (id) do update set label=excluded.label;\n`
    + `insert into ranked_private.players ${records(roster, 'id text, country text, position text')} on conflict (id) do update set country=excluded.country, position=excluded.position;\n`
    + `insert into ranked_private.memberships ${records(memberships, 'player_id text, competition text')} on conflict (player_id, competition) do nothing;\n`
    + `delete from ranked_private.rivals where player_id in (select id from jsonb_to_recordset(${quoted(roster)}) as x(id text, country text, position text));\n`
    + `insert into ranked_private.rivals ${records(rivals, 'player_id text, candidate_id text, tier integer, similarity double precision, competitions text[]')};\n`
    + 'commit;\n';
  return { sql, players: roster.length, candidates: candidates.length, rivals: rivals.length, memberships: memberships.length };
}

function writeAtomically(entries) {
  const prepared = [];
  try {
    for (const [target, content] of entries) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
      fs.writeFileSync(temporary, content);
      prepared.push([temporary, target]);
    }
    for (const [temporary, target] of prepared) fs.renameSync(temporary, target);
  } finally {
    for (const [temporary] of prepared) if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function usage() {
  return 'Usage: roster-batch.mjs <audit|integrate|promotions|guard|migration> [options]';
}

async function main(argv) {
  const { command, options } = parseArgs(argv);
  const root = fs.realpathSync(path.resolve(options.root ?? DEFAULT_ROOT));
  if (command === 'audit') {
    if (!options['batch-dir']) throw new Error('audit requires --batch-dir');
    const { report } = audit(root, path.resolve(root, options['batch-dir']));
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
    return;
  }
  if (command === 'integrate') {
    if (!options['batch-dir']) throw new Error('integrate requires --batch-dir');
    const result = audit(root, path.resolve(root, options['batch-dir']), { allowGeneratedDrift: true });
    if (!result.report.passed) {
      console.log(JSON.stringify(result.report));
      process.exitCode = 1;
      return;
    }
    const changed = result.projected.html !== fs.readFileSync(result.paths.htmlPath, 'utf8')
      || JSON.stringify(result.projected.verifiedPlayers) !== JSON.stringify(readJson(result.paths.playersPath, []))
      || JSON.stringify(result.projected.bank) !== JSON.stringify(readJson(result.paths.bankPath, []));
    if (options.write && changed) {
      writeAtomically([
        [result.paths.htmlPath, result.projected.html],
        [result.paths.playersPath, `${JSON.stringify(result.projected.verifiedPlayers, null, 2)}\n`],
        [result.paths.bankPath, `${JSON.stringify(result.projected.bank, null, 2)}\n`],
      ]);
    }
    console.log(JSON.stringify({ ...result.report, changed, written: Boolean(options.write && changed), files: Object.values(result.paths) }));
    return;
  }
  if (command === 'promotions') {
    let ids = options.ids?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
    if (options.shortlist) {
      const shortlist = readJson(path.resolve(root, options.shortlist), null);
      if (!shortlist?.candidates) throw new Error('--shortlist must contain candidates');
      ids = shortlist.candidates
        .filter(candidate => candidate.decision === 'selected' && candidate.existingStatus === 'bank-promotion')
        .map(candidate => candidate.proposedId);
    }
    if (!ids.length) throw new Error('promotions requires --ids id1,id2 or --shortlist FILE');
    const report = promotionImpact(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), ids);
    console.log(JSON.stringify(report));
    return;
  }
  if (command === 'guard') {
    const report = guard(root, options.base ?? 'HEAD', options.html ? path.resolve(root, options.html) : undefined);
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
    return;
  }
  if (command === 'migration') {
    if (!options.output) throw new Error('migration requires --output');
    if (Boolean(options.write) === Boolean(options.check)) throw new Error('migration requires exactly one of --write or --check');
    const generated = migrationSql(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    const output = path.resolve(root, options.output);
    const migrationsDir = path.join(root, 'supabase', 'migrations');
    const migrationRelative = path.relative(migrationsDir, output);
    if (!migrationRelative || path.dirname(output) !== migrationsDir || path.extname(output) !== '.sql') {
      throw new Error(`Migration output must be a new .sql file under ${migrationsDir}`);
    }
    if (fs.realpathSync(migrationsDir) !== migrationsDir) {
      throw new Error(`Migration directory must not be a symbolic link: ${migrationsDir}`);
    }
    if (options.check) {
      if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated.sql) throw new Error(`Forward migration is stale: ${output}`);
    } else {
      if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing migration: ${output}. Use --check or choose a new forward-migration path.`);
      writeAtomically([[output, generated.sql]]);
    }
    console.log(JSON.stringify({ players: generated.players, candidates: generated.candidates, rivals: generated.rivals, memberships: generated.memberships, output, written: Boolean(options.write), check: Boolean(options.check) }));
    return;
  }
  throw new Error(command ? `Unknown command: ${command}` : usage());
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
