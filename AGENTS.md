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

- `leaderboard.html` is a separate lightweight online-only ranking page, reachable from primary Play / Leaderboard navigation. It reads public boards and the authenticated own-rank projection; it must never start ranked rounds, mutate gameplay or import guest progress. See [ADR 0008](docs/adr/0008-standalone-leaderboard-page.md).
- `index.html` is the complete guest runtime artifact: inline CSS, embedded PNG crests, player data, translations, a `CareerGame` model and DOM UI. There is no build step or runtime package installation.
- Named script blocks include `roster-data`, `crest-data`, `game-model`, `locale-data` and `game-ui`. Model tests extract these blocks directly; preserve their IDs.
- `research/verified-players.json` contains curated career records. `research/data-policy.md` defines inclusion and competition-tag policy. Citation ledgers, [CAREER_SOURCES.md](CAREER_SOURCES.md) and [DATA_AUDIT.md](DATA_AUDIT.md) support the dataset.
- `tests/model.test.mjs` checks model, data, localization and save compatibility. `tests/source-check.py` checks literal source identifiers. `tests/run-browser.py` drives real browser checks.
- `.github/workflows/pages.yml` validates all pushes, pull requests and manual runs: Node tests (including native PostgreSQL), source identifiers, ranked-roster parity, Deno entrypoint checks and HTTP boundary tests. After validation, only non-PR runs on `main` deploy **`index.html`, `leaderboard.html`, `privacy.html`, `assets/derabona-social-es-v1.png`, `robots.txt`, `sitemap.xml` and `favicon.svg`** to GitHub Pages. CI does not run the browser suite or deploy Supabase.
- `.playwright-cli/`, `test-results/`, `_site/` and raw research retrievals are ignored. Do not force-add browser state, full third-party articles, screenshots, credentials or generated clutter.

Keep single-file offline guest play. Owner-approved network features are consent-first PostHog EU analytics (see docs/analytics.md) and optional Supabase/Google accounts with server-authoritative leaderboards. Authentication is account functionality, not permission to track. No other tracking, external fonts or framework/build scaffolding by default. Make focused edits; do not reconstruct the large HTML file or embedded assets from truncated or redacted tool output.

## Product invariants

