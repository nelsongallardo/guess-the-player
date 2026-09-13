# Agent guide — Guess the Player / Touchline

## Start here

This is a football-career guessing game in one portable HTML file. Read [README.md](README.md) for usage, [DESIGN.md](DESIGN.md) for the gameplay contract and [TESTING.md](TESTING.md) for verification evidence and known limitations. Read relevant [architecture decisions](docs/adr/) before changing established behaviour.

Before editing, run from the repository root:

```sh
git status --short --branch
git remote -v
git fetch origin
git log --oneline --left-right HEAD...origin/main
```

A clean working tree does not establish that the checkout is current. Other agents and the owner may push during a session. Inspect and integrate upstream changes before implementing or publishing; never overwrite them with an older local version. Preserve unrelated local edits. Do not force-push or reset away someone else's work.

## Architecture and file map

- `index.html` is the complete runtime artifact: inline CSS, embedded PNG crests, player data, translations, a `CareerGame` model and DOM UI. There is no build step or runtime package installation.
- Named script blocks include `roster-data`, `crest-data`, `game-model`, `locale-data` and `game-ui`. Model tests extract these blocks directly; preserve their IDs.
- `research/verified-players.json` contains curated career records. `research/data-policy.md` defines inclusion and competition-tag policy. Citation ledgers, [CAREER_SOURCES.md](CAREER_SOURCES.md) and [DATA_AUDIT.md](DATA_AUDIT.md) support the dataset.
- `tests/model.test.mjs` checks model, data, localization and save compatibility. `tests/source-check.py` checks literal source identifiers. `tests/run-browser.py` drives real browser checks.
- `.github/workflows/pages.yml` validates the model and sources, then publishes **only `index.html`** to GitHub Pages on pushes to `main`. CI does not run the browser suite.
- `.playwright-cli/`, `test-results/`, `_site/` and raw research retrievals are ignored. Do not force-add browser state, full third-party articles, screenshots, credentials or generated clutter.

Keep the single-file offline design unless the requested work explicitly changes the architecture. No analytics, accounts, external fonts, runtime network dependencies or framework/build scaffolding by default. Make focused edits; do not reconstruct the large HTML file or embedded assets from truncated or redacted tool output.

## Product invariants

- **No difficulty selector.** New rounds use origin-first contemporary matching with a separately researched wrong-answer bank; playable decks remain unchanged. Within each origin tier prefer overlapping careers whose debuts are at most eight years apart, then rank by career similarity with at most three points of random noise. Preserve all tighter-tier matches. Do not restore uniform top-eight sampling or a competition-only wrong-answer filter. See [ADR 0003](docs/adr/0003-researched-contemporary-rivals.md).
- Competition selection, the current researched roster, local results history and speed/hint-based scoring are established features. A narrow UI change must not roll them back.
- Every round has one correct name and four distinct eligible distractors. Exclude identical ordered club careers that would make the answer ambiguous.
- Decks have no repeated player. Derive progress, recap totals and final-round boundaries from the **saved deck**, not the current roster length. Read current data rather than assuming an old roster count.
- A player answered once (right or wrong) never repeats again, across every competition and replay, until the confirmed Reset — see [ADR 0005](docs/adr/0005-permanent-seen-ledger-and-completed-competitions.md). A competition whose whole pool has been seen shows **Completed** and is not selectable; do not silently let it repeat players or build an empty deck. `CareerGame.create(difficulty, competitionId, excludeIds)`'s third argument is how a deck is narrowed to unseen players; it throws rather than building a deck with none. A deck's length is no longer required to equal the competition's full roster size — only that it's a non-empty, duplicate-free subset of it.
- Preserve English and Spanish UI, help, hints, career notes and accessibility text. Switching language must not reset gameplay. Proper names and original source titles remain unchanged.
- Preserve keyboard operation, focus management, visible focus styles, live feedback, reduced-motion support and mobile touch targets. On narrow screens, show the full numbered career grid without horizontal scrolling.

## Persistence and scoring

