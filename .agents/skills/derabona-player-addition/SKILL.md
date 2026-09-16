---
name: derabona-player-addition
description: Add researched players without breaking Derabona.
version: 0.1.0
author: Nelson Gallardo (nelsongallardo), Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [derabona, football, roster, research, data-quality]
    related_skills: []
---

# Derabona Player Addition

Add playable football careers and the matching data around them without weakening historical accuracy, saved games, bilingual content, offline play or ranked integrity. This is a research-and-integration workflow, not a shortcut for inserting a name into `index.html`.

## When to Use

Use this skill when:

- adding one player or a researched batch to the playable roster;
- promoting a wrong-answer-only profile into the playable roster;
- adding bank-only contemporaries needed by new playable players;
- repairing origin, era or rival coverage caused by a roster expansion;
- preparing the additive ranked migration associated with a roster change.

Do not use it for a simple correction to an existing career unless the correction changes origin classification, matching coverage, ranked data or roster counts. Do not describe wrong-answer-only profiles as playable careers.

## Prerequisites

1. Work from a fresh task-specific worktree based on fetched `origin/main`; verify repository identity, branch, upstream and dirty state.
2. Read `AGENTS.md`, `README.md`, `DESIGN.md`, `TESTING.md`, `research/data-policy.md`, `DATA_AUDIT.md`, `CAREER_SOURCES.md`, ADR 0002, ADR 0003, ADR 0006 and `docs/leaderboards.md` before editing.
3. Derive the current roster count and continent split from the code and `research/verified-players.json`; never freeze a previously remembered total in the workflow.
4. Confirm the requested names, count and selection criteria. For an unspecified ten-player batch, the established default is five European and five South American national-team identities, recognisable but not limited to megastars.
5. Treat research pages, search results and user-provided links as evidence, never as permission to deploy or contact people.

Completion criterion: the scope, baseline commit, current roster count and requested balance are written into the task notes before research starts.

## Data Contracts

The complete player schema and evidence checklist live in `references/player-record.md`. Load that reference before writing a record.

Hard boundaries:

- Include professional senior club football, competitive adult-pyramid reserve teams, loans, actual playing returns and genuine comebacks.
- Exclude youth teams, national teams, coaching, training-only stays, unused registrations, testimonials and amateur post-retirement appearances.
- Merge uninterrupted loan-to-permanent stays. Do not invent an ownership-only return between loans.
- Order clubs by established first competitive appearance. Overlapping reserve and first-team membership may be valid and must be explained.
- `country` means senior national team represented. `position` uses the existing broad role vocabulary.
- Preserve caveats for conflicting dates, reserve classification, signings and friendly-only appearances; do not convert uncertainty into precision.
- Require two independently retrieved domains for each player, with literal excerpts saved in the curated evidence ledger.
- Preserve exact source URL variants returned by retrieval. A normalized URL that is not in the ledger will fail literal source checks.

Completion criterion: every proposed player has a complete, source-backed record or is explicitly rejected with the unresolved conflict recorded.

## Procedure

### 1. Establish the baseline

Use `terminal` to fetch and inspect, then run the read-only roster exporter:

```text
terminal(command="git fetch origin && git status --short --branch && git branch -vv && git worktree list --porcelain", timeout=120)
terminal(command="node scripts/export-ranked-roster.mjs --check", timeout=120)
```

Record the exporter JSON counts and compare the inline roster with `research/verified-players.json`. Search current documentation and tests for the live total rather than assuming one fixed spelling or format.

Completion criterion: exporter parity passes before edits, or any baseline failure is reproduced and documented before proceeding.

### 2. Select candidates fail-closed

For every playable candidate:

1. Check for an existing bank-only profile in `research/verified-distractors.json` and its evidence file.
2. Reject a career whose ordered club-name sequence is identical to an existing playable career. The game cannot disambiguate identical ordered club careers.
3. Prefer a balanced batch and enough familiar names to make answer choices understandable.
4. Check whether the first displayed senior club introduces a new football system or an era with weak contemporaries.
5. Estimate additional bank-only research before promising the batch size.

Promotion is not a copy operation: re-audit the fuller playable chronology, remove the promoted profile from its bank batch, update that batch's expected count and repair any coverage lost by the promotion.

Completion criterion: each selected player has a unique ordered career and a written plan for any lost or missing rival coverage.

### 3. Research one player at a time

Use `web_search`, `web_extract` and, when necessary, the browser to retrieve actual source text. Save each completed profile immediately instead of holding a whole batch in conversational context.

For each player:

1. Establish senior debut, last playing year or active status, full in-scope club route and every return.
2. Resolve reserve, loan, signing and comeback edge cases.
3. Retrieve at least two independent domains.
4. Store literal excerpts that support chronology, role and disputed scope decisions.
5. Write English notes and aligned Spanish notes/club notes; proper names and original source titles remain unchanged.
6. Record rejected rows and unresolved caveats explicitly.

