# Guess the Player by their Career Path

A dark-mode football trivia game. Read the club-crest timeline, then identify the player from five names. Built with plain HTML, CSS and JavaScript in **one portable `index.html` file**.

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

- Fifty players: twenty-five representing European national teams and twenty-five representing South American national teams. The original stars are joined by Fabricio Coloccini, Juan Pablo Sorín, Pablo Aimar, Esteban Cambiasso, Diego Milito, Gaizka Mendieta, Tomáš Rosický, Iván de la Peña, Robbie Keane and Wesley Sneijder.
- The second expansion adds **Javier Saviola, Andrés D’Alessandro, Maxi Rodríguez, Claudio Pizarro, Walter Samuel, Joe Cole, Freddie Ljungberg, John Arne Riise, Luis García, Eiður Guðjohnsen**.
- All additions are playable answers and eligible similarity-ranked distractors. Their researched notes and authentic club crests are included offline in both languages.
- Five shuffled answers per round: one correct player and four distinct distractors, selected by difficulty.
- **Easy / Fácil:** random rivals from the full eligible roster.
- **Medium / Media (default):** four rivals sampled from the twelve most similar eligible players.
- **Hard / Difícil:** the four most similar eligible players; answer positions are still shuffled.
- Similarity prioritizes shared clubs, then national team, broad position, overlapping career years and career length. Identical ordered career paths remain excluded. Candidates come only from the researched 50-player roster; difficulty changes neither the facts nor the hints/attempts.
- The difficulty selector is just below the career timeline. A change applies immediately before any guess/hint; otherwise the current options stay fixed and the setting applies to the next player. A bilingual message explains pending changes. Progress is preserved, and reload/replay remembers the selection.
- Three attempts. Wrong buttons turn red and cannot be selected again.
- **Get Hint** reveals country, then position, then the initials of the displayed player name. Hints cost nothing.
- Each correct round earns **100 points**, regardless of attempts or hints, and adds one to the consecutive win streak. Losing a round resets the streak, not the score.
- **Next Player** appears only after winning or losing a round.
- A new shuffled deck visits all 50 players once before the final recap. Existing 30- and 40-player saves retain their original deck and exact choices, score and hints; after finishing, Play again starts a 50-player deck, resets the score and retains difficulty.
- Progress is saved in this browser when local storage is available. Browsers that block storage can still play, but reloading starts a new game. File-URL storage behavior varies by browser.

## Career-data policy

The original audit and two ten-player [research expansion](DATA_AUDIT.md) distinguish corroborated club history from unresolved dates and registration evidence. This is a dated, manually researched snapshot, not a live transfer feed. See the research files for the retrieved sources, cross-checks and player-specific notes. Active-player careers require rechecking after future transfers.

The timeline includes professional senior clubs, competitive senior reserve-team spells, loans, and distinct playing returns. National teams, youth sides, coaching jobs, training-only visits, testimonials and amateur post-retirement football are excluded. Two documented exceptions are clearly tagged: Roberto Carlos’s friendly-only Atlético Mineiro tour loan (**Tour loan**) and Ronaldinho’s announced Ravenna signing (**Signing\***; completed registration and competitive debut not established). Continuous loan-to-permanent spells are combined, with the loan noted. Parallel reserve/first-team spells can overlap in years. See [the data policy](research/data-policy.md) and [player-by-player sources](CAREER_SOURCES.md) for exact scope, chronology and evidence conflicts. Current club crests identify the clubs; they are not historical season-specific artwork.

Country means the senior national team represented, not birthplace or every citizenship held. Position uses a broad playing-role category. Initials use the player's name as displayed in the answer options (so a mononym has one initial).

## Files

- `index.html` — the complete playable artifact; nothing else is required at runtime.
- `DESIGN.md` — visual direction, gameplay contract and acceptance matrix.
- `CAREER_SOURCES.md` — player-by-player chronology, caveats and numbered sources.
- `DATA_AUDIT.md` — original 30-player re-audit and researched expansions to 50, corrections and remaining evidence limits.
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

The browser runner reuses a named headless development session and writes screenshots/results under ignored `test-results/`. It tests all 50 rounds over HTTP, all 50 again in an offline local-file context, all 50 in Spanish, every career in both languages at five mobile/tablet widths, and all 50 rounds at each of the three difficulty levels in both languages. See [TESTING.md](TESTING.md) for the actual verification results and limits.

## Accessibility

Keyboard-operable controls, visible focus styles, localized crest alternative text, text plus color for answers, live feedback announcements, and reduced-motion support. Narrow screens show the complete numbered career grid without horizontal scrolling; desktop timelines retain keyboard and arrow navigation.

## Assets and privacy

Crests are embedded from public image sources, with source URLs retained for attribution. Club names and crests remain the trademarks/copyright of their respective owners. This is an unofficial educational/personal demo, not affiliated with or endorsed by the clubs or players. No blanket license to redistribute those marks is granted by this repository.

There is no analytics, advertising, account system, API key, or runtime third-party request. Source links open externally only when explicitly clicked.
