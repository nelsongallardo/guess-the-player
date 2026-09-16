#!/usr/bin/env python3
"""Write explicit first-displayed-club football-system assignments for batch 10."""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
selection = json.loads((HERE / "selected-ids.json").read_text())
selected = set(sum(selection["continents"].values(), []))
shortlist = json.loads((HERE / "candidate-shortlist.json").read_text())
bank = json.loads((HERE.parent / "verified-distractors.json").read_text())
systems = {
    candidate["id"]: candidate["firstSeniorSystem"].lower()
    for candidate in shortlist["candidates"]
    if candidate["id"] in selected and candidate["firstSeniorSystem"]
}
systems.update({profile["id"]: profile["system"] for profile in bank if profile["id"] in selected})
# The displayed Cuevas route deliberately starts at River Plate because neither
# retrieved source establishes positive competitive appearances in his two
# earlier Paraguayan membership rows.
systems["nelson-cuevas"] = "argentina"
# Guerrero's first displayed positive-appearance club is Bayern Munich II, an
# adult-pyramid reserve side in the German football system.
systems["paolo-guerrero"] = "germany"
# Šuker debuted for Osijek in 1984 while it competed in the unified Yugoslav
# league system; do not retroactively classify that spell by modern borders.
systems["davor-suker"] = "yugoslavia"
assert set(systems) == selected, sorted(selected - set(systems))
(HERE / "origin-systems.json").write_text(json.dumps(dict(sorted(systems.items())), ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"players": len(systems), "systems": len(set(systems.values()))}))
