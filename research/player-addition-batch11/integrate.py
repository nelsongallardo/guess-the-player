#!/usr/bin/env python3
"""Integrate the reviewed batch-11 records (210 -> 220) into the portable runtime.

Unlike batch 10, this batch promotes nothing from the wrong-answer bank: all ten
players are freshly researched playable additions. The wrong-answer bank
(DISTRACTOR_PROFILES / research/verified-distractors.json) is therefore read
only to build the full rival-candidate universe for incorrectOptions and is
otherwise left completely untouched.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = Path(__file__).resolve().parent
HTML_PATH = ROOT / "index.html"
PLAYERS_PATH = ROOT / "research/verified-players.json"
BANK_PATH = ROOT / "research/verified-distractors.json"

records = json.loads((BATCH / "records.json").read_text())
spanish = json.loads((BATCH / "spanish-notes.json").read_text())
crest_records = json.loads((BATCH / "crest-assets.json").read_text())
origin_systems = json.loads((BATCH / "origin-systems.json").read_text())
assert len(records) == 10
assert {r["id"] for r in records} == set(origin_systems)
assert sum(r["continent"] == "Europe" for r in records) == 5
assert sum(r["continent"] == "South America" for r in records) == 5
assert set(spanish) == {r["id"] for r in records}

html = HTML_PATH.read_text()
decoder = json.JSONDecoder()


def extract_json(source: str, marker: str):
    marker_at = source.index(marker) + len(marker)
    value_at = marker_at
    while source[value_at].isspace():
        value_at += 1
    value, consumed = decoder.raw_decode(source[value_at:])
    return value, value_at, value_at + consumed


inline_players, players_start, players_end = extract_json(html, "const PLAYERS =")
crest_assets, assets_start, assets_end = extract_json(html, "const CREST_ASSETS =")
spanish_notes, notes_start, notes_end = extract_json(html, "const SPANISH_NOTES =")
inline_bank, _bank_start, _bank_end = extract_json(html, "const DISTRACTOR_PROFILES =")
verified_players = json.loads(PLAYERS_PATH.read_text())
bank = json.loads(BANK_PATH.read_text())

assert len(inline_players) == len(verified_players) == 210
assert {p["id"] for p in inline_players} == {p["id"] for p in verified_players}
new_ids = {r["id"] for r in records}
assert not new_ids & {p["id"] for p in inline_players}
assert not new_ids & {p["name"] for p in inline_players}

# Build the club -> crest URL map from the existing inline roster.
club_crest: dict[str, str] = {}
for player in inline_players:
    assert len(player["clubs"]) == len(player["clubCrests"])
    for club, crest_url in zip(player["clubs"], player["clubCrests"]):
        existing = club_crest.setdefault(club["name"], crest_url)
        assert existing == crest_url, f"Conflicting existing crest for {club['name']}"

# Reserve teams reuse their parent club's crest, matching the established
# Bayern Munich/Bayern Munich II and Sporting CP/Sporting CP B precedent.
reserve_aliases = {
    "Schalke 04 II": "Schalke 04",
    "Sevilla Atlético": "Sevilla",
}
for reserve, parent in reserve_aliases.items():
    if reserve not in club_crest:
        assert parent in club_crest, f"Parent club {parent} has no existing crest"
        club_crest[reserve] = club_crest[parent]

missing_clubs = {club["name"] for record in records for club in record["clubs"] if club["name"] not in club_crest}
assert set(crest_records) == missing_clubs, (
    "crest-assets.json does not match the clubs missing from the existing map",
    sorted(missing_clubs - set(crest_records)),
    sorted(set(crest_records) - missing_clubs),
)
for club, asset in crest_records.items():
    source_url = asset["sourceURL"]
    club_crest[club] = source_url
    embedded = {
        "sourceUrl": source_url,
        "dataUrl": asset["dataUrl"],
        "sourcePage": asset["sourcePage"],
        "notes": (
            "Public club crest source reviewed for batch 11. Decoded and resized to a maximum "
            f"of 128px PNG. Source page identifies {asset['sourceTitle']}. Current/source-era "
            "crest, not necessarily historical career-era crest."
        ),
    }
    assert source_url not in crest_assets, f"Crest URL already present: {source_url}"
    crest_assets[source_url] = embedded

new_inline = []
for record in records:
    inline = dict(record)
    inline["clubCrests"] = [club_crest[club["name"]] for club in record["clubs"]]
    new_inline.append(inline)

verified_players = verified_players + records
assert len(verified_players) == 220
assert len({p["id"] for p in verified_players}) == 220
assert len({p["name"] for p in verified_players}) == 220

combined = inline_players + new_inline
assert len(combined) == 220


def signature(profile) -> tuple[str, ...]:
    return tuple(club["name"] if isinstance(club, dict) else club for club in profile["clubs"])


candidate_profiles = [*combined, *bank]
assert len(candidate_profiles) == len(combined) + len(bank)
assert len({c["id"] for c in candidate_profiles}) == len(candidate_profiles)
assert len({c["name"] for c in candidate_profiles}) == len(candidate_profiles)
for record in records:
    assert sum(signature(p) == signature(record) for p in combined) == 1, record["id"]

# Regenerate incorrectOptions for EVERY playable player (not only the new ten):
# the rival-candidate universe just grew by ten names, so every existing
# player's exclusion-only pool must include them too (and vice versa).
for player in combined:
    player["incorrectOptions"] = [
        candidate["name"]
        for candidate in candidate_profiles
        if candidate["id"] != player["id"] and signature(candidate) != signature(player)
    ]
    assert len(player["incorrectOptions"]) >= 9

for record_id, entry in spanish.items():
    spanish_notes[record_id] = entry
assert len(spanish_notes) == 220

replacements = [
    (players_start, players_end, json.dumps(combined, ensure_ascii=False, indent=2)),
    (assets_start, assets_end, json.dumps(crest_assets, ensure_ascii=False, indent=2)),
    (notes_start, notes_end, json.dumps(spanish_notes, ensure_ascii=False, indent=2)),
]
for start, end, replacement in sorted(replacements, reverse=True):
    html = html[:start] + replacement + html[end:]

origins_match = re.search(r"  const ORIGIN_CLUBS = \{\n(?P<body>[\s\S]*?)\n  \};", html)
assert origins_match
origin_body = origins_match.group("body")
additions: dict[str, set[str]] = {}
for record in records:
    first_club = re.sub(r" [BC]$", "", record["clubs"][0]["name"])
    additions.setdefault(origin_systems[record["id"]], set()).add(first_club)

for system, clubs in sorted(additions.items()):
    pattern = rf"^(    {re.escape(system)}: )(?P<array>\[[^\n]*\])(?P<comma>,?)$"
    match = re.search(pattern, origin_body, flags=re.MULTILINE)
    assert match, f"Unknown origin system {system}"
    current = ast.literal_eval(match.group("array"))
    for club in sorted(clubs):
        if club not in current:
            current.append(club)
    line = match.group(1) + json.dumps(current, ensure_ascii=False) + match.group("comma")
    origin_body = origin_body[:match.start()] + line + origin_body[match.end():]
html = html[:origins_match.start("body")] + origin_body + html[origins_match.end("body"):]

count_replacements = {
    "210 players": "220 players",
    "210-player": "220-player",
    "210 jugadores": "220 jugadores",
    "210 PLAYERS": "220 PLAYERS",
    "210 JUGADORES": "220 JUGADORES",
    "105 EUROPE / 105 SOUTH AMERICA": "110 EUROPE / 110 SOUTH AMERICA",
    "105 EUROPA / 105 SUDAMÉRICA": "110 EUROPA / 110 SUDAMÉRICA",
    "105 Europe / 105 South America": "110 Europe / 110 South America",
    "105 de Europa y 105 de Sudamérica": "110 de Europa y 110 de Sudamérica",
}
for old, new in count_replacements.items():
    html = html.replace(old, new)

PLAYERS_PATH.write_text(json.dumps(verified_players, ensure_ascii=False, indent=2) + "\n")
HTML_PATH.write_text(html)
print(json.dumps({
    "players": len(combined),
    "bankOnly": len(bank),
    "candidates": len(candidate_profiles),
    "crestMappings": len(crest_records),
    "crestAssets": len(crest_assets),
    "spanishNotes": len(spanish_notes),
}))
