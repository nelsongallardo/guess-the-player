# derabona

A football-career quiz: read the club-crest timeline and identify the player from ten names, in both guest and ranked play (see [ADR 0012](docs/adr/0012-ranked-ten-options-v2-ruleset.md); ranked's original five-option results remain immutable under their own `v1` ruleset). Plain HTML, CSS and JavaScript; one portable `index.html` supports guest play without a build or network connection. Optional Google accounts use Supabase for persistent, server-scored progress and public nickname leaderboards.

**Website:** <https://derabona.club/> · [Leaderboard](https://derabona.club/leaderboard.html) · [Privacy](https://derabona.club/privacy.html) · [Contact](mailto:contact@derabona.club) · [Español](https://derabona.club/?lang=es) · [English](https://derabona.club/?lang=en)

This documents the implemented account contract, **not a claim that accounts have been deployed or hosted OAuth verified**. Public frontend configuration, Google/Supabase setup and hosted release checks are separate gates; see [accounts and leaderboards](docs/leaderboards.md) and [verification evidence](TESTING.md).

## Play and progress

Download `index.html` and open it in a modern browser for offline guest play. All playable careers, translations and crest images are embedded. Accounts/rankings require a configured backend and connectivity; local files are unranked only.

| Mode | Progress | Ranking and reset |
| --- | --- | --- |
| Guest | Per-tab `sessionStorage`, with in-memory fallback | Unranked; confirmed Reset clears this tab's gameplay |
| Signed-in ranked | Supabase account, persistent across devices | First verified result per player/ruleset only; no ranked reset or replay farming |
| Practice after cloud failure | Explicitly selected, uses unranked tab progress | Never uploaded or promoted to ranked, including after reconnect |

- Refresh normally retains guest progress. Normal tab/window closure ends the session; browser session restore may retain it. With storage blocked, reload starts again. There is no guaranteed long-term guest save.
- Language and analytics permission remain separate device-local preferences. Reset does not change them. Signing out starts a fresh guest session, without deleting cloud results.
- Old device-local saves migrate into unranked tab storage as a complete snapshot. Originals are removed only after successful write/readback of all gameplay keys. Conflicting snapshots are not merged: the old save is retained and explicit recovery can replace the tab snapshot. Failed migration preserves originals. **Guest and legacy scores never transfer to accounts or boards.**
- Configured online signed-out play states that boundary before the career: guest score is tab-local, unranked and non-transferable. A one-time inline reminder follows the first guest result; neither surface blocks play or launches OAuth directly. Portable `file:` play keeps working without an unusable sign-in prompt. See [ADR 0020](docs/adr/0020-guest-ranked-disclosure.md).
- Google sign-in saves account progress and automatically assigns a random animal alias for public leaderboards; no nickname form or enrollment checkbox is required. The optional nickname field in Account also suggests your Google name as an editable starting point if you'd rather use that ([ADR 0019](docs/adr/0019-suggest-google-name-as-nickname.md)) - nothing publishes beyond the random alias unless you explicitly save a change, and your Google photo or email are never used either way.
- A board lists signed-in players automatically after at least one verified result in that board. A verified loss qualifies at zero points. Global points count each player once; competition boards filter by canonical player membership, regardless of where that player was answered. Equal points share rank; nickname ordering makes tied pages stable.
- Cloud failure disables ranked mutations. Retry/reconnect retrieves authoritative account state; explicit practice remains unranked. Account deletion is a separate confirmation-gated action that removes cloud progress and public records, not a score-reset feature.

## Rules

- 220 playable careers: 110 representing European national teams and 110 representing South American national teams — this number grows with each research batch; [research and audit](DATA_AUDIT.md) document every expansion and its evidence, and the footer of the app itself always shows the current total.
- Choose Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão or All Players from the competition badge. Selection changes the playable pool, not a strict rival filter. Finish the active round first; an account has only one active server round even across devices.
- Ten shuffled choices, in both guest/practice play and ranked accounts: one correct player and nine distinct eligible rivals, excluding identical ordered club careers (see [ADR 0012](docs/adr/0012-ranked-ten-options-v2-ruleset.md); ranked's original five-option results remain immutable under their own `v1` ruleset). No difficulty selector: origin-first Hard is automatic.
- Wrong answers draw from playable players plus a bank of 37 researched wrong-answer-only profiles (see `research/verified-distractors.json`). Starting domestic football system takes precedence, then contemporary overlap with debuts at most eight years apart, then career similarity with bounded noise. This does not add playable rounds. See [ADR 0003](docs/adr/0003-researched-contemporary-rivals.md).
- Three attempts. Wrong choices are disabled. A correct answer or third error ends the round; only then does Next Player appear. Hints reveal country, then position, then each club's years in the career timeline — three hints, the same in guest/practice and ranked play (see [ADR 0010](docs/adr/0010-ranked-third-hint-parity.md)). Hints reduce points; there is no initials hint.
- A correct answer earns up to 100 points, reduced by 20% per hint and by answer speed: full value inside a 2-second grace window, decaying to a 25% floor by 24 seconds — long enough to actually read a 10-option career, short enough that an outside lookup can't out-score a fast, honest guess (see [ADR 0009](docs/adr/0009-speed-decay-anti-lookup-tightening.md), retuned by [ADR 0011](docs/adr/0011-longer-decay-window-and-guest-clock-persistence.md)). A loss earns zero. Guest and ranked elapsed time persist per active round (guest: sessionStorage keyed to the current player; ranked: server `started_at`) and include time away, so reload cannot reset either clock. A brand-new canonical-site guest round waits to start only while the first analytics-consent choice obscures play; either decision starts the persisted clock, while an existing clock always remains authoritative ([ADR 0020](docs/adr/0020-guest-ranked-disclosure.md)). A minimal `#speed-meter` strip shows the curve live and freezes on resolution.
- Resolved players, right or wrong, are excluded across competitions. Guests maintain that ledger for the tab session until unranked Reset. Accounts retain a permanent first result per player/ruleset. Exhausted competitions show Completed rather than offering ranked repeats.
- The masthead score is global across competitions within the active mode, never combined guest/cloud points. Guest score and streak accumulate across decks; losing resets the streak, not points. Ranked mode currently displays cloud points, not an invented cloud streak.
- Finished guest games appear in the tab's results history (last 100 games). Recap counts are based on the saved deck; competition completion counts include all resolved players in that competition. Replay does not clear accumulated points or the seen ledger.
- Compatible legacy saves retain decks, engaged rounds, guesses, hints, points and history. Only an untouched current round with weaker origin/era options is repaired on load.

## Language and accessibility

English and Spanish share the same offline artifact. Selection order: explicit `?lang=en/es`, saved preference, then Spanish. Language changes do not reset gameplay. UI, hints, notes and accessibility labels are translated; proper names and source article titles remain unchanged.

Keyboard-operable controls, visible focus, text plus color feedback, live announcements and reduced-motion support are part of the contract. Careers always read in the same plain order — left to right, then down — at every width; clubs are grouped into pages of up to eight in the DOM ([ADR 0018](docs/adr/0018-row-major-paged-career-grid.md)). At widths of 800px and below, that grouping is invisible to layout, so a numbered four-column grid grows to as many rows as needed, with no horizontal scrolling ([ADR 0016](docs/adr/0016-career-grid-at-every-width.md)). Above 800px each page becomes its own two-row grid instead, and a career longer than one page scrolls sideways to the next page rather than growing a third row, so the answer options never drop below the fold ([ADR 0017](docs/adr/0017-desktop-two-row-career-cap.md)). [TESTING.md](TESTING.md) records actual browser coverage and historical limitations rather than promising every browser or viewport is verified.

## Career-data policy

The roster is a dated, manually researched snapshot, not a live transfer feed. Active careers need rechecking after transfers. Competition tags are broad club-membership categories, not per-appearance verification; see [data policy](research/data-policy.md#competition-tags).

Timelines include professional senior clubs, competitive senior reserve spells, loans and distinct playing returns. National teams, youth sides, coaching, training-only visits, testimonials and amateur post-retirement football are excluded. Roberto Carlos's friendly-only Atlético Mineiro tour loan and Ronaldinho's announced Ravenna signing are explicitly qualified. Continuous loan-to-permanent spells are combined; reserve/first-team dates can overlap. Country means senior national team represented; position is a broad playing role. See [career sources](CAREER_SOURCES.md) for chronology and conflicts. Crests identify clubs, not historical season-specific artwork.

## Files and delivery

- `index.html` — complete offline guest artifact; inline account client uses optional remote services.
- `leaderboard.html` — standalone online ranking destination: global/competition filters, personal placement, pagination, Play navigation, and (since [ADR 0014](docs/adr/0014-leaderboard-competition-crests-and-account-dialog-parity.md)) the same account dialog and competition-crest picker as the main game, for component parity; it still never starts ranked rounds, mutates gameplay or runs analytics. The Google OAuth handshake itself still only completes on `index.html`.
- `privacy.html` — public bilingual account/analytics privacy page with the project contact address; include it in the static website package.
- `AGENTS.md` — shared agent guidance; `CLAUDE.md` imports it, not a second policy copy.
- `.agents/skills/derabona-player-addition/SKILL.md` — canonical project-local, tested workflow for discovering, researching and integrating playable careers; its discovery phase includes a reusable shortlist template and validator. Codex and trusted Hermes sessions discover this cross-tool location. `.claude/skills/derabona-player-addition`, `.codex/skills/derabona-player-addition` and `.gemini/skills/derabona-player-addition` are symlinks to that one source for Claude Code, Codex compatibility and Gemini CLI—edit only the canonical file. Run `hermes skills trust` once from a trusted checkout before expecting Hermes to load project skills.
- `DESIGN.md`, `TESTING.md`, `docs/adr/` — product contract, verification and decision history.
- `docs/leaderboards.md` — server API, security boundaries, local tests and separate backend release gates.
- `docs/analytics.md` — existing consent-first tracking contract, independent of accounts.
- `docs/contact.md` — public contact-forwarding DNS contract and privacy-safe operational checks.
- `supabase/` — schema/roster migrations, Edge Functions and local project configuration.
- `scripts/export-ranked-roster.mjs` — exports the actual matching model for the frozen server ruleset; `--check` is read-only validation.
- `scripts/roster-batch.mjs` — fail-closed audit, coordinated core integration, data-only executable guard and parameterized forward-migration generation for reviewed roster batches.
- `BRAND.md`, `assets/derabona-*` — visual identity, editable logo/mark and social image. The game embeds its own mark/favicon.
- `CAREER_SOURCES.md`, `DATA_AUDIT.md`, `research/` — curated records, policy and source ledgers. Raw retrievals stay ignored.
- `tests/` — model, storage, browser, Edge handler and real PostgreSQL checks.

GitHub Pages serves static files; it does **not** deploy Supabase migrations/functions or configure Google OAuth. `.github/workflows/pages.yml` validates every push, pull request and manual run with Node/native PostgreSQL tests, source-identifier checks and Deno checks/tests. Only validated non-PR runs on `main` deploy. Its public package is `index.html`, `leaderboard.html`, `privacy.html`, `assets/derabona-social-es-v1.png`, `robots.txt`, `sitemap.xml` and `favicon.svg`. Research, tests and private backend code are not website assets. The repository is public at the owner's request.

## Test and edit

No frontend build step. Edit inline CSS/data/model/UI directly, preserving script IDs and embedded assets. Career edits must update curated records and citations too. Server roster changes require reviewed migrations; never overwrite a ruleset already used for ranked results.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. In another terminal:

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs tests/guest-session.test.mjs
node scripts/export-ranked-roster.mjs --check
python3 tests/source-check.py
# Requires playwright-cli and the local server above:
python3 tests/run-browser.py --suite guest-session-checks.js --suite accounts-checks.js --suite leaderboard-checks.js --suite offline-checks.js
# Full browser regression runner (historical limitations documented separately):
python3 tests/run-browser.py
```

The runner uses a named headless non-persistent development session and ignored `test-results/` output. Account browser tests use mocked SDK/API responses: they are not live Google login or database evidence. Native PostgreSQL and Deno commands are in [docs/leaderboards.md](docs/leaderboards.md); observed results and remaining hosted checks are in [TESTING.md](TESTING.md).

## Assets and privacy

Club crests/names remain their owners' trademarks/copyright. Public image-source URLs are retained for attribution. This is an unofficial educational/personal demo, not club/player endorsement or a blanket redistribution license. Source links open externally only when clicked.

Optional **consent-first PostHog EU analytics** measures visits/gameplay only after Allow analytics. Declining does not affect guest or account play; permission can be withdrawn under Privacy and analytics. No recordings, autocapture or advertising. Google/Supabase account identity is functional account data, not analytics identity: no account IDs, nicknames, Google names/photos, emails or tokens go to PostHog. Offline/local play makes no analytics requests. See [analytics details](docs/analytics.md), [privacy page](privacy.html) and [dashboard](https://eu.posthog.com/project/273163/dashboard/949592).

Privacy enquiries go to `contact@derabona.club`. ImprovMX forwards that public alias to a private inbox; the private destination and forwarding credentials must not be committed or copied into project documentation. See [contact operations](docs/contact.md).
