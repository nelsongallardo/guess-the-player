#!/usr/bin/env python3
"""Integrate the reviewed batch-10 records into the portable runtime."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BATCH = Path(__file__).resolve().parent
HTML_PATH = ROOT / "index.html"
PLAYERS_PATH = ROOT / "research/verified-players.json"
BANK_PATH = ROOT / "research/verified-distractors.json"
PEER_BANK_PATH = BATCH / "peer-bank-records.json"

records = json.loads((BATCH / "records.json").read_text())
selection = json.loads((BATCH / "selected-ids.json").read_text())
crest_records = json.loads((BATCH / "crest-assets.json").read_text())
origin_systems = json.loads((BATCH / "origin-systems.json").read_text())
selected = set(sum(selection["continents"].values(), []))
assert len(records) == len(selected) == 50
assert {record["id"] for record in records} == selected
assert set(origin_systems) == selected
assert sum(record["continent"] == "Europe" for record in records) == 25
assert sum(record["continent"] == "South America" for record in records) == 25

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
inline_bank, bank_start, bank_end = extract_json(html, "const DISTRACTOR_PROFILES =")
verified_players = json.loads(PLAYERS_PATH.read_text())
bank = json.loads(BANK_PATH.read_text())
peer_bank = json.loads(PEER_BANK_PATH.read_text()) if PEER_BANK_PATH.exists() else []
assert len(peer_bank) == 36
assert len({profile["id"] for profile in peer_bank}) == len(peer_bank)
for profile in peer_bank:
    assert profile["clubs"] and all(isinstance(club, str) for club in profile["clubs"]), profile["id"]
    assert len(profile["sources"]) >= 2, profile["id"]
    assert len({urlparse(source["url"]).netloc.removeprefix("www.") for source in profile["sources"]}) >= 2, profile["id"]
    assert all(source.get("excerpt", "").strip() for source in profile["sources"]), profile["id"]
assert len(inline_players) == len(verified_players) in {160, 210}
assert {player["id"] for player in inline_players} == {player["id"] for player in verified_players}
if len(verified_players) == 160:
    assert not selected & {player["id"] for player in verified_players}
remaining_bank_by_id = {
    profile["id"]: profile
    for profile in [*bank, *peer_bank]
    if profile["id"] not in selected
}
remaining_bank = list(remaining_bank_by_id.values())
assert remaining_bank and remaining_bank[0]["id"] == "franco-baresi"

club_crest: dict[str, str] = {}
for player in inline_players:
    assert len(player["clubs"]) == len(player["clubCrests"])
    for club, crest_url in zip(player["clubs"], player["clubCrests"]):
        existing = club_crest.setdefault(club["name"], crest_url)
        assert existing == crest_url, f"Conflicting existing crest for {club['name']}"

missing_clubs = {club["name"] for record in records for club in record["clubs"] if club["name"] not in club_crest}
if len(inline_players) == 160:
    assert set(crest_records) == missing_clubs, (sorted(missing_clubs - set(crest_records)), sorted(set(crest_records) - missing_clubs))
else:
    assert not missing_clubs
for club, asset in crest_records.items():
    source_url = asset["sourceURL"]
    club_crest[club] = source_url
    embedded = {
        "sourceUrl": source_url,
        "dataUrl": asset["dataUrl"],
        "sourcePage": asset["sourcePage"],
        "notes": (
            "Public club crest source reviewed for batch 10. Decoded and resized to a maximum "
            f"of 128px PNG. Source page identifies {asset['sourceTitle']}. Current/source-era "
            "crest, not necessarily historical career-era crest."
        ),
    }
    if source_url not in crest_assets:
        crest_assets[source_url] = embedded

clean_records = [{key: value for key, value in record.items() if key not in {"esNotes", "esClubNotes"}} for record in records]
if len(verified_players) == 160:
    verified_players = verified_players + clean_records
assert len(verified_players) == 210
assert len({player["id"] for player in verified_players}) == 210
assert len({player["name"] for player in verified_players}) == 210

inline_by_id = {player["id"]: player for player in inline_players}
combined = []
for player in verified_players:
    if player["id"] in selected:
        inline = dict(player)
        inline["clubCrests"] = [club_crest[club["name"]] for club in player["clubs"]]
    else:
        inline = inline_by_id[player["id"]]
    combined.append(inline)


def signature(profile) -> tuple[str, ...]:
    return tuple(club["name"] if isinstance(club, dict) else club for club in profile["clubs"])


candidate_profiles = [*combined, *remaining_bank]
assert len(candidate_profiles) == len(combined) + len(remaining_bank)
assert len({profile["id"] for profile in candidate_profiles}) == len(candidate_profiles)
assert len({profile["name"] for profile in candidate_profiles}) == len(candidate_profiles)
for record in records:
    assert sum(signature(player) == signature(record) for player in combined) == 1, record["id"]
for player in combined:
    player["incorrectOptions"] = [
        candidate["name"]
        for candidate in candidate_profiles
        if candidate["id"] != player["id"] and signature(candidate) != signature(player)
    ]
    assert len(player["incorrectOptions"]) >= 9

for record in records:
    club_notes = ["" for _ in record["clubs"]]
    for index, text in record["esClubNotes"].items():
        club_notes[int(index)] = text
    spanish_notes[record["id"]] = {"notes": record["esNotes"], "clubNotes": club_notes}
assert len(spanish_notes) == 210

replacements = [
    (players_start, players_end, json.dumps(combined, ensure_ascii=False, indent=2)),
    (assets_start, assets_end, json.dumps(crest_assets, ensure_ascii=False, indent=2)),
    (notes_start, notes_end, json.dumps(spanish_notes, ensure_ascii=False, indent=2)),
    (bank_start, bank_end, json.dumps(remaining_bank, ensure_ascii=False, indent=2)),
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
for profile in peer_bank:
    first_club = re.sub(r" [BC]$", "", profile["clubs"][0])
    additions.setdefault(profile["system"], set()).add(first_club)

# Make reruns deterministic when a reviewed first-club classification changes:
# remove every Batch 10 origin club from all prior buckets before adding it to
# its single reviewed domestic system.
assigned_clubs = set().union(*additions.values())
def remove_reassigned_clubs(match: re.Match[str]) -> str:
    current = [club for club in ast.literal_eval(match.group("array")) if club not in assigned_clubs]
    return match.group("prefix") + json.dumps(current, ensure_ascii=False) + match.group("comma")
origin_body = re.sub(
    r"^(?P<prefix>    [a-z-]+: )(?P<array>\[[^\n]*\])(?P<comma>,?)$",
    remove_reassigned_clubs,
    origin_body,
    flags=re.MULTILINE,
)
for system, clubs in sorted(additions.items()):
    pattern = rf"^(    {re.escape(system)}: )(?P<array>\[[^\n]*\])(?P<comma>,?)$"
    match = re.search(pattern, origin_body, flags=re.MULTILINE)
    if match:
        current = ast.literal_eval(match.group("array"))
        for club in sorted(clubs):
            if club not in current:
                current.append(club)
        line = match.group(1) + json.dumps(current, ensure_ascii=False) + match.group("comma")
        origin_body = origin_body[:match.start()] + line + origin_body[match.end():]
    else:
        last = list(re.finditer(r"^    [a-z-]+: \[[^\n]*\](?:,)?$", origin_body, flags=re.MULTILINE))[-1]
        old_line = last.group(0).rstrip(',') + ','
        new_line = f'    {system}: ' + json.dumps(sorted(clubs), ensure_ascii=False)
        origin_body = origin_body[:last.start()] + old_line + "\n" + new_line + origin_body[last.end():]
html = html[:origins_match.start("body")] + origin_body + html[origins_match.end("body"):]

country_translations = {
    "Croatia": "Croacia",
    "Denmark": "Dinamarca",
    "Finland": "Finlandia",
    "Romania": "Rumanía",
    "Turkey": "Turquía",
    "Ukraine": "Ucrania",
    "Yugoslavia / Serbia and Montenegro": "Yugoslavia / Serbia y Montenegro",
}
countries_match = re.search(r"const COUNTRIES_ES = \{(?P<body>[^\n]*)\};", html)
assert countries_match
countries_body = countries_match.group("body")
for country, translated in country_translations.items():
    quoted_country = json.dumps(country, ensure_ascii=False)
    if re.search(rf"(?:^|,)\s*(?:{re.escape(quoted_country)}|{re.escape(country)}):", countries_body):
        continue
    countries_body += "," + quoted_country + ":" + json.dumps(translated, ensure_ascii=False)
html = html[:countries_match.start("body")] + countries_body + html[countries_match.end("body"):]

count_replacements = {
    "160 players": "210 players",
    "160-player": "210-player",
    "160 jugadores": "210 jugadores",
    "160 PLAYERS": "210 PLAYERS",
    "160 JUGADORES": "210 JUGADORES",
    "80 EUROPE / 80 SOUTH AMERICA": "105 EUROPE / 105 SOUTH AMERICA",
    "80 EUROPA / 80 SUDAMÉRICA": "105 EUROPA / 105 SUDAMÉRICA",
    "80 Europe / 80 South America": "105 Europe / 105 South America",
    "80 de Europa y 80 de Sudamérica": "105 de Europa y 105 de Sudamérica",
    "saved 30-, 40-, 50- and 60-player games finish their original deck": "saved games finish their original deck",
    "las partidas guardadas de 30, 40, 50 y 60 terminan con su lista original": "las partidas guardadas terminan con su lista original",
}
for old, new in count_replacements.items():
    html = html.replace(old, new)

PLAYERS_PATH.write_text(json.dumps(verified_players, ensure_ascii=False, indent=2) + "\n")
BANK_PATH.write_text(json.dumps(remaining_bank, ensure_ascii=False, indent=2) + "\n")
HTML_PATH.write_text(html)
print(json.dumps({
    "players": len(combined),
    "bankOnly": len(remaining_bank),
    "candidates": len(candidate_profiles),
    "crestMappings": len(crest_records),
    "crestAssets": len(crest_assets),
    "spanishNotes": len(spanish_notes),
}))
