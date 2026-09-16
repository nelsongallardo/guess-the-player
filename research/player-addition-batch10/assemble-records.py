#!/usr/bin/env python3
"""Assemble reviewed bank promotions and new-player drafts into batch 10."""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
selection = json.loads((HERE / "selected-ids.json").read_text())
selected = set(sum(selection["continents"].values(), []))
assert len(selected) == 50

bank = json.loads((HERE / "bank-promotion-records.draft.json").read_text())
south = json.loads((HERE / "south-america-new-records.draft.json").read_text())
europe = json.loads((HERE / "europe-new-records.draft.json").read_text())
new_evidence = {
    item["id"]: item
    for filename in ("south-america-new-evidence.json", "europe-new-evidence.json")
    for item in json.loads((HERE / filename).read_text())
}
promotion_evidence = {
    item["id"]: item
    for item in json.loads((HERE / "bank-promotion-evidence.json").read_text())
}

records = []
for record in bank["records"]:
    if record["id"] not in selected:
        continue
    localized = bank["spanishNotes"][record["id"]]
    item = dict(record)
    item["esNotes"] = localized["notes"]
    item["esClubNotes"] = {
        str(index): note for index, note in enumerate(localized["clubNotes"]) if note
    }
    records.append(item)
records.extend(south)
records.extend(europe)

assert len(records) == 50, len(records)
assert {record["id"] for record in records} == selected
assert len({record["name"] for record in records}) == 50
assert sum(record["continent"] == "Europe" for record in records) == 25
assert sum(record["continent"] == "South America" for record in records) == 25
for record in records:
    assert len({source["url"].split('/')[2].removeprefix('www.') for source in record["sources"]}) >= 2
    assert record["clubs"]
    assert record["esNotes"]
    assert all(0 <= int(index) < len(record["clubs"]) for index in record["esClubNotes"])
    evidence = new_evidence.get(record["id"]) or promotion_evidence.get(record["id"])
    if evidence:
        evidence_by_url = {source["url"]: source for source in evidence["sources"]}
        for source in record["sources"]:
            assert source["url"] in evidence_by_url, (record["id"], source["url"])
            assert evidence_by_url[source["url"]].get("excerpts"), (record["id"], source["url"])

(HERE / "records.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"records": len(records), "selected": len(selected)}))
