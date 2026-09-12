# derabona

**Fútbol, de memoria.** A football-career quiz built around the spirit of a rabona: read the club-crest timeline, then identify the player from five names. An original rabona-player logo, lowercase wordmark and celeste/ink/paper interface give it an Argentinian football identity. Built with plain HTML, CSS and JavaScript in **one portable `index.html` file**.

See [BRAND.md](BRAND.md) for the identity, editable SVG logo and PNG export. Existing saved games and all gameplay rules survive the rebrand; legacy storage identifiers and the website URL stay unchanged.

## Play

**Website:** <https://nelsongallardo.github.io/guess-the-player/>

**Español:** <https://nelsongallardo.github.io/guess-the-player/?lang=es> · **English:** <https://nelsongallardo.github.io/guess-the-player/?lang=en>

On mobile/tablet (800px and below), all club crests fit a compact, numbered four-column grid—read left to right, then the next row. No horizontal scrolling or hidden clubs. Desktop retains the horizontal timeline.

Use the language selector to switch between English and Spanish without losing progress. Menus, hints, feedback, rules, accessibility labels and all player career notes are translated; original article titles and proper names are preserved. Selection order: explicit `?lang=en/es`, saved preference, then browser language. Both versions remain inside the same offline HTML file.

Download `index.html` and open it in a modern browser. No installation or server is required. The file includes the game, complete player database and crest images, so gameplay also works offline.

For local development:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173>.

## Rules

- Sixty players: thirty representing European national teams and thirty representing South American national teams. The original stars are joined by Fabricio Coloccini, Juan Pablo Sorín, Pablo Aimar, Esteban Cambiasso, Diego Milito, Gaizka Mendieta, Tomáš Rosický, Iván de la Peña, Robbie Keane and Wesley Sneijder.
- The second expansion adds **Javier Saviola, Andrés D’Alessandro, Maxi Rodríguez, Claudio Pizarro, Walter Samuel, Joe Cole, Freddie Ljungberg, John Arne Riise, Luis García, Eiður Guðjohnsen**.
- The third expansion adds **Fernando Torres, Xabi Alonso, Thierry Henry, Iker Casillas, Andrea Pirlo, Diego Maradona, Javier Mascherano, Cafu, Marcelo Salas, Rivaldo**.
- All additions are playable answers and eligible similarity-ranked distractors. Their researched notes and authentic club crests are included offline in both languages.
- **Choose a competition** — Champions League, Premier League, La Liga, the Argentine Primera División, the Brasileirão, or All Players (the default) — from the prominent competition badge at the top of the page, or "Change competition" on the recap screen. Each competition deals only the players who carry that club-membership tag; distractor names favour the same competition when there are enough of them. Choosing one starts a fresh deck in that competition; it never interrupts a round already in progress.
- Five shuffled answers per round: one correct player and four distinct rivals sampled from the **eight most similar eligible players** — the existing Hard behaviour. No difficulty selector or extra setup decision.
- Similarity prioritizes shared clubs, then national team, broad position, overlapping career years and career length. Identical ordered career paths remain excluded. Candidates come from the active competition's players (or the full 60-player roster in All Players mode); difficulty changes neither the facts nor the hints/attempts.
- Existing saves keep their exact rounds, answer order, guesses, hints and score. Older difficulty preferences are retired: new rounds, competition changes, reset and replay use Hard automatically.
- Three attempts. Wrong buttons turn red and cannot be selected again.
- **Get Hint** reveals country, then position, then the initials of the displayed player name. Hints cost nothing.
- Each correct round earns **up to 100 points** and adds one to the consecutive win streak. Losing a round resets the streak, not the score. Points scale down 20% per hint used and by how long the round took to answer (full value inside 5 seconds, decaying to a 50% floor by 30 seconds) — see `docs/adr/0001-local-results-history-and-speed-based-scoring.md` for the exact formula and reasoning.
- Every finished game is saved to a local results history on this device (not synced anywhere), shown on the recap screen with your best score/streak so far. A "Reset my results" button in the footer clears the current game and this history at any time.
- **Next Player** appears only after winning or losing a round.
- A new shuffled deck visits every player in the active competition once before the final recap (all 60 in All Players mode). Existing 30-, 40- and 50-player full-roster saves retain their original deck and exact choices, score and hints; after finishing, Play again starts a fresh deck in the same competition, resets the score and uses Hard.
- Progress is saved in this browser when local storage is available. Browsers that block storage can still play, but reloading starts a new game. File-URL storage behavior varies by browser.

