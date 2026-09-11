# Guess the Player by their Career Path

A dark-mode football trivia game. Read the club-crest timeline, then identify the player from five names. Built with plain HTML, CSS and JavaScript in **one portable `index.html` file**.

## Play

Download `index.html` and open it in a modern browser. No installation or server is required. The file includes the game, complete player database and crest images, so gameplay also works offline.

For local development:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173>.

## Rules

- Thirty players: fifteen representing European national teams and fifteen representing South American national teams.
- Five shuffled answers per round: one correct player and four distinct randomly sampled distractors.
- Three attempts. Wrong buttons turn red and cannot be selected again.
- **Get Hint** reveals country, then position, then the initials of the displayed player name. Hints cost nothing.
- Each correct round earns **100 points**, regardless of attempts or hints, and adds one to the consecutive win streak. Losing a round resets the streak, not the score.
- **Next Player** appears only after winning or losing a round.
- A shuffled deck visits every player once before the final recap. Play again starts a new deck and resets the score.
- Progress is saved in this browser when local storage is available. Browsers that block storage can still play, but reloading starts a new game. File-URL storage behavior varies by browser.

## Career-data policy

This is a dated, manually researched snapshot, not a live transfer feed. See the research files for the retrieved sources, cross-checks and player-specific notes. Active-player careers require rechecking after future transfers.

The timeline includes professional senior clubs, competitive senior reserve-team spells, loans, and distinct playing returns. National teams, youth sides, coaching jobs, training-only visits, testimonials and amateur post-retirement football are excluded. Two documented exceptions are clearly tagged: Roberto Carlos’s friendly-only Atlético Mineiro tour loan (**Tour loan**) and Ronaldinho’s current Ravenna signing (**Signing\***; no competitive debut established). Continuous loan-to-permanent spells are combined, with the loan noted. Parallel reserve/first-team spells can overlap in years. See [the data policy](research/data-policy.md) and [player-by-player sources](CAREER_SOURCES.md) for exact scope, chronology and evidence conflicts. Current club crests identify the clubs; they are not historical season-specific artwork.

Country means the senior national team represented, not birthplace or every citizenship held. Position uses a broad playing-role category. Initials use the player's name as displayed in the answer options (so a mononym has one initial).

## Files

- `index.html` — the complete playable artifact; nothing else is required at runtime.
- `DESIGN.md` — visual direction, gameplay contract and acceptance matrix.
- `CAREER_SOURCES.md` — player-by-player chronology, caveats and numbered sources.
- `research/` — curated career records, data policy and public source-URL ledger. Raw third-party retrievals and assembly scratch files remain local and are not republished.
- `tests/` — reproducible browser/data checks.

## Test and edit

The delivered file needs **no build step**. Edit its CSS, the explicit `PLAYERS` array, `CREST_ASSETS`, or the model/UI scripts directly. When updating a career, update the matching curated record and source document as well. All images are embedded PNGs; retain original public URLs for attribution.

```sh
node --test tests/model.test.mjs
python3 tests/source-check.py
# With the local server above running and playwright-cli installed:
python3 tests/run-browser.py
```

The browser runner reuses a named headless development session and writes screenshots/results under ignored `test-results/`. It tests all 30 rounds over HTTP, then all 30 again via a local file in an isolated offline browser context. See [TESTING.md](TESTING.md) for the actual verification results and limits.

## Accessibility

Keyboard-operable buttons and timeline, visible focus styles, descriptive crest alternative text, text plus color for answers, live feedback announcements, and reduced-motion support. Narrow screens scroll only the timeline horizontally; the rest of the page fits the viewport.

## Assets and privacy

Crests are embedded from public image sources, with source URLs retained for attribution. Club names and crests remain the trademarks/copyright of their respective owners. This is an unofficial educational/personal demo, not affiliated with or endorsed by the clubs or players. No blanket license to redistribute those marks is granted by this repository.

There is no analytics, advertising, account system, API key, or runtime third-party request. Source links open externally only when explicitly clicked.