- **No difficulty selector.** New rounds use origin-first contemporary matching with a separately researched wrong-answer bank; playable decks remain unchanged. Within each origin tier prefer overlapping careers whose debuts are at most eight years apart, then rank by career similarity with at most three points of random noise. Preserve all tighter-tier matches. Do not restore uniform top-eight sampling or a competition-only wrong-answer filter. See [ADR 0003](docs/adr/0003-researched-contemporary-rivals.md).
- Competition selection, the current researched roster, local results history and speed/hint-based scoring are established features. A narrow UI change must not roll them back.
- Every round has one correct name and, in the live guest/practice Hard UI, nine distinct eligible distractors (10 options total - a deliberate 2026 harder-game decision, up from the original four/five). `optionsFor`'s `slotsNeeded` is 9 for `'hard'` and stays 4 for the internal `'easy'`/`'medium'` fixture/testing-only helpers (no difficulty selector reaches them). Ranked mode is server-authoritative (`options jsonb ... check(jsonb_array_length(options) = 5)` in `supabase/migrations/202609130001_ranked_schema.sql`) and still deals 5 (1 + 4) - extending it needs a schema migration, not just a client change. `validate()` accepts both 10 and the legacy 5 for `r.options.length`, since already-engaged rounds and real published legacy saves (`tests/legacy-save*.json`) keep whatever count they were dealt; only a currently-unstarted round is force-upgraded to 10 on load (`refreshUnstartedRivals`). Exclude identical ordered club careers that would make the answer ambiguous.
- Decks have no repeated player. Derive progress, recap totals and final-round boundaries from the **saved deck**, not the current roster length. Read current data rather than assuming an old roster count.
- A resolved player (right or wrong) is excluded across competitions: for guests/practice within the tab session until confirmed unranked Reset; for accounts permanently per player/ruleset, with no ranked reset or replay farming. [ADR 0006](docs/adr/0006-accounts-and-ranked-progress.md) supersedes the device-lifetime/reset scope of [ADR 0005](docs/adr/0005-permanent-seen-ledger-and-completed-competitions.md), not the pure model. A competition whose whole pool has been seen shows **Completed** and is not selectable; do not silently let it repeat players or build an empty deck. `CareerGame.create(difficulty, competitionId, excludeIds)`'s third argument is how a deck is narrowed to unseen players; it throws rather than building a deck with none. A deck's length is no longer required to equal the competition's full roster size — only that it's a non-empty, duplicate-free subset of it.
- The round-progress display ("X OF Y COMPLETE") must reflect the whole competition's permanent seen-ledger count, not `CareerGame.stats(state).completed` against the (possibly shrunk) current deck length — the latter reads as "0 of N" and looks like lost progress the moment a deck is rebuilt after switching away and back. The round-number label ("03 / 52") stays deck-local on purpose; only the completion bar/label is competition-wide.
- Hints are capped at 3 in guest/practice mode: country, position, then the career timeline's club years (each club shows its own years, hidden by default via `.club-years{display:none}`/`.timeline.years-revealed` and revealed once `roundAt(state).hints>=3`). The former "initials" hint stays removed since, combined with the visible name options, it made the correct answer too obvious. `CareerGame.hint()`'s cap is 3; `validate()`'s upper bound on `r.hints` stays at 3 too. Ranked mode is server-authoritative (Postgres, see `supabase/migrations/202609130001_ranked_schema.sql`) and still caps at 2 hints (country, position) with no years hint — extending it needs a schema migration, not just a client change, so ranked always shows club years (never hides them) rather than hiding info with no way to reveal it.
- Points are only shown in the masthead once signed in: an anonymous guest total has no leaderboard to compare against, so `#score` stays `hidden` for guest/practice mode (toggled in `RankedUI.update()` on `!!Accounts.session`, not on `mode`, so it also updates immediately through 'loading'/'unavailable' transitions). When signed in, the score sits merged inside `#account-open` itself (icon + points + label) rather than as a separate button, so the header reads as one clickable "your account" control; clicking it always opens `#account-dialog`. Guests still reach their session streak/history via `#stats-detail-open` in the recap panel (the masthead no longer has a separate `#score-badge` entry point for it) - `#stats-detail` itself and its content are unchanged.
- Preserve English and Spanish UI, help, hints, career notes and accessibility text. Switching language must not reset gameplay. Proper names and original source titles remain unchanged.
- Preserve keyboard operation, focus management, visible focus styles, live feedback, reduced-motion support and mobile touch targets. On narrow screens, show the full numbered career grid without horizontal scrolling.

## Persistence and scoring