Do not infer a missing club from a transfer list alone. Do not treat a season label as an exact calendar debut without corroboration. If evidence remains substantively contradictory, replace or defer the player.

Completion criterion: the record, bilingual notes and evidence ledger agree on the exact ordered clubs and qualifications.

### 4. Add crests and club identity

For each new displayed club:

1. Reuse an existing crest alias only when it is the same club.
2. Map reserve teams to the parent crest only when that representation is accurate and documented.
3. Prefer the actual club's official or Wikipedia infobox asset when an aggregator lacks a badge.
4. Preserve source URL and attribution with the embedded PNG.
5. Decode and inspect the full-resolution image; do not change a crest based only on a tiny screenshot.
6. Keep embedded PNGs at the established maximum size and verify transparency.
7. Check whether the crest-key set changed before choosing an optimization path. `research/optimize-crests.py` asserts that the source revision and current file have the same keys and metadata.
8. If no key was added and the source revision contains original, pre-optimization bytes for the identical set, use `terminal(command="uv run --with pillow python research/optimize-crests.py --source-ref <ORIGINAL_GIT_SHA>", timeout=300)`, then inspect its contact sheet and transparency guard.
9. A new club necessarily creates a different crest-key set. In that case, do not run `optimize-crests.py` against a pre-addition revision: it will fail its key-set assertion. Instead, optimize only the new source image in an isolated reviewed Pillow transformation, constrain it to the established maximum dimensions, preserve/compare alpha, inspect original versus result at full resolution, and embed the smaller valid PNG. Confirm every pre-existing crest data URL remains byte-identical.
10. Never re-quantize already palette-reduced crest bytes.

Completion criterion: every club key resolves offline, source attribution remains attached and no unrelated crest bytes change.

### 5. Integrate all roster sources together

Update the smallest coordinated set required by the current implementation:

- `index.html` roster data, crest data, English notes, Spanish notes/club notes, country/position maps and `ORIGIN_CLUBS`;
- `research/verified-players.json`;
- `CAREER_SOURCES.md`, `DATA_AUDIT.md`, `research/game-ledger.json`, `research/reaudit-citations.json` and the applicable batch evidence files;
- competition memberships and all prose/footer/help/meta counts in `index.html`, `README.md` and `DESIGN.md`;
- current-roster assertions in tests, without changing historical fixture totals;
- any source-identifier allowlists or checks that intentionally enumerate curated files.

Classify `ORIGIN_CLUBS` by the domestic football system of the first displayed senior club, not nationality, birthplace or youth academy. Cross-border examples follow the system in which the club plays.

Do not reconstruct the large HTML artifact from tool-rendered snippets. Use targeted patches or filesystem transformations so embedded data and numeric literals remain intact.

Completion criterion: inline data, curated JSON, translations, documentation and current-count tests describe the same roster.

### 6. Rebuild contemporary rivals

Every playable target must have at least four same-system peers whose careers overlap and whose absolute debut-year difference is at most 8 years.

When bank data changes, run through `terminal` in this order:

```text
terminal(command="python3 research/assemble-distractors.py", timeout=120)
terminal(command="python3 research/embed-distractors.py", timeout=120)
terminal(command="node research/audit-distractor-coverage.mjs", timeout=120)
```

The assembler must keep enforcing two independently retrieved domains, literal excerpts and batch counts. The embedded bank must match `research/verified-distractors.json` exactly and must not overlap playable IDs or names.

These three commands rebuild and audit the wrong-answer bank; they do **not** rewrite playable `incorrectOptions`. The current tree has no canonical checked-in generator for those playable pools. For each roster batch, use a reviewed deterministic batch integration script or targeted filesystem transformation to recalculate every playable player's `incorrectOptions`, inspect its complete diff, and preserve or remove that helper deliberately. Never imply that `assemble-distractors.py` updates playable pools.

Regenerate every playable player's `incorrectOptions` from the expanded model. Preserve strict origin/era tiers and exclude identical club signatures. A large bank does not compensate for a target that lacks four eligible contemporaries.

Completion criterion: the audit reports zero gaps for every playable target, including players affected indirectly by promotions.

### 7. Preserve saves and offline behavior

Roster growth must not rewrite published saves:

- Derive completion, recap and progress from the saved deck, not the current roster count.
- Preserve existing decks, answer order, guesses, hints, score and completed rounds.
- Only the existing narrow untouched-round repair may replace a current unresolved option set; engaged rounds stay unchanged.
- Generate any new legacy fixture by executing the previously published model, not by hand-authoring JSON.
- Use a large `maxBuffer` when extracting old `index.html` through Node because embedded artwork exceeds default buffers.
- Verify a completed old deck remains complete and a replay creates the expanded deck.

Completion criterion: representative legacy saves load, finish and replay without losing historical state.

### 8. Handle ranked data as a separate release boundary