- Storage keys are `touchline.career.v1` (current game), `touchline.language.v1` (language), `touchline.history.v1` (results history), `touchline.lifetime.v1` (lifetime score/streak) and `touchline.seen.v1` (permanent already-answered player ids). Browser storage can fail; gameplay must remain usable.
- Preserve saved decks, completed/engaged rounds, guesses, hints, points and history. On load, `refreshUnstartedRivals` repairs only the current round with zero guesses and zero hints when its origin/era tier composition is weaker than currently available choices. Compatible untouched rounds remain stable across reloads; do not clear saves or reroll engaged rounds. Normalize old preferences to Hard for future rounds. Keep published legacy-save fixtures valid.
- A correct answer earns up to 100 points, reduced by hints and answer time. Do not restore flat scoring. See [the scoring/history ADR](docs/adr/0001-local-results-history-and-speed-based-scoring.md) for the formula and migration contract.
- The round clock is in-memory UI state, not persisted elapsed time; resuming a game must not penalize time spent away. Tests that assert exact scores must control elapsed time and account for hints.
- Record each completed game only once, including across reloads. Preserve the history cap and historical difficulty labels. The confirmed reset clears current gameplay, results history, the lifetime score/streak, and the permanent seen-players ledger.
- The header score/streak (and the recap's big final number) are a **lifetime running total** (`touchline.lifetime.v1`), tallied once per round resolution independent of `CareerGame.stats(state)`. Switching competition, replaying, or a legacy-preference migration must never reset it — only the confirmed Reset does. See [ADR 0004](docs/adr/0004-lifetime-score-persists-across-decks.md). `CareerGame.stats(state)` itself stays a pure per-deck projection; do not make it reach outside `state`.

## Career-data changes

Read the data policy and matching source records before editing careers. Research facts from retrieved sources; do not invent dates, club spells, competition appearances or citations. Competition tags describe broad club membership, not individually verified appearances.

Update the inline roster, curated records, citations/audit and both-language notes together when applicable. Preserve uncertainty labels for exceptional loans or signings. Use authentic embedded crests and retain attribution URLs. Source-identifier tests establish consistency, not historical truth.

## Verification

Use Node 22 (matching CI), Python 3 and an installed `playwright-cli`. No npm build is required.

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
```

For browser checks, start a local server in a separate process from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Verify the server serves this checkout before running:

```sh
python3 tests/run-browser.py
# Focused offline checks:
python3 tests/run-browser.py --offline-only
```

The runner checks `playwright-cli list` and reuses a named, headless development session based on the repository basename. Use fresh, non-persistent browser state for localhost; do not reuse personal authenticated sessions. Keep browser interaction text/DOM-first.

For gameplay changes, verify real HTTP and offline `file:` play, denied storage, both languages, short mobile viewports, next/replay transitions, competition changes and existing saves. Pure model tests alone do not establish browser correctness. For documentation-only changes, verify referenced paths/commands and diff scope; do not claim to have rerun gameplay tests unless you did.

### Known baseline limitation

At the selector-removal change, `tests/mobile-language-checks.js` failed `Longest career crests visible on initial 375x667 screen` on both the edited artifact and the unchanged published baseline. Details are in `TESTING.md`. Reproduce current behaviour before assuming it is still present. Do not silently delete or weaken the assertion, change unrelated layout to hide it, or claim the full suite is green. If checking remaining cases separately, explicitly report any diagnostic exclusions.

## Publishing and handoff

- Re-fetch before publishing and review the diff against current upstream. Keep changes scoped to the request; preserve already-pushed behaviour when resolving conflicts.
- Run applicable checks and `git diff --check`. Stage only intended files; inspect commit contents for secrets or generated assets.
- A push to `main` deploys the site. When publishing is in scope, verify the remote commit and the GitHub Actions result. For runtime changes, read back the public artifact and exercise the deployed game before claiming it is live.
- Public site: <https://nelsongallardo.github.io/guess-the-player/>. Repository: `nelsongallardo/guess-the-player`.
- Report what changed, what actually ran, and any failures or exclusions. Update affected product docs and verification notes; avoid turning historical results into claims about a new run.

`AGENTS.md` is the shared source of agent guidance. Keep `CLAUDE.md` as a thin entry point rather than maintaining a second copy of these rules.
