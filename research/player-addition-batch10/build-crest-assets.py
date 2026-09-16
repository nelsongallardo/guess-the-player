#!/usr/bin/env python3
"""Download, normalize and embed reviewed batch-10 club crests."""

from __future__ import annotations

import base64
import io
import json
import time
import urllib.request
from pathlib import Path

from PIL import Image
from resvg_py import svg_to_bytes

from crest_image import fit_crest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
source_paths = [HERE / "crest-sources-reviewed.json"]
sources: dict[str, dict] = {}
for path in source_paths:
    data = json.loads(path.read_text())
    for club, item in data.items():
        assert club not in sources, club
        sources[club] = item

output_path = HERE / "crest-assets.json"
assets = json.loads(output_path.read_text()) if output_path.exists() else {}
assets = {
    club: asset
    for club, asset in assets.items()
    if club in sources and asset.get("sourceURL") == sources[club]["sourceURL"]
}

# A canonical integration may already contain the generated assets. Reuse that
# exact embedded data so this batch-specific builder remains safely rerunnable.
html = (ROOT / "index.html").read_text()
marker = "const CREST_ASSETS ="
start = html.index(marker) + len(marker)
while html[start].isspace():
    start += 1
canonical_assets = json.JSONDecoder().raw_decode(html[start:])[0]
for club, item in sources.items():
    embedded = canonical_assets.get(item["sourceURL"])
    if club not in assets and embedded and embedded.get("dataUrl"):
        asset = {
            "sourceURL": item["sourceURL"],
            "sourcePage": item["sourcePage"],
            "sourceTitle": item["sourceTitle"],
            "dataUrl": embedded["dataUrl"],
        }
        if item.get("sourceCrop"):
            asset["sourceCrop"] = item["sourceCrop"]
        assets[club] = asset

for club, item in sorted(sources.items()):
    if club in assets:
        continue
    request = urllib.request.Request(item["sourceURL"], headers={"User-Agent": "Derabona research/1.0 (public crest embedding)"})
    raw = b""
    content_type = ""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read()
                content_type = response.headers.get("Content-Type", "")
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    if "svg" in content_type or raw.lstrip().startswith(b"<svg") or b"<svg" in raw[:500]:
        raw = svg_to_bytes(svg_string=raw.decode("utf-8"), width=128, height=128)
    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    if item.get("sourceCrop"):
        image = image.crop(tuple(item["sourceCrop"]))
    canvas = fit_crest(image)
    palette = canvas.quantize(colors=128, method=Image.Quantize.FASTOCTREE)
    output = io.BytesIO()
    palette.save(output, format="PNG", optimize=True)
    png = output.getvalue()
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    asset = {
        "sourceURL": item["sourceURL"],
        "sourcePage": item["sourcePage"],
        "sourceTitle": item["sourceTitle"],
        "dataUrl": "data:image/png;base64," + base64.b64encode(png).decode("ascii"),
    }
    if item.get("sourceCrop"):
        asset["sourceCrop"] = item["sourceCrop"]
    assets[club] = asset
    output_path.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n")

assert set(assets) == set(sources)
output_path.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"assets": len(assets), "decodedBytes": sum(len(base64.b64decode(item["dataUrl"].split(",", 1)[1])) for item in assets.values())}))
