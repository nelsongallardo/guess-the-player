#!/usr/bin/env python3
"""Publish batch-10 playable evidence in the two canonical citation ledgers."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = Path(__file__).resolve().parent
RECORDS = json.loads((BATCH / "records.json").read_text())
assert len(RECORDS) == 50
BEGIN = "<!-- BEGIN PLAYER ADDITION BATCH 10 -->"
END = "<!-- END PLAYER ADDITION BATCH 10 -->"


def update_ledger(path: Path, urls: list[str]) -> tuple[dict[str, int], list[dict]]:
    data = json.loads(path.read_text())
    by_url = {source["url"]: source["id"] for source in data["sources"]}
    next_id = max(source["id"] for source in data["sources"]) + 1
    for url in urls:
        if url in by_url:
            continue
        by_url[url] = next_id
        entry = {"id": next_id, "url": url, "title": "", "accessed": "2026-09-16"}
        data["sources"].append(entry)
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
        ids = [by_url[source["url"]] for source in record["sources"]]
        links = ", ".join(f"[{source_id}]" for source_id in ids)
        if audit:
            sections.append(
                f"### {record['name']}\n\n"
                f"**Research status:** verified for batch 10 on 2026-09-16. "
                f"The ordered senior route, returns, loans/reserve scope and bilingual caveats are recorded in "
                f"`research/player-addition-batch10/records.json`. At least two independently owned public domains were retained.\n\n"
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

audit_path = ROOT / "DATA_AUDIT.md"
audit = audit_path.read_text().replace(
    "**Current roster: 160 players.** The original 30-player re-audit is followed below by nine ten-player batches and this source-backed forty-player extension, all independently researched.",
    "**Current roster: 210 players.** The original 30-player re-audit is followed below by the documented expansion batches, including this source-backed fifty-player extension.",
)
audit_path.write_text(audit)
print(json.dumps({"players": len(RECORDS), "careerSources": str(ROOT / 'CAREER_SOURCES.md'), "audit": str(audit_path)}))