- `GuestStorage` keeps `touchline.career.v1`, `touchline.history.v1`, `touchline.lifetime.v1` and `touchline.seen.v1` in per-tab `sessionStorage`, with memory fallback. Refresh normally retains the session; normal tab/window closure ends it, subject to browser session restore. Language (`touchline.language.v1`), analytics permission/identity and Supabase auth (`derabona.auth.v1`) use separate localStorage lifecycles.
- Migrate old localStorage gameplay as a linked unranked snapshot: stage and verify all keys before removing any originals. Never merge conflicting session and legacy snapshots; retain originals and offer explicit recovery. Failed storage must keep gameplay usable. Guest/legacy data is never uploaded or credited to ranked progress.
- Preserve saved decks, completed/engaged rounds, guesses, hints, points and history. On load, `refreshUnstartedRivals` repairs only the current round with zero guesses and zero hints when its origin/era tier composition is weaker than currently available choices. Compatible untouched rounds remain stable across reloads; do not clear saves or reroll engaged rounds. Normalize old preferences to Hard for future rounds. Keep published legacy-save fixtures valid.
- A correct answer earns up to 100 points, reduced by hints and answer time. Do not restore flat scoring. See [the scoring/history ADR](docs/adr/0001-local-results-history-and-speed-based-scoring.md) for the formula and migration contract, and [ADR 0009](docs/adr/0009-speed-decay-anti-lookup-tightening.md) for the current speed-decay constants (2s grace, 25% floor by 12s) and rationale. The same curve is mirrored server-side in `ranked_private.points()`; retuning it needs a new migration (`create or replace function`, not an edit to an already-applied one), same as the roster export contract below.
- The guest round clock is in-memory UI state; resuming does not charge time away. Ranked elapsed time uses persisted server `started_at`, including time away; reload cannot refresh the scoring window. Exact-score tests must control the relevant clock and hints.
- Record each completed unranked game only once, including across reloads. Preserve the 100-game history cap and historical difficulty labels. Confirmed Reset clears only guest/practice gameplay, history, session score/streak and seen ledger, not account records, language or analytics. Signing out starts a fresh guest session; account deletion is a separate explicit destructive action.
- Unranked score/streak (`touchline.lifetime.v1`, legacy name) accumulates once per resolution across decks in the current tab session. Competition switches/replay do not clear it; unranked Reset does. ADR 0006 supersedes the device-lifetime scope of [ADR 0004](docs/adr/0004-lifetime-score-persists-across-decks.md). `CareerGame.stats(state)` stays a pure per-deck projection.
- Ranked results are immutable first terminal results per account/player/ruleset, counted globally once and on every canonical competition membership regardless of the selected deck. Accounts automatically receive stable unique random-animal public aliases; custom nicknames are optional (ADR 0007). Only accounts with a result in the selected board appear; a loss qualifies at zero points. Equal points share rank. Never publish Google identity or accept client scores, elapsed time, account IDs or imported saves.
- Cloud failure locks ranked mutations and offers explicit unranked practice/retry. Do not queue practice for upload, silently switch modes, or reissue an uncertain mutation with a new key. Preserve server versions and idempotency contracts; reconcile using authoritative progress.

## Analytics

- Follow [docs/analytics.md](docs/analytics.md). The owner chose consent-first, anonymous persistent analytics. Do not change to automatic/cookieless tracking, add session recording or enable autocapture without approval.
- Keep PostHog entirely silent before consent, after withdrawal, on file/localhost/noncanonical origins, while offline and when DNT/GPC is requested. Keep privacy settings bilingual and independent of gameplay Reset. SDK/ad-block/network/storage failures must never break the game.
- Use only project 273163 (EU); the public project ingestion token may be in HTML, personal CLI/API credentials may not. Disable IP event storage and person profiles. Preserve event/property allowlists and sanitized URLs. Do not capture old completions on re-render or reload.
- Run privacy model and real-SDK browser checks. Intercepted test requests are not proof of backend ingestion: read back uniquely marked live verification events from PostHog and exclude those events from dashboard metrics. Test-only bot-filter overrides must never become production defaults.

## Search and loading performance

- See [docs/seo.md](docs/seo.md). Keep the initial HTML title, heading and explanation in Spanish; query/saved language preferences override the Spanish default without resetting progress. The canonical sitemap contains the real home and standalone leaderboard pages. Do not add fake ratings, doorway pages, invented sitemap dates or hreflang for non-existent localized pages.
- Keep the explanatory section below gameplay, keyboard-accessible and translated in English mode. Its initial content must not depend on JavaScript.
- Loading feedback is a prominent branded status and decorative skeleton, translated and reduced-motion aware. The initial game loader must paint before embedded data parsing; account waits must never expose stale or guest rounds as ranked. Once a server start response supplies the career, show the clubs while keeping answer/hint controls locked until the existing confirming progress read completes. Compact the confirmation status instead of obscuring the real preview with placeholders. Clear loaders/busy state on ready, failure, completion, explicit practice and identity changes; no-JS must show an explanation, not an endless spinner.
- The loading class reserves only the initial game viewport and must clear after successful first render. Do not leave a permanent oversized blank career panel.
- Preserve all crest keys, PNG formats and source URLs when optimizing. Re-run `research/optimize-crests.py --source-ref ORIGINAL_GIT_SHA` via `uv run --with pillow python` against an original revision, not previously palette-reduced output; inspect its contact sheet and transparency guard.
- `tests/seo.test.mjs` checks static contracts and the image budget; `python3 tests/run-browser.py --suite seo-checks.js` checks no-JS content, language precedence, mobile fit, offline icon and saved-state stability. Lighthouse lab scores are not proof of ranking, indexing or field Core Web Vitals.

