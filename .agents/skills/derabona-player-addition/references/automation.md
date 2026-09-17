# Roster batch automation

Use `scripts/roster-batch.mjs` for deterministic preparation after the player and crest research has been reviewed. It does not decide historical truth, source reliability, disputed senior scope, translations, origin-system judgments, or ambiguous club identity.

## Required batch files

A batch directory uses the established reviewed filenames:

- `records.json` — playable records, including `esNotes` and indexed `esClubNotes`.
- `selected-ids.json` — required `{ "continents": { ... } }`; its non-empty ID arrays must exactly match the records.
- `origin-systems.json` — player ID to reviewed first-senior-club football system.
- `crest-assets.json` — new club key to reviewed `sourceURL`, `sourcePage`, `sourceTitle`, and PNG `dataUrl`.
- `peer-bank-records.json` — optional additional wrong-answer-only profiles with systems, regions, two source domains and literal excerpts.
- `audit-allowlist.json` — optional, batch-scoped exceptions for already-deployed exact origin mismatches or career-signature collisions. Every entry must name the exact values and include a reviewed reason; never use it to waive new-batch failures broadly.

## Commands

Before researching a shortlist containing bank promotions, calculate which existing targets lose tier-zero peers:

```text
terminal(command="node scripts/roster-batch.mjs promotions --shortlist research/player-addition-batchN/candidate-shortlist.json", timeout=120)
```

The report lists every affected target and any profile that would fall below four contemporaries. Add those gaps to the peer-research plan before full career or crest work.

Audit source-domain independence, IDs, bilingual fields, origins, missing crest keys, projected counts, and exact model-based contemporary coverage without writing:

```text
terminal(command="node scripts/roster-batch.mjs audit --batch-dir research/player-addition-batchN", timeout=300)
```

Preview coordinated core integration. This updates only the projected runtime roster/crests/Spanish notes/bank/origins plus the two canonical JSON datasets in memory:

```text
terminal(command="node scripts/roster-batch.mjs integrate --batch-dir research/player-addition-batchN", timeout=300)
```

After inspecting the preview report, write those three coordinated files explicitly:

```text
terminal(command="node scripts/roster-batch.mjs integrate --batch-dir research/player-addition-batchN --write", timeout=300)
```

Prove protected CSS and executable scripts are unchanged relative to the task baseline. Roster, crest and locale data blocks are intentionally excluded:

```text
terminal(command="node scripts/roster-batch.mjs guard --base BASELINE_SHA", timeout=120)
```

Generate a new reviewed forward migration, or verify it after review:

```text
terminal(command="node scripts/roster-batch.mjs migration --output supabase/migrations/VERSION_slug.sql --write", timeout=300)
terminal(command="node scripts/roster-batch.mjs migration --output supabase/migrations/VERSION_slug.sql --check", timeout=300)
```

## Boundaries

The integration command deliberately does not rewrite prose or citation ledgers. After it runs, publish reviewed evidence into `CAREER_SOURCES.md`, `DATA_AUDIT.md`, `research/game-ledger.json`, and `research/reaudit-citations.json`; update current-count prose in `README.md`, `DESIGN.md`, and the runtime where needed. These surfaces contain editorial and historical claims that should not be changed by broad numeric replacement.

Crest identity and source selection remain reviewed inputs. The automation embeds provided bytes and proves coverage; it does not decide that a logo belongs to the historical club. Production migration remains a separately authorized operation.

## Fail-closed behavior

- `audit` exits nonzero for partial integration, mismatched selected IDs, duplicate identities, insufficient independent domains, missing bilingual/origin/crest inputs, invalid projected runtime data, or any target with fewer than four tier-zero contemporaries.
- `integrate` is dry-run by default and requires `--write` for file mutation. Rerunning an integrated batch must report `changed:false`.
- `guard` exits nonzero and lists every protected region whose SHA-256 changed.
- `migration` requires exactly one of `--write` or `--check`; output is confined to a `.sql` file under the selected repository root's `supabase/migrations/`, `--write` refuses every existing path so an applied migration cannot be overwritten, and `--check` compares exact bytes.
