#!/usr/bin/env python3
"""Integrate the reviewed batch-9 records into the portable runtime."""

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
shortlist = json.loads((BATCH / "candidate-shortlist.json").read_text())
crest_records = json.loads((BATCH / "crest-assets.json").read_text())
selected = set(shortlist["results"]["selected"])
assert len(records) == len(selected) == 50
assert {record["id"] for record in records} == selected

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
verified_players = json.loads(PLAYERS_PATH.read_text())
bank = json.loads(BANK_PATH.read_text())
remaining_bank = [profile for profile in bank if profile["id"] not in selected]
assert len(remaining_bank) == 33
existing_ids = {player["id"] for player in verified_players}
published_selected = selected & existing_ids
assert len(verified_players) == 120
assert len(published_selected) == 10
missing_records = [record for record in records if record["id"] not in published_selected]
assert len(missing_records) == 40

# Preserve every established club-to-crest identity before adding new sources.
club_crest: dict[str, str] = {}
for player in inline_players:
    assert len(player["clubs"]) == len(player["clubCrests"])
    for club, crest_url in zip(player["clubs"], player["clubCrests"]):
        existing = club_crest.setdefault(club["name"], crest_url)
        assert existing == crest_url, f"Conflicting existing crest for {club['name']}"

missing_clubs = {club["name"] for record in missing_records for club in record["clubs"]}
for club, asset in crest_records.items():
    if club not in missing_clubs:
        continue
    source_url = asset["sourceURL"]
    if club not in club_crest:
        club_crest[club] = source_url
    embedded = {
        "sourceUrl": source_url,
        "dataUrl": asset["dataUrl"],
        "sourcePage": asset["sourcePage"],
        "notes": (
            "Public club crest source reviewed for batch 9. Decoded and resized to a maximum "
            f"of 128px PNG. Source page identifies {asset['sourceTitle']}. Current/source-era "
            "crest, not necessarily historical career-era crest."
        ),
    }
    # Preserve every already-published crest byte and attribution entry.
    crest_assets.setdefault(source_url, embedded)

clean_records = []
for record in missing_records:
    clean = {key: value for key, value in record.items() if key not in {"esNotes", "esClubNotes"}}
    clean_records.append(clean)

# Keep the established deck order and append this reviewed Europe/South America batch.
verified_players = verified_players + clean_records
assert len(verified_players) == 160
assert len({player["id"] for player in verified_players}) == 160
assert len({player["name"] for player in verified_players}) == 160
PLAYERS_PATH.write_text(json.dumps(verified_players, ensure_ascii=False, indent=2) + "\n")
BANK_PATH.write_text(json.dumps(remaining_bank, ensure_ascii=False, indent=2) + "\n")

inline_by_id = {player["id"]: player for player in inline_players}
combined = []
for player in verified_players:
    if player["id"] in selected and player["id"] not in published_selected:
        inline = dict(player)
        inline["clubCrests"] = [club_crest[club["name"]] for club in player["clubs"]]
    else:
        inline = inline_by_id[player["id"]]
    combined.append(inline)

# Every playable target can draw from the complete expanded candidate universe.
def signature(profile) -> tuple[str, ...]:
    clubs = profile["clubs"]
    return tuple(club["name"] if isinstance(club, dict) else club for club in clubs)

candidate_profiles = [*combined, *remaining_bank]
assert len(candidate_profiles) == 193
assert len({profile["name"] for profile in candidate_profiles}) == 193
for player in combined:
    player["incorrectOptions"] = [
        candidate["name"]
        for candidate in candidate_profiles
        if candidate["id"] != player["id"] and signature(candidate) != signature(player)
    ]
    assert len(player["incorrectOptions"]) >= 9

for record in missing_records:
    club_notes = ["" for _ in record["clubs"]]
    for index, text in record["esClubNotes"].items():
        club_notes[int(index)] = text
    spanish_notes[record["id"]] = {"notes": record["esNotes"], "clubNotes": club_notes}
