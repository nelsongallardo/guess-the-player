# derabona — brand guide

## The idea

**derabona** is a football-memory game built by friends. The name references a rabona: striking the ball with the kicking leg wrapped behind the standing leg. The identity should feel like football knowledge traded between friends, not a generic trivia app or an official national-team product.

Write the public name as **derabona**, all lowercase. The masthead signature (directly under the wordmark, both pages) is **"Adiviná al jugador. De memoria. De rabona."**, with the first clause in muted ink and the rest in the accent color - the same two-tone treatment as the hero headline's colored final phrase. It plays on the brand name itself ("de rabona" is both the backheel trick shot in the logo mark and, split apart, half of "derabona"). The English equivalent is **"Guess the player. From memory. With a rabona."** ("rabona" is standard English football vocabulary for the same trick shot, so the pun mostly survives translation). Spanish brand copy uses an Argentinian voice: "Confiá", "Demostrá", "tenés". Player names, sourced career information and competition names are not rewritten for branding.

## Logo

- [Rabona mark](assets/derabona-mark.svg): an original vector footballer badge. The celeste kicking leg passes behind the ivory standing leg toward the ball; a dark separation keeps the crossing readable.
- [Horizontal logo](assets/derabona-logo.svg): badge, heavy italic lowercase wordmark and Spanish signature on warm paper.
- [PNG export](assets/derabona-logo.png): a 1280 × 320 browser-rendered version for sharing.

The mark is embedded directly into `index.html`. The hosted site exposes a crawlable `/favicon.svg`; a `file:`-only fallback keeps the favicon embedded when playing offline. The standalone game does not fetch the files in `assets/`. Those files are editable source/export assets in the repository, not required runtime dependencies.

Use the badge alone for small icons. Keep the wordmark readable, leave clear space around the logo, and omit the signature at small sizes. Do not replace the rabona pose with a generic ball, club crest or national-team badge. The wordmark uses locally available Arial Black/Arial; no external font request is made.

## Competition logos

The competition picker and the masthead badge show each competition's real, current logo next to its name (`COMPETITION_LOGOS` in `index.html`, a small script block separate from `CREST_ASSETS`). Sourced as public SVG files from Wikipedia/Wikimedia Commons, embedded as base64 data URLs for offline play, same rationale as club crests: current/official-source artwork, not historical or fictional. Original source URLs are kept for provenance:

- Champions League: [UEFA Champions League](https://en.wikipedia.org/wiki/UEFA_Champions_League)
- Premier League: [Premier League](https://en.wikipedia.org/wiki/Premier_League)
- La Liga: [La Liga](https://en.wikipedia.org/wiki/La_Liga)
- Argentine Primera División: [Argentine Primera División](https://en.wikipedia.org/wiki/Argentine_Primera_Divisi%C3%B3n)
- Brasileirão: [Campeonato Brasileiro Série A](https://en.wikipedia.org/wiki/Campeonato_Brasileiro_S%C3%A9rie_A)

"All Players" has no league logo; the picker keeps its plain layout there. Competition trademarks remain their owners'; this is an unofficial fan game.

## Link preview (Spanish)

- Editable source: [social card SVG](assets/derabona-social-es-v1.svg). Hosted export: [1200 × 630 PNG](assets/derabona-social-es-v1.png). Reuses the existing logo, paper/ink/celeste palette and local fonts.
- Headline: **Adiviná al jugador por su carrera.** Supporting copy: **Cinco nombres. Tres chances.**
- Static Open Graph and Twitter metadata stays in Spanish (`es_AR`) even when the game UI switches language. The image must be a public absolute HTTPS PNG URL, not the embedded SVG favicon.
- Pages publishes the game, this preview PNG and the crawl assets (`robots.txt`, `sitemap.xml`, `favicon.svg`). The SVG remains editable repo source; gameplay stays fully self-contained/offline. For re-export, render the SVG inside a margin-free HTML wrapper at 1200 × 630 and device scale 1 in Chrome, then capture a PNG.
- Platforms cache previews. Version the image filename when changing its design; metadata/image availability does not prove each platform has refreshed its cached card.

## Palette

- **Ink — `#122a38`:** wordmark, pitch card, scoreboard, primary buttons.
- **Paper — `#f7f4eb`:** page canvas and light foregrounds on ink.
- **Celeste — `#89cff0`:** badge accent, competition selector, pitch markers and scoreboard underline.
- **Deep blue — `#176180`:** accessible accent text, links and progress on paper.
- **Panel — `#fffdf7`:** answer cards, crest tiles and recap surface.
- **Muted — `#52636a`:** supporting text on paper.
- **Success — `#17613e`:** correct-answer state, paired with a pale green surface.
- **Error — `#a93637`:** wrong-answer state, paired with a pale red surface.

Celeste is not body text on paper. Use deep blue there; reserve light celeste text for the ink panel. Keep wrong/correct states distinguishable by text and icons, not color alone.

## UI direction

A warm match programme around a dark, pitch-like career card. Heavy editorial headings and an italic wordmark carry the personality; compact monospaced labels suggest team sheets and football records. Authentic club crests remain the most colorful information on screen.

- Header: logo, existing competition control, language and help. At narrow widths, competition moves into its own row instead of squeezing the logo.
- Hero: a short question, not a brand splash screen. Spanish: “Cada club cuenta. ¿Quién es?” Keep “¿Quién es?” together when wrapping.
- Scoreboard: ink with a celeste underline; preserve score and streak visibility.
- Career panel: ink, ivory crest tiles and light labels. Preserve desktop timeline navigation and the numbered four-column mobile grid.
- Answers: warm-white cards, clear letter markers, visible hover/focus and explicit correct/incorrect states.
- Mobile: compact header/hero; do not sacrifice readable dates, club names or touch targets to decoration. The longest-career initial-screen assertion remains enabled.

The final `derabona` section inside the existing inline stylesheet defines the brand layer. Reuse its tokens rather than scattering new colors across components.

## Compatibility and scope

Branding does **not** change the roster, research, competition pools, Hard algorithm, hints, scoring, results history or replay rules. Keep `touchline.career.v1`, `touchline.language.v1` and `touchline.history.v1` as legacy storage identifiers: renaming them would strand saved progress. The repository name remains unchanged; the public site is https://derabona.club/ and the original GitHub Pages URL redirects there.

For future changes, run the documented model/source/browser checks. `tests/brand-checks.js` checks both language titles, the lowercase wordmark, embedded logo/hosted favicon (with an offline fallback), unchanged storage namespaces and header layout at seven widths.
