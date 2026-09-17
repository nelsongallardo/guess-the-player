#!/usr/bin/env python3
"""Finish the DATA_AUDIT.md update after the ledgers/CAREER_SOURCES.md already
landed successfully in the first (partially failed) run of update_docs.py."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
records = json.loads((ROOT / "research/player-addition-batch11/records.json").read_text())
reaudit = json.loads((ROOT / "research/reaudit-citations.json").read_text())

audit_prose = {
    "sol-campbell": "Ordered clubs, including the brief Notts County registration and second Arsenal spell, are corroborated by an independent season-by-season appearance record.",
    "mesut-ozil": "The Schalke 04 II reserve debut overlaps his first-team breakthrough at the same club rather than replacing it. Ordered clubs and career endpoint are corroborated by an independent season-by-season appearance record.",
    "sergio-ramos": "Ordered clubs, including the Sevilla Atlético reserve spell and second Sevilla registration, are corroborated by an independent season-by-season appearance record. Current Monterrey status matches that same record.",
    "marcel-desailly": "Ordered clubs and career endpoint, including the two brief Qatari clubs that closed his career, are corroborated by an independent season-by-season appearance record.",
    "filippo-inzaghi": "Both Piacenza loan spells (AlbinoLeffe and Hellas Verona) overlap his continuous Piacenza registration rather than replacing it, the same overlap pattern already established for Sporting CP/Sporting CP B. Ordered clubs and career endpoint are corroborated by an independent season-by-season appearance record.",
    "fernando-muslera": "Ordered clubs, including the brief Nacional loan and his 2025 move to Argentina, are corroborated by an independent season-by-season appearance record.",
    "arturo-vidal": "Ordered clubs, including both Brazilian clubs and his return to Colo-Colo, are corroborated by an independent season-by-season appearance record.",
    "gabriel-heinze": "The Sporting CP loan overlaps his continuous Real Valladolid registration rather than replacing it. Ordered clubs and career endpoint, including his return to Newell's Old Boys, are corroborated by an independent season-by-season appearance record.",
    "claudio-taffarel": "Ordered clubs and career endpoint, including the Reggiana spell and his return to Parma, are corroborated by an independent season-by-season appearance record.",
    "aldair": "The displayed professional route ends with Genoa in 2003-04. Later low-profile appearances for Rio Branco (2005) and SS Murata (2007-2009, San Marino's part-time regional championship) are excluded as post-prime veteran/exhibition-tier football, not competitive top-flight play; an independent season-by-season appearance record confirms both are real but low-level.",
}

# Reconstruct the id assignment: the last 20 reaudit sources (560-579), two per
# player, in the same order as records.json.
new_sources = [s for s in reaudit["sources"] if s["id"] >= 560]
assert len(new_sources) == 20
audit_ids_by_player = {}
for i, record in enumerate(records):
    ids = [new_sources[2 * i]["id"], new_sources[2 * i + 1]["id"]]
    # sanity check URLs line up
    assert new_sources[2 * i]["url"] == record["sources"][0]["url"]
    assert new_sources[2 * i + 1]["url"] == record["sources"][1]["url"]
    audit_ids_by_player[record["id"]] = ids

audit_path = ROOT / "DATA_AUDIT.md"
audit_text = audit_path.read_text()
audit_body, audit_source_list = audit_text.split("\nSources:\n")

new_audit_sections = []
for record in records:
    ids = audit_ids_by_player[record["id"]]
    clubs_str = " → ".join(c["name"] for c in record["clubs"])
    cite = "".join(f"[{i}]" for i in ids)
    prose = audit_prose[record["id"]]
    new_audit_sections.append(
        f"### {record['name']}\n\n"
        f"**{record['country']} · {record['position']}.** {clubs_str}.{cite}\n\n"
        f"{prose}{cite}\n\n"
        "Reviewed sources:\n" + "\n".join(f"- [{i}]" for i in ids) + "\n"
    )

new_audit_body = audit_body + "\n" + "\n".join(new_audit_sections)

new_audit_source_lines = []
for record in records:
    for source_id, source in zip(audit_ids_by_player[record["id"]], record["sources"]):
        new_audit_source_lines.append(f"[{source_id}] {source['url']}")
new_audit_source_list = audit_source_list.rstrip("\n") + "\n" + "\n".join(new_audit_source_lines) + "\n"

audit_path.write_text(new_audit_body + "\nSources:\n" + new_audit_source_list)
print("done")