assert len(spanish_notes) == 160

# Replace the three pure-data literals without reconstructing executable scripts.
replacements = [
    (players_start, players_end, json.dumps(combined, ensure_ascii=False, indent=2)),
    (assets_start, assets_end, json.dumps(crest_assets, ensure_ascii=False, indent=2)),
    (notes_start, notes_end, json.dumps(spanish_notes, ensure_ascii=False, indent=2)),
]
for start, end, replacement in sorted(replacements, reverse=True):
    html = html[:start] + replacement + html[end:]

# Once promoted profiles leave the bank, their first clubs need explicit origins.
origins_match = re.search(r"  const ORIGIN_CLUBS = \{\n(?P<body>[\s\S]*?)\n  \};", html)
assert origins_match
origin_body = origins_match.group("body")
country_system = {
    "Portugal": "portugal", "France": "france", "Netherlands": "netherlands",
    "Sweden": "sweden", "Norway": "norway", "Germany": "germany",
    "Italy": "italy", "Czech Republic": "czechia", "Argentina": "argentina",
    "Brazil": "brazil", "Chile": "chile", "Uruguay": "uruguay",
    "Colombia": "colombia", "Peru": "peru", "Paraguay": "paraguay",
}
additions: dict[str, set[str]] = {}
for record in missing_records:
    first_club = record["clubs"][0]["name"]
    first_club = re.sub(r" [BC]$", "", first_club)
    additions.setdefault(country_system[record["country"]], set()).add(first_club)
for system, clubs in additions.items():
    pattern = rf"^(    {re.escape(system)}: )(?P<array>\[[^\n]*\])(?P<comma>,?)$"
    match = re.search(pattern, origin_body, flags=re.MULTILINE)
    assert match, f"Missing origin system {system}"
    current = ast.literal_eval(match.group("array"))
    for club in sorted(clubs):
        if club not in current:
            current.append(club)
    line = match.group(1) + json.dumps(current, ensure_ascii=False) + match.group("comma")
    origin_body = origin_body[:match.start()] + line + origin_body[match.end():]
html = html[:origins_match.start("body")] + origin_body + html[origins_match.end("body"):]

# Update user-facing roster totals without touching image IDs or historical fixtures.
count_replacements = {
    "120 players": "160 players",
    "120-player": "160-player",
    "120 jugadores": "160 jugadores",
    "120 PLAYERS": "160 PLAYERS",
    "120 JUGADORES": "160 JUGADORES",
    "60 EUROPE / 60 SOUTH AMERICA": "80 EUROPE / 80 SOUTH AMERICA",
    "60 EUROPA / 60 SUDAMÉRICA": "80 EUROPA / 80 SUDAMÉRICA",
    "60 Europe / 60 South America": "80 Europe / 80 South America",
    "60 de Europa y 60 de Sudamérica": "80 de Europa y 80 de Sudamérica",
    "110 players": "160 players",
    "110-player": "160-player",
    "110 jugadores": "160 jugadores",
    "110 PLAYERS": "160 PLAYERS",
    "110 JUGADORES": "160 JUGADORES",
    "55 EUROPE / 55 SOUTH AMERICA": "80 EUROPE / 80 SOUTH AMERICA",
    "55 EUROPA / 55 SUDAMÉRICA": "80 EUROPA / 80 SUDAMÉRICA",
    "55 Europe / 55 South America": "80 Europe / 80 South America",
    "55 de Europa y 55 de Sudamérica": "80 de Europa y 80 de Sudamérica",
}
for old, new in count_replacements.items():
    html = html.replace(old, new)

HTML_PATH.write_text(html)
print(json.dumps({
    "players": len(combined),
    "bankOnly": len(remaining_bank),
    "candidates": len(candidate_profiles),
    "newCrestSources": len({asset["sourceURL"] for asset in crest_records.values()}),
    "spanishNotes": len(spanish_notes),
}))
