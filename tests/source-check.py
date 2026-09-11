"""Check literal source identifiers; preserve parentheses in bare URLs.
This validates citation plumbing, not whether a historical claim is true.
"""
import json
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
text=(root/'CAREER_SOURCES.md').read_text()
body,block=text.split('\nSources:\n')
ledger={s['id']:s['url'] for s in json.loads((root/'research/game-ledger.json').read_text())['sources']}
cited={int(n) for n in re.findall(r'\[(\d+)\]',body)}
listed={int(n):url for n,url in re.findall(r'^\[(\d+)\] (https?://\S+)$',block,re.M)}
assert set(listed)==cited, 'Missing or extraneous source IDs'
for n in cited:
    assert listed[n]==ledger[n], f'Literal URL mismatch for [{n}]'
players=json.loads((root/'research/verified-players.json').read_text())
for p in players:
    assert f'### {p["name"]}\n' in body
    assert len({s['url'] for s in p['sources']})>=2
    assert all(s['url'].rstrip('/') in ledger.values() for s in p['sources'])
print(json.dumps({'passed':True,'playerSections':len(players),'citedSourceURLs':len(cited),'ledgerSourceURLs':len(ledger),'literalURLsMatch':True}))
