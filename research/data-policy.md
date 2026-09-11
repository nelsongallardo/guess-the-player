# Career-data policy

Research snapshot: **11 September 2026**. The initial 30-player input was frozen before app implementation and re-audited afterward; ten independently researched additions expand the roster to 40; see `../DATA_AUDIT.md` for the subsequent corrections and limits. `verified-players.json` is the selected research snapshot; the complete playable database, crest URL arrays and incorrect-answer pools are explicitly embedded in `index.html`. `../CAREER_SOURCES.md` contains the audit trail.

## Timeline scope

- **Professional senior club football**, not national teams, youth football, coaching/ownership jobs or post-retirement amateur appearances.
- Include competitive reserve teams in the adult league pyramid, not separate closed reserve leagues. Reserve and first-team membership can overlap; ordering follows first competitive appearance where established. Season-level evidence is not presented as an exact day.
- Include loans and actual returns to playing. Do not insert parent-club nodes merely because ownership continued between loans. A continuous loan-to-permanent period is one node with a note.
- Preserve genuine retirement/hiatus comebacks as separate spells, even when the badge repeats.
- Dates label career stints, not an exact first-to-last-match calendar. Starts follow the first playing season where known; endpoints can be departure or playing retirement even after the last appearance. Notes explicitly distinguish such endpoints for Neymar, Rooney, Tevez and Riquelme. Reserve evidence stated in seasons remains in season notation. A transfer announcement before the first playing season does not create an extra node; an unfulfilled future contract expiry does not extend a retired career.
- Country means the **senior national team represented**. Position is a broad playing role, not a claim that a player never occupied another position.
- Initials derive from the exact display name used in the options, including single-name forms such as Pelé and Neymar.

## Explicit exceptions, not hidden assumptions

- **Ronaldinho / Ravenna:** the documented June 2026 player-signing announcement is included and visibly tagged **Signing\***, with the year **2026**, not an asserted ongoing playing span. The announcement described registration in the future tense. Completed federation registration and a competitive debut were not established; internal status is `signing-announced`, not verified active play.
- **Roberto Carlos / Atlético Mineiro:** the documented senior tour loan is retained and visibly tagged **Tour loan**. It was friendly-only, not a competitive league spell.
- **Ronaldo / São Cristóvão:** a conflicting database row with no appearance total is not treated as proof of senior play; the biographical youth classification is followed and the conflict disclosed.
- **Expansion evidence boundaries:** Rosický’s exact reserve debut/order and De la Peña’s zero-total Barcelona C membership remain qualified in player notes; they are not asserted as fully resolved. Berbatov was not added because the Pirin youth/senior conflict remained substantive; Robbie Keane was researched instead. Aimar’s 2018 Copa Argentina comeback is included as official senior play, not a testimonial.
- **Henry and Dida:** incomplete candidate investigations were excluded; Bergkamp and Pelé occupy their final roster slots.

Player-specific chronology, returns, evidence conflicts and exclusions are explained after each round and in the career-source document. This is a manually cross-checked snapshot, not a live database or an absolute guarantee against future discoveries/corrections.

## Crests and source preservation

All used crest PNG bytes are embedded and tested offline. Original public URLs remain attached to the same ordered clubs, with attribution links after the reveal. Parent-club badges identify reserve sides. Current/source-era crests identify clubs; they are not historical season-specific artwork. Club marks remain the property of their owners.

Raw retrieved articles and failed/replaced candidate files stay local rather than being republished wholesale. The repository retains the curated records, public URL ledger, source document and tests. The HTML is the only runtime dependency.