## Career-data policy

The original audit and three ten-player [research expansions](DATA_AUDIT.md) distinguish corroborated club history from unresolved dates and registration evidence. This is a dated, manually researched snapshot, not a live transfer feed. See the research files for the retrieved sources, cross-checks and player-specific notes. Active-player careers require rechecking after future transfers.

Competition tags (Champions League, Premier League, La Liga, Argentine Primera División, Brasileirão) are a broad club-membership categorization used to organize gameplay, not a per-appearance sourced claim — see [the data policy](research/data-policy.md#competition-tags).

The timeline includes professional senior clubs, competitive senior reserve-team spells, loans, and distinct playing returns. National teams, youth sides, coaching jobs, training-only visits, testimonials and amateur post-retirement football are excluded. Two documented exceptions are clearly tagged: Roberto Carlos’s friendly-only Atlético Mineiro tour loan (**Tour loan**) and Ronaldinho’s announced Ravenna signing (**Signing\***; completed registration and competitive debut not established). Continuous loan-to-permanent spells are combined, with the loan noted. Parallel reserve/first-team spells can overlap in years. See [the data policy](research/data-policy.md) and [player-by-player sources](CAREER_SOURCES.md) for exact scope, chronology and evidence conflicts. Current club crests identify the clubs; they are not historical season-specific artwork.

Country means the senior national team represented, not birthplace or every citizenship held. Position uses a broad playing-role category. Initials use the player's name as displayed in the answer options (so a mononym has one initial).

## Files

- `index.html` — the complete playable artifact; nothing else is required at runtime.
- `DESIGN.md` — visual direction, gameplay contract and acceptance matrix.
- `BRAND.md` and `assets/derabona-*` — brand guide, editable logo/mark and shareable PNG export. The live game embeds its own mark/favicon and stays self-contained.
- `CAREER_SOURCES.md` — player-by-player chronology, caveats and numbered sources.
- `DATA_AUDIT.md` — original 30-player re-audit and researched expansions to 60, corrections and remaining evidence limits.
- `research/` — curated career records, data policy and public source-URL ledger. Raw third-party retrievals and assembly scratch files remain local and are not republished.
- `tests/` — reproducible browser/data checks.

## Test and edit

GitHub Pages deploys automatically from `main` using `.github/workflows/pages.yml`. Every deployment first runs the model/data and source-identifier checks, then publishes **only `index.html`**. The repository is public at the owner's request; research and test files remain available in the repo but are not part of the deployed website.

The delivered file needs **no build step**. Edit its CSS, the explicit `PLAYERS` array, `CREST_ASSETS`, or the model/UI scripts directly. When updating a career, update the matching curated record and source document as well. All images are embedded PNGs; retain original public URLs for attribution.

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
# With the local server above running and playwright-cli installed:
python3 tests/run-browser.py
```

The browser runner reuses a named headless development session and writes screenshots/results under ignored `test-results/`. It tests all 60 rounds over HTTP, all 60 again in an offline local-file context, all 60 in Spanish, every career in both languages at five mobile/tablet widths, and all 60 rounds with automatic Hard selection in both languages. It also verifies removal of the selector and migration of old preferences without changing existing rounds. See [TESTING.md](TESTING.md) for the actual verification results and limits.

## Accessibility

Keyboard-operable controls, visible focus styles, localized crest alternative text, text plus color for answers, live feedback announcements, and reduced-motion support. Narrow screens show the complete numbered career grid without horizontal scrolling; desktop timelines retain keyboard and arrow navigation.

## Assets and privacy

Crests are embedded from public image sources, with source URLs retained for attribution. Club names and crests remain the trademarks/copyright of their respective owners. This is an unofficial educational/personal demo, not affiliated with or endorsed by the clubs or players. No blanket license to redistribute those marks is granted by this repository.

There is no analytics, advertising, account system, API key, or runtime third-party request. Source links open externally only when explicitly clicked.
