#!/usr/bin/env python3
"""Assemble the reviewed research batches; abort on missing/draft profiles."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BATCHES = [
    ('contemporary-distractors-research.json', 1, 'CONTEMPORARY_DISTRACTOR_SOURCES.md'),
    ('distractor-west-europe.json', 6, 'DISTRACTOR_WEST_EUROPE_SOURCES.md'),
    ('distractor-north-europe.json', 15, 'DISTRACTOR_NORTH_EUROPE_SOURCES.md'),
    ('distractor-south-america.json', 11, 'DISTRACTOR_SOUTH_AMERICA_SOURCES.md'),
    ('distractor-brazil-italy.json', 4, 'DISTRACTOR_BRAZIL_ITALY_SOURCES.md'),
    ('distractor-additional.json', 1, 'DISTRACTOR_ADDITIONAL_SOURCES.md'),
    ('distractor-netherlands-extra.json', 5, 'DISTRACTOR_NETHERLANDS_EXTRA_SOURCES.md'),
    ('distractor-era-gaps.json', 1, 'DISTRACTOR_ERA_GAPS_SOURCES.md'),
    ('distractor-fourth-expansion.json', 9, 'DISTRACTOR_FOURTH_EXPANSION_SOURCES.md'),
    ('distractor-zico-era.json', 0, 'DISTRACTOR_ZICO_ERA_SOURCES.md'),
    ('distractor-figo-era.json', 1, 'DISTRACTOR_FIGO_ERA_SOURCES.md'),
    ('distractor-roster-batch7-gaps.json', 5, 'DISTRACTOR_ROSTER_BATCH7_GAPS_SOURCES.md'),
    ('distractor-batch9-support.json', 1, 'DISTRACTOR_BATCH9_SUPPORT_SOURCES.md'),
    ('distractor-batch9-sweden-support.json', 3, 'DISTRACTOR_BATCH9_SWEDEN_SUPPORT_SOURCES.md'),
    ('distractor-batch9-chile-support.json', 4, 'DISTRACTOR_BATCH9_CHILE_SUPPORT_SOURCES.md'),
    ('distractor-batch9-uruguay-peru-support.json', 5, 'DISTRACTOR_BATCH9_URUGUAY_PERU_SUPPORT_SOURCES.md'),
    ('distractor-batch9-peru-late-support.json', 1, 'DISTRACTOR_BATCH9_PERU_LATE_SUPPORT_SOURCES.md'),
]
bank = []
for filename, expected, ledger_name in BATCHES:
    data = json.loads((ROOT / 'research' / filename).read_text())
    assert len(data) == expected, f'{filename}: expected {expected}, got {len(data)}'
    ledger = (ROOT / 'research' / ledger_name).read_text()
    for p in data:
        if filename == 'contemporary-distractors-research.json':
            # This early batch predates the common bank schema. Its first
            # senior clubs and Argentine system are documented in its ledger.
            p['system'] = 'argentina'
            p['region'] = 'south-america'
            section = ledger.split('## ' + p['name'] + '\n', 1)[1].split('\n## ', 1)[0]
            p['notes'] = section.split('### Scope decisions and uncertainties\n', 1)[1].split('### Literal retrieved evidence')[0].strip()
        p['system'] = p['system'].lower()
        p['region'] = p['region'].lower()
        p['position'] = ' / '.join(role.strip() for role in p['position'].split('/'))
        p['verifiedAt'] = '2026-09-12'
        p['evidenceFile'] = 'research/' + ledger_name
        # Distinguish Santos's José Macia from the modern Portugal defender.
        if p['id'] == 'pepe':
            p['name'] = 'Pepe (José Macia)'
        assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', p['id']), p['id']
        assert p['clubs'] and all(isinstance(c, str) and c.strip() for c in p['clubs']), p['id']
        assert p['notes'] and 'DRAFT' not in p['notes'], p['id']
        domains = {urlparse(s['url']).netloc.removeprefix('www.') for s in p['sources']}
        assert len(domains) >= 2, p['id'] + ': independent source domains'
        for source in p['sources']:
            assert source['url'] in ledger, p['id'] + ': missing literal source URL in ledger'
            assert len(source['excerpt']) > 20, p['id'] + ': missing source excerpt'
        bank.append(p)
for key in ('id', 'name'):
    assert len({p[key] for p in bank}) == len(bank), f'Duplicate {key}'
assert len(bank) == sum(n for _, n, _ in BATCHES)
# Inputs remain evidence records when a profile is promoted. Never emit a
# wrong-answer-only profile whose ID now belongs to the playable roster.
playable_ids = {p['id'] for p in json.loads((ROOT / 'research/verified-players.json').read_text())}
bank = [p for p in bank if p['id'] not in playable_ids]
(ROOT / 'research/verified-distractors.json').write_text(json.dumps(bank, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'assembled': len(bank), 'batches': len(BATCHES)}))
