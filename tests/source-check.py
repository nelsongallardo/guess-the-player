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
listed={int(n):url for n,url in re.findall(r'^\[(\d+)\] (https?://\S+)(?: — .*)?$',block,re.M)}
assert set(listed)==cited, 'Missing or extraneous source IDs'
for n in cited:
    assert listed[n]==ledger[n], f'Literal URL mismatch for [{n}]'
players=json.loads((root/'research/verified-players.json').read_text())
for p in players:
    assert f'### {p["name"]}\n' in body
    assert len({s['url'] for s in p['sources']})>=2
    assert all(s['url'] in ledger.values() or s['url'].rstrip('/') in ledger.values() for s in p['sources'])
audit=(root/'DATA_AUDIT.md').read_text()
audit_body,audit_block=audit.split('\nSources:\n')
audit_ledger={s['id']:s['url'] for s in json.loads((root/'research/reaudit-citations.json').read_text())['sources']}
audit_cited={int(n) for n in re.findall(r'\[(\d+)\]',audit_body)}
audit_listed={int(n):url for n,url in re.findall(r'^\[(\d+)\] (https?://\S+)(?: — .*)?$',audit_block,re.M)}
assert audit_listed=={n:audit_ledger[n] for n in audit_cited}, 'Re-audit literal source URL mismatch'
assert len(re.findall(r'^### ',audit_body,re.M))==len(players)
for p in players:assert f'### {p["name"]}\n' in audit_body
print(json.dumps({'passed':True,'playerSections':len(players),'citedSourceURLs':len(cited),'ledgerSourceURLs':len(ledger),'reauditedPlayerSections':len(players),'reauditCitedSourceURLs':len(audit_cited),'literalURLsMatch':True}))
