#!/usr/bin/env python3
"""Normalize the regional discovery portfolios into the canonical batch shortlist."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
selection = json.loads((HERE / "selected-ids.json").read_text())
selected = set(sum(selection["continents"].values(), []))
eu = json.loads((HERE / "europe-candidate-portfolio.json").read_text())
sa = json.loads((HERE / "south-america-candidate-portfolio.json").read_text())
current = json.loads((ROOT / "research/verified-players.json").read_text())
south_records = json.loads((HERE / "south-america-new-records.draft.json").read_text())
ALIASES = {
    "alex-de-souza": "alex",
    "adriano-leite-ribeiro": "adriano",
    "maicon-sisenando": "maicon",
}


def source_urls(candidate):
    values = candidate.get("sources", candidate.get("evidenceLeads", []))
    urls = []
    for value in values:
        url = value.get("url") if isinstance(value, dict) else value
        if url and url not in urls:
            urls.append(url)
    return urls


def normalize(candidate, continent):
    candidate_id = ALIASES.get(candidate["id"], candidate["id"])
    decision = "selected" if candidate_id in selected else candidate.get("decision", "reserve")
    if decision not in {"selected", "reserve", "rejected"}:
        decision = "reserve"
    return {
        "id": candidate_id,
        "name": candidate["name"],
        "continent": continent,
        "country": candidate.get("country", ""),
        "role": candidate.get("role", candidate.get("position", "")),
        "status": candidate.get("status", "new"),
        "firstSeniorSystem": candidate.get("system", "").lower(),
        "approximateSeniorRoute": candidate.get("route", []),
        "start": candidate.get("start"),
        "end": candidate.get("end"),
        "evidenceLeads": source_urls(candidate),
        "scoreBreakdown": candidate.get("score", candidate.get("scoreBreakdown", {})),
        "decision": decision,
        "reason": candidate.get("caveat", candidate.get("reason", "Regional portfolio candidate.")),
    }


candidates = []
for item in [*eu.get("selected", []), *eu.get("reserves", []), *eu.get("rejects", [])]:
    candidates.append(normalize(item, "Europe"))
for item in sa["candidates"]:
    candidates.append(normalize(item, "South America"))

by_id = {}
for candidate in candidates:
    by_id.setdefault(candidate["id"], candidate)

for record in south_records:
    if record["id"] in by_id:
        continue
    years = [int(value) for club in record["clubs"] for value in re.findall(r"\d{4}", club["years"])]
    by_id[record["id"]] = {
        "id": record["id"],
        "name": record["name"],
        "continent": record["continent"],
        "country": record["country"],
        "role": record["position"],
        "status": "new",
        "firstSeniorSystem": "brazil",
        "approximateSeniorRoute": [club["name"] for club in record["clubs"]],
        "start": min(years),
        "end": max(years),
        "evidenceLeads": [source["url"] for source in record["sources"]],
        "scoreBreakdown": {},
        "decision": "selected" if record["id"] in selected else "reserve",
        "reason": record["notes"],
    }

for player in current:
    if len(by_id) >= 150:
        break
    if player["id"] in by_id:
        continue
    years = [int(value) for club in player["clubs"] for value in re.findall(r"\d{4}", club["years"])]
    by_id[player["id"]] = {
        "id": player["id"],
        "name": player["name"],
        "continent": player["continent"],
        "country": player["country"],
        "role": player["position"],
        "status": "existing playable",
        "firstSeniorSystem": "",
        "approximateSeniorRoute": [club["name"] for club in player["clubs"]],
        "start": min(years),
        "end": max(years),
        "evidenceLeads": [source["url"] for source in player["sources"]],
        "scoreBreakdown": {},
        "decision": "rejected",
        "reason": "Exact playable-roster match retained in the discovery audit and rejected as a duplicate.",
    }

assert selected <= by_id.keys(), sorted(selected - by_id.keys())
for candidate in by_id.values():
    candidate["decision"] = "selected" if candidate["id"] in selected else candidate["decision"]
assert len(by_id) >= 150
assert sum(candidate["decision"] == "selected" for candidate in by_id.values()) == 50
output = {
    "baseline": {
        "commit": "431cd6ad4cb49503b4a7c84835622ff5b33816b6",
        "playable": 160,
        "europePlayable": 80,
        "southAmericaPlayable": 80,
        "bankOnly": 33,
    },
    "target": {"total": 50, "Europe": 25, "South America": 25},
    "candidates": list(by_id.values()),
}
(HERE / "candidate-shortlist.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"candidates": len(by_id), "selected": 50}))