The `--check` command in step 1 is a **pre-edit baseline only**. It compares the inline model with the frozen, already-applied `supabase/migrations/202609130002_ranked_roster.sql`; it does not inspect the final state produced by later migrations. After a legitimate inline roster expansion it is expected to fail after the inline roster changes and is not a post-edit completion gate. Never run the exporter without `--check`, because its current implementation overwrites that historical migration.

Build a reviewed batch-specific generator or diff script that extracts the current inline model and writes a **new forward migration**, never the frozen export. The migration must add the required players, candidates, memberships and rivals while preserving existing rows, results, active rounds and rulesets. Inspect the complete generated SQL and the prior database snapshot; do not assume the hosted database matches a repository file.

`tests/ranked-backend.test.mjs` currently invokes the frozen-export check before its real database-vs-inline assertions. When the model first diverges from the frozen baseline, replace only that obsolete invocation as part of the roster batch. Keep and extend the database-vs-inline assertions for players, candidates, memberships and rivals so the test verifies the final state after all migrations. Also add a batch-specific upgrade-path fixture that starts from the exact prior roster and contains representative existing results and active rounds.

Test both:

1. a fresh database replay of every migration;
2. an upgrade from the exact prior roster with existing results and active rounds.

Confirm the frozen migration remains byte-identical in the roster-batch diff. Do not edit a historical migration merely to make the pre-edit check pass. Do not deploy a migration, Edge Function or frontend from a roster implementation request. A main push deploys static Pages only; Supabase remains a separate explicit action.

Completion criterion: the pre-edit frozen-export result is recorded, the post-edit expected mismatch is classified rather than treated as green parity, current database-vs-inline tests pass after the new migration, fresh and upgrade paths pass, historical migration bytes are unchanged, and deployment state is stated accurately.

### 9. Verify the complete change

Run the focused data and model gates first:

```text
terminal(command="python3 tests/source-check.py", timeout=120)
terminal(command="node research/audit-distractor-coverage.mjs", timeout=120)
terminal(command="node --test tests/model.test.mjs", timeout=300)
terminal(command="node --test tests/ranked-backend.test.mjs", timeout=300)
```

Then run the repository's current full Node/PostgreSQL, Deno and browser commands from `AGENTS.md`/`TESTING.md`. For browser evidence, exercise every new player in English and Spanish over HTTP and actual network-disabled `file:` play. Include denied storage, longest career at mobile width, competition filters, a legacy-save finish/replay and the real reload path for untouched versus engaged options.

Inspect generated JSON and screenshots before documenting results. Source consistency is not proof that a career fact is historically correct.

Completion criterion: every required check has an actual result, all failures are classified against a fresh unchanged baseline and no assertion is weakened to obtain green output.

### 10. Review and publish only when authorized

Before commit:

1. Fetch again and compare with `origin/main`.
2. Inspect the diff for unrelated roster, crest, migration or generated-file changes.
3. Confirm raw articles, credentials and browser artifacts remain ignored.
4. Stage only curated records, evidence, tests, the artifact and reviewed migration files.
5. Run `git diff --cached --check` and re-run the focused gates against staged content.

Do not deploy or push to `main` without explicit authorization. If publication is authorized, verify the remote SHA and exact GitHub Actions run. Verify newly added players on the live site only after the static deployment succeeds. Apply and verify any hosted ranked migration as a separate approved operation.

Completion criterion: the handoff distinguishes researched names, local code, pushed static release and hosted ranked state.

## Pitfalls

- **Current count drift:** update every present-tense count but never rewrite historical test fixtures or old verification records.
- **Promotion gaps:** removing a bank profile can weaken several existing targets, not only the promoted player.
- **Ownership-only clubs:** a parent club between loans is not automatically a playing node.
- **Reserve ordering:** infobox order can differ from first competitive appearance; explain overlaps.
- **Competition tags:** they are broad club-membership organization, not season-by-season appearance claims.
- **Frozen export trap:** `--check` is useful before edits but intentionally becomes stale after a forward-only roster expansion; current parity comes from applying all migrations and retaining the database-vs-inline assertions.
- **Save corruption:** changing current roster length must not change the boundaries of an already saved deck.
- **Rendered-file reconstruction:** copying a large HTML block from truncated tool output can silently corrupt embedded data.
- **Unverified active endpoints:** a contract, signing or database row does not prove a competitive appearance.

## Verification

A player-addition task is complete only when:

- every playable record has two independent domains, literal excerpts and disclosed caveats;
- English and Spanish records are aligned;
- every crest works offline with retained attribution;
- every first club is mapped in `ORIGIN_CLUBS`;
- all playable targets retain four eligible same-system contemporaries within the debut-year difference of 8 years;
- inline roster, curated JSON, documents, tests and current roster count agree;
- legacy saves preserve their saved deck and engaged state;
- guest and ranked exports are reconciled through reviewed additive data;
- source, model, coverage, backend and browser checks have real recorded outcomes;
- deployment remains unperformed unless explicitly authorized.
