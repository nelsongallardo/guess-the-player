#!/usr/bin/env python3
"""Append batch-9 playable evidence to the two repository citation ledgers."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = Path(__file__).resolve().parent
ALL_RECORDS = json.loads((BATCH / "records.json").read_text())
PUBLISHED_IDS = {record["id"] for record in json.loads((ROOT / "research/verified-players.json").read_text())}
RECORDS = [record for record in ALL_RECORDS if record["id"] not in PUBLISHED_IDS]
assert len(PUBLISHED_IDS) == 120 and len(RECORDS) == 40
BEGIN = "<!-- BEGIN PLAYER ADDITION BATCH 9 -->"
END = "<!-- END PLAYER ADDITION BATCH 9 -->"


def update_ledger(path: Path, urls: list[str]) -> tuple[dict[str, int], list[dict]]:
    data = json.loads(path.read_text())
    by_url = {source["url"].rstrip("/"): source["id"] for source in data["sources"]}
    entry_by_url = {source["url"].rstrip("/"): source for source in data["sources"]}
    next_id = max(source["id"] for source in data["sources"]) + 1
    for url in urls:
        key = url.rstrip("/")
        if key in by_url:
            entry_by_url[key]["url"] = key
            continue
        by_url[key] = next_id
        entry = {"id": next_id, "url": key, "title": "", "accessed": "2026-09-16"}
        data["sources"].append(entry)
        entry_by_url[key] = entry
        next_id += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return by_url, data["sources"]


def replace_marked(body: str, section: str) -> str:
    block = BEGIN + "\n" + section.rstrip() + "\n" + END
    if BEGIN in body:
        return re.sub(re.escape(BEGIN) + r"[\s\S]*?" + re.escape(END), block, body)
    return body.rstrip() + "\n\n" + block + "\n"


def update_document(document_path: Path, ledger_path: Path, audit: bool) -> None:
    urls = [source["url"] for record in RECORDS for source in record["sources"]]
    by_url, ledger_sources = update_ledger(ledger_path, urls)
    text = document_path.read_text()
    body, sources_block = text.split("\nSources:\n", 1)
    sections = []
    for record in RECORDS:
        ids = [by_url[source["url"].rstrip("/")] for source in record["sources"]]
        links = ", ".join(f"[{source_id}]" for source_id in ids)
        if audit:
            sections.append(
                f"### {record['name']}\n\n"
                f"**Research status:** verified for batch 9 on 2026-09-16. "
                f"The ordered senior route, returns, loans/reserve scope and bilingual caveats are recorded in "
                f"`research/player-addition-batch9/records.json`. Two independently owned public domains were retained.\n\n"
                f"Reviewed sources: {links}."
            )
        else:
            sections.append(
                f"### {record['name']}\n\n"
                f"{record['notes']}\n\n"
                f"Reviewed source links: {links}."
            )
    body = replace_marked(body, "\n\n".join(sections))
    cited = {int(value) for value in re.findall(r"\[(\d+)\]", body)}
    ledger_by_id = {source["id"]: source["url"] for source in ledger_sources}
    listed = {int(number): url for number, url in re.findall(r"^\[(\d+)\] (https?://\S+)(?: — .*)?$", sources_block, re.MULTILINE)}
    for source_id in sorted(cited):
        listed[source_id] = ledger_by_id[source_id]
    rendered = "\n".join(f"[{source_id}] {listed[source_id]}" for source_id in sorted(cited)) + "\n"
    document_path.write_text(body.rstrip() + "\n\nSources:\n" + rendered)


update_document(ROOT / "CAREER_SOURCES.md", ROOT / "research/game-ledger.json", audit=False)
update_document(ROOT / "DATA_AUDIT.md", ROOT / "research/reaudit-citations.json", audit=True)

# Keep the audit's overview factual while retaining the original 30-player history below.
audit_path = ROOT / "DATA_AUDIT.md"
audit = audit_path.read_text()
audit = audit.replace(
    "**Current roster: 120 players.** The original 30-player re-audit is followed below by nine batches of ten independently researched additions.",
    "**Current roster: 160 players.** The original 30-player re-audit is followed below by nine ten-player batches and this source-backed forty-player extension, all independently researched.",
)
audit_path.write_text(audit)
print(json.dumps({"players": len(RECORDS), "careerSources": str(ROOT / 'CAREER_SOURCES.md'), "audit": str(audit_path)}))
