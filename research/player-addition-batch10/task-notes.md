# Batch 10 task notes — 50-player expansion

- Baseline commit: `431cd6ad4cb49503b4a7c84835622ff5b33816b6` (`origin/main` when the task started on 2026-09-16).
- Baseline roster: 160 playable careers, split 80 Europe / 80 South America.
- Baseline wrong-answer bank: 33 profiles.
- Requested addition: 50 playable careers.
- Default selection balance: 25 European and 25 South American senior national-team identities, producing a target roster of 210 (105 / 105).
- Selection objective: recognizable players with distinctive, source-verifiable senior club routes, balanced across countries, eras, roles, competitions and starting football systems.
- Existing bank profiles may be promoted only after full playable-career re-audit; every promotion must be removed from its source bank and replacement coverage checked.
- Research gates: unique ordered career, two independent retrieved domains with literal excerpts, bilingual notes, authentic offline crests, mapped first-club system, and at least four eligible same-system contemporaries within the eight-year debut window.
- Ranked boundary: prepare a new forward migration from the verified 160-player state; never rewrite an applied historical migration. This implementation request does not authorize publication or production migration.
- Pre-edit frozen-export status: `node scripts/export-ranked-roster.mjs --check` reports the documented expected mismatch because the export is frozen and later forward migrations carry the 160-player state. This is not a post-edit gate.
