#!/usr/bin/env python3
"""Embed the reviewed candidate bank without touching playable data or assets."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
bank = json.loads((ROOT / 'research/verified-distractors.json').read_text())
assert bank, 'Refuse to publish an empty candidate bank'
for key in ('id', 'name'):
    assert len({p[key] for p in bank}) == len(bank), f'Duplicate {key}'
playable = json.loads((ROOT / 'research/verified-players.json').read_text())
for key in ('id', 'name'):
    assert not ({p[key] for p in bank} & {p[key] for p in playable}), f'Bank overlaps playable {key}'
roles = {'Defender', 'Midfielder', 'Forward', 'Goalkeeper'}
for p in bank:
    assert p['clubs'] and all(isinstance(c, str) and c.strip() for c in p['clubs']), p['id']
    assert isinstance(p['start'], int) and isinstance(p['end'], int) and p['start'] <= p['end'], p['id']
    assert p['sources'] and p['notes'] and 'DRAFT' not in p['notes'], p['id']
    assert all(role in roles for role in p['position'].split(' / ')), p['id']
    assert re.fullmatch(r'[a-z]+', p['system']), p['id']
    assert p['region'] in ('europe', 'south-america'), p['id']
html_path = ROOT / 'index.html'
html = html_path.read_text()
pattern = r'(  // BEGIN DISTRACTOR BANK\n)  const DISTRACTOR_PROFILES = [\s\S]*?;(\n  // END DISTRACTOR BANK)'
assert len(re.findall(pattern, html)) == 1, 'Expected one bank boundary'
# Source excerpts are data, never markup or executable inline script content.
literal = json.dumps(bank, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
updated = re.sub(pattern, lambda m: m[1] + '  const DISTRACTOR_PROFILES = ' + literal + ';' + m[2], html)
html_path.write_text(updated)
print(json.dumps({'embeddedProfiles': len(bank), 'artifact': str(html_path)}))