## Career-data changes

Read the data policy and matching source records before editing careers. Research facts from retrieved sources; do not invent dates, club spells, competition appearances or citations. Competition tags describe broad club membership, not individually verified appearances.

Update the inline roster, curated records, citations/audit and both-language notes together when applicable. Preserve uncertainty labels for exceptional loans or signings. Use authentic embedded crests and retain attribution URLs. Source-identifier tests establish consistency, not historical truth.

## Verification

Use Node 22 (matching CI), Python 3 and an installed `playwright-cli`. No npm build is required.

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs tests/guest-session.test.mjs
node scripts/export-ranked-roster.mjs --check
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

For gameplay changes, verify real HTTP and offline `file:` guest play, denied session/local storage, both languages, short mobile viewports, next/replay transitions, competition changes and existing saves. Run `guest-session-checks.js` and `accounts-checks.js` through the browser runner for account UI changes; the latter mocks SDK/API, not real OAuth. Backend commands and hosted release gates are in [docs/leaderboards.md](docs/leaderboards.md). Pure model tests alone do not establish browser correctness. For documentation-only changes, verify referenced paths/commands and diff scope; do not claim to have rerun gameplay tests unless you did.

### Known baseline limitation

At the selector-removal change, `tests/mobile-language-checks.js` failed `Longest career crests visible on initial 375x667 screen` on both the edited artifact and the unchanged published baseline. Details are in `TESTING.md`. Reproduce current behaviour before assuming it is still present. Do not silently delete or weaken the assertion, change unrelated layout to hide it, or claim the full suite is green. If checking remaining cases separately, explicitly report any diagnostic exclusions.

## Publishing and handoff

- Re-fetch before publishing and review the diff against current upstream. Keep changes scoped to the request; preserve already-pushed behaviour when resolving conflicts.
- Run applicable checks and `git diff --check`. Stage only intended files; inspect commit contents for secrets or generated assets.
- A push to `main` triggers static Pages deployment, not Supabase deployment. When publishing is in scope, verify the remote commit and the GitHub Actions result. For runtime changes, read back the public artifact and exercise the deployed game before claiming it is live.
- Applying a new/changed `supabase/migrations/*.sql` file to the live database is a separate, deliberately manual step - never automatic on push. See [docs/leaderboards.md](docs/leaderboards.md)'s "Applying migrations to the hosted database" for the CLI commands and the manual-only `.github/workflows/supabase-deploy.yml` (`workflow_dispatch` with a typed confirmation, needs `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`/`SUPABASE_PROJECT_REF` repo secrets configured once by a repo admin). Do not add a push-triggered Supabase deploy without the owner's explicit approval - this repo has more than one person and agent pushing to `main`.
- Public site: <https://derabona.club/>; the old GitHub Pages URL redirects there. Repository: `nelsongallardo/guess-the-player`.
- Link-preview metadata is static Spanish (`es_AR`) in the HTML head, independent of the selected game language. Keep Open Graph and Twitter copy aligned and point to the publicly deployed 1200 × 630 PNG via an absolute HTTPS URL. The share image is a crawler asset, not a runtime dependency; preserve single-file offline gameplay. Run `node --test tests/social-preview.test.mjs` after metadata/image/deployment changes.
- Report what changed, what actually ran, and any failures or exclusions. Update affected product docs and verification notes; avoid turning historical results into claims about a new run.

`AGENTS.md` is the shared source of agent guidance. Keep `CLAUDE.md` as a thin entry point rather than maintaining a second copy of these rules.
