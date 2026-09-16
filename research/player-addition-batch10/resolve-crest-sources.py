#!/usr/bin/env python3
"""Resolve reviewed Batch 10 crest sources from club infoboxes and explicit overrides."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CANDIDATES = HERE / "crest-infobox-candidates.tmp.json"
OVERRIDES = HERE / "crest-source-overrides.json"
OUTPUT = HERE / "crest-sources-reviewed.json"
UNRESOLVED = HERE / "crest-sources-unresolved.json"

records = json.loads((HERE / "records.json").read_text())
shortlist = json.loads((HERE / "candidate-shortlist.json").read_text())
baseline_commit = shortlist["baseline"]["commit"]
html = subprocess.check_output(
    ["git", "show", f"{baseline_commit}:index.html"],
    cwd=ROOT,
    text=True,
)
decoder = json.JSONDecoder()


def extract(marker: str):
    start = html.index(marker) + len(marker)
    while html[start].isspace():
        start += 1
    return decoder.raw_decode(html[start:])[0]


players = extract("const PLAYERS =")
assets = extract("const CREST_ASSETS =")
existing_club_sources: dict[str, str] = {}
for player in players:
    for club, source_url in zip(player["clubs"], player["clubCrests"]):
        previous = existing_club_sources.setdefault(club["name"], source_url)
        assert previous == source_url, club["name"]

# A reserve may use its parent crest; these aliases name the identical club or
# the parent whose crest the data policy explicitly permits for a reserve side.
EXISTING_ALIASES = {
    "Atlético Madrileño": "Atlético Madrid",
    "Bayer Leverkusen II": "Bayer Leverkusen",
    "FC Basel": "Basel",
    "FC Basel II": "Basel",
    "FC Basel U21": "Basel",
    "Universitario de Deportes": "Universitario",
}

SAME_BATCH_ALIASES = {
    "Brøndby IF": "Brøndby",
    "Dynamo Kyiv-2": "Dynamo Kyiv",
}


def existing_entry(club: str, alias: str) -> dict:
    source_url = existing_club_sources[alias]
    asset = assets[source_url]
    candidate = candidates.get(club, {})
    return {
        "sourceURL": source_url,
        "sourcePage": asset.get("sourcePage") or candidate.get("sourcePage") or source_url,
        "sourceTitle": f"{alias} (reviewed identical-club/parent crest reuse for {club})",
    }


def plausible_crest(image: dict) -> bool:
    path = urlparse(image["src"]).path.lower()
    alt = image.get("alt", "").lower()
    if any(token in path for token in ("kit_", "jersey", "uniform", "stadium")):
        return False
    if any(token in path or token in alt for token in ("logo", "crest", "escudo", "badge", "emblem", "shield")):
        return True
    try:
        width = int(image.get("width") or 0)
        height = int(image.get("height") or 0)
    except ValueError:
        return False
    return width >= 75 and height >= 75


missing_clubs = sorted({club["name"] for record in records for club in record["clubs"]} - set(existing_club_sources))
candidates = json.loads(CANDIDATES.read_text())
overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
resolved: dict[str, dict] = {}
unresolved: dict[str, dict] = {}
for club in missing_clubs:
    if club in overrides:
        item = overrides[club]
        assert set(item) in ({"sourceURL", "sourcePage", "sourceTitle"}, {"sourceURL", "sourcePage", "sourceTitle", "sourceCrop"}), club
        if "sourceCrop" in item:
            assert len(item["sourceCrop"]) == 4 and all(isinstance(value, int) for value in item["sourceCrop"]), club
        resolved[club] = item
        continue
    alias = EXISTING_ALIASES.get(club)
    if alias:
        resolved[club] = existing_entry(club, alias)
        continue
    alias = SAME_BATCH_ALIASES.get(club)
    if alias:
        assert alias in resolved, (club, alias)
        resolved[club] = {
            **resolved[alias],
            "sourceTitle": f"{resolved[alias]['sourceTitle']} (reviewed identical-club/parent crest reuse for {club})",
        }
        continue
    candidate = candidates.get(club)
    images = candidate.get("images", []) if candidate else []
    image = next((item for item in images if plausible_crest(item)), None)
    if candidate and candidate.get("sourcePage") and image:
        resolved[club] = {
            "sourceURL": image["src"],
            "sourcePage": candidate["sourcePage"],
            "sourceTitle": candidate["sourceTitle"],
        }
    else:
        unresolved[club] = {
            "candidate": candidate,
            "reason": "no reviewed plausible crest image; add an explicit source override",
        }

UNRESOLVED.write_text(json.dumps(unresolved, ensure_ascii=False, indent=2) + "\n")
OUTPUT.write_text(json.dumps(resolved, ensure_ascii=False, indent=2) + "\n")
if unresolved:
    print(json.dumps({"missingClubs": len(missing_clubs), "resolved": len(resolved), "unresolved": len(unresolved), "unresolvedClubs": sorted(unresolved)}, ensure_ascii=False))
    raise SystemExit(1)
assert set(resolved) == set(missing_clubs)
print(json.dumps({"missingClubs": len(missing_clubs), "resolved": len(resolved), "uniqueSources": len({item['sourceURL'] for item in resolved.values()})}))
