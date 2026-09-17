#!/usr/bin/env python3
"""Append batch-11 entries to CAREER_SOURCES.md, DATA_AUDIT.md and the two
source ledgers (research/game-ledger.json, research/reaudit-citations.json).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
records = json.loads((ROOT / "research/player-addition-batch11/records.json").read_text())

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

# --- Ledgers ---------------------------------------------------------------
game_ledger_path = ROOT / "research/game-ledger.json"
reaudit_path = ROOT / "research/reaudit-citations.json"
game_ledger = json.loads(game_ledger_path.read_text())
reaudit = json.loads(reaudit_path.read_text())

next_game_id = max(s["id"] for s in game_ledger["sources"]) + 1
next_audit_id = max(s["id"] for s in reaudit["sources"]) + 1

game_ids_by_player = {}
audit_ids_by_player = {}
for record in records:
    game_ids = []
    audit_ids = []
    for source in record["sources"]:
        game_ledger["sources"].append({
            "id": next_game_id, "url": source["url"], "title": "", "accessed": "2026-09-17",
        })
        game_ids.append(next_game_id)
        next_game_id += 1
        reaudit["sources"].append({
            "id": next_audit_id, "url": source["url"], "title": "", "accessed": "2026-09-17",
        })
        audit_ids.append(next_audit_id)
        next_audit_id += 1
    game_ids_by_player[record["id"]] = game_ids
    audit_ids_by_player[record["id"]] = audit_ids

game_ledger_path.write_text(json.dumps(game_ledger, ensure_ascii=False, indent=2) + "\n")
reaudit_path.write_text(json.dumps(reaudit, ensure_ascii=False, indent=2) + "\n")

# --- CAREER_SOURCES.md -------------------------------------------------------
career_path = ROOT / "CAREER_SOURCES.md"
text = career_path.read_text()
marker = "<!-- END PLAYER ADDITION BATCH 10 -->"
assert marker in text
body, rest = text.split(marker)
sources_marker = "\nSources:\n"
assert sources_marker in rest
_, source_list = rest.split(sources_marker)

new_sections = []
for record in records:
    ids = game_ids_by_player[record["id"]]
    refs = ", ".join(f"[{i}]" for i in ids)
    new_sections.append(f"### {record['name']}\n\n{record['notes']}\n\nReviewed source links: {refs}.\n")

new_body = body + "\n".join(new_sections) + "\n<!-- END PLAYER ADDITION BATCH 11 -->"

new_source_lines = []
for record in records:
    for source_id, source in zip(game_ids_by_player[record["id"]], record["sources"]):
        new_source_lines.append(f"[{source_id}] {source['url']}")

new_source_list = source_list.rstrip("\n") + "\n" + "\n".join(new_source_lines) + "\n"
career_path.write_text(new_body + sources_marker + new_source_list)

# --- DATA_AUDIT.md -----------------------------------------------------------
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

print(json.dumps({
    "gameLedgerTotal": len(game_ledger["sources"]),
    "reauditTotal": len(reaudit["sources"]),
}))
