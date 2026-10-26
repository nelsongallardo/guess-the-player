# Search visibility — derabona

## Positioning

Primary audience: Spanish-speaking football fans, with Argentinian wording. The primary intent is **adivinar jugadores de fútbol por su carrera**; supporting phrases are **quiz de fútbol**, **juego de fútbol gratis** and **trayectorias de futbolistas**. These are editorial intent choices, not claims about measured search volume or rankings.

The game’s canonical URL is **https://derabona.club/**; the standalone ranking destination canonicalizes to **https://derabona.club/leaderboard.html**. The sitemap lists both real pages. These declarations are not proof of search-engine indexing. It serves Spanish title, heading, description, explanatory content and structured data in the initial HTML. First-time visits use Spanish; explicit `?lang=en`/`?lang=es` and a saved preference still take precedence. The English toggle remains fully functional. Game query variants canonicalize to the home page and leaderboard language/competition variants to its own canonical page; do not add hreflang until there are genuine separately served, indexable language pages.

## Implemented

- Descriptive Spanish title and natural meta description; existing branded OG/Twitter card retained.
- One canonical URL per real page, crawlable site-name `WebSite` and accurate `WebApplication` JSON-LD. No fabricated ratings, reviews, search action or unsupported rich-result promises. The markup describes the app; it does not establish Google's software-app rich-result eligibility.
- A concise explanation and expandable rules, points, competitions and offline/progress information below the game. The points FAQ explains hint ceilings (three hints, the same in every mode - see [ADR 0010](adr/0010-ranked-third-hint-parity.md)), time decay, a worked example, server timing and ranked totals without changing scoring. Initial Spanish content does not require JavaScript; it translates when the UI language changes.
- Root `robots.txt`, canonical-only `sitemap.xml`, and crawlable `favicon.svg`. No invented `lastmod` dates, priority values or keyword meta tags.
- The deployment explicitly includes these assets; research and tests remain outside the published site.
- Embedded PNGs reduced in size while preserving every crest key and source attribution. Maximum dimensions are 128 × 128. Palette reduction is visually lossy, so every before/after pair was reviewed; an alpha-channel guard preserves fully transparent pixels. The game remains a portable offline HTML file.
- A temporary, labelled loading area reserves the game viewport until the first round is laid out. It does not add permanent empty space or conceal the explanatory content. With JavaScript disabled the explanation and a noscript message remain available.

## Performance evidence and caveats

### 26 October 2026: current roster and startup repair

The current 221-player file contains 495 embedded crest assets. A lossless PNG pass reduced their combined size from **2,393,209 to 2,025,245 bytes** (15.4%). Every decoded RGBA pixel, image dimension, ICC color profile, crest key and attribution field was checked against revision `8c9168e`. This pass does not requantize the already indexed images. Reproduce it with:

```sh
uv run --with pyoxipng --with pillow python scripts/optimize-crests-lossless.py --source-ref 8c9168e
```

The roster literal is compacted to one unchanged JSON object per player. Together these changes reduce the complete HTML from **6,926,152 to 5,904,919 bytes**, and a same-settings gzip comparison from **2,695,824 to 2,528,848 bytes** (6.2%). The script IDs, all roster values and every other script block remain unchanged by this optimization, including the frozen Daily payload and schedule. No runtime dependency or external asset fetch was added.

The initial `play-ready` class hides the round panel, so the old reservation on that panel never took effect. The friends card and explanation appeared above the fold and then moved below it when the game rendered. Initial space is now reserved on the visible loading status and removed with `game-loading`; the ready round retains no minimum height. The masthead also reserves account-label width and uses phone spacing that fits the Spanish sign-in label at 320px (previous document width: 330px).

Two paired mobile Lighthouse 13.5 samples against the same local gzip server measured:

| Metric | Baseline `8c9168e` | Candidate |
| --- | --- | --- |
| Performance | 36 / 36 | 53 / 53 |
| LCP | 14.044 / 14.046 s | 13.302 / 13.302 s |
| CLS | 0.31956 / 0.31956 | 0.00215 / 0.00215 |
| Accessibility / best practices / SEO | 100 / 100 / 100 | 100 / 100 / 100 |

These are paired lab measurements, not hosted deployment or field Core Web Vitals evidence. The large single-file transfer still produces poor simulated mobile LCP; the largest improvement is layout stability. The earlier same-day live audit scored 31–32 with LCP 14.1–14.3 seconds and CLS 0.32. Do not compare fine-grained timing across the live and local environments.

Verification used Node 22: model, SEO, social-preview and frozen-Daily tests (56), then account boundaries, points FAQ, Daily UI/summary/ranked UI (64), plus literal source checks. Chromium checks passed for SEO/no-JS/early shell, 320/390/1280px startup layout, account startup/recovery (26 checks), saved rivals in both languages over HTTP and `file:`, and all **221 offline rounds / 495 crest sources** with zero network requests and denied-storage recovery. Phone and desktop screenshots were inspected. The legacy offline/saved-rivals/SEO tests now explicitly enter Unlimited when asserting Unlimited state; Daily remains the normal product entry route. Tests ran through a worktree-local port-4174 harness with the runner's hard-coded 4173 URLs substituted, in a fresh non-persistent session. Raw reports and screenshots are ignored under `test-results/`; this is a focused selection, not a full-browser-suite claim.

### Earlier release evidence

Baseline live Lighthouse mobile run on 13 September 2026 (`test-results/seo-before.json`): performance **31**, accessibility **100**, best practices **100**, SEO **100**. Simulated FCP/LCP **16.8 seconds**, CLS **0.494**. This is a lab sample, not field Core Web Vitals and not a ranking metric. The initial SEO score already passed the basic checklist; the work goes beyond that checklist.

Original embedded PNG payload: **3,060,219 bytes**. Optimized PNG payload: **743,566 bytes**. All 156 keys and metadata are retained. Reproduce optimization from the original revision rather than requantizing an already optimized file:

```sh
uv run --with pillow python research/optimize-crests.py --source-ref f59fe51
```

Local checks eliminated the measured startup layout shift. Production performance must be measured separately after deployment: the local Python server does not use GitHub's transfer compression. Audits are affected by hardware, network and randomly selected careers; compare more than one run before drawing fine-grained conclusions.

## Loading: what actually waits

The badges are embedded PNGs, not a set of third-party image downloads. A fresh visitor first transfers and parses the portable game HTML; a signed-in visitor also waits for the pinned account SDK/session and authoritative cloud progress, plus a round start when needed (its response already contains the authoritative projection; there is no confirmation read-back). Do not bypass these identity/scoring boundaries or silently show guest gameplay as ranked to hide latency.

On 13 September 2026, three fresh anonymous Chromium samples of release `0488d19` observed the club grid in **182–325ms**, with **796,632 bytes transferred as the encoded HTML body** (1,664,000 decoded). The standalone leaderboard HTML reached DOMContentLoaded in **20–106ms**, then its public API read took **461–549ms**; an earlier separate sample took **849ms** for that read. These unthrottled lab samples are not signed-in measurements or promises about mobile networks. Evidence is in ignored `test-results/loading-timing-before.json`.

The remaining online wait needs visible, truthful loading feedback, not fake percentages, made-up ranks or a blank career panel. Keep placeholders decorative, status text translated and announced, reduced-motion respected, and clear busy state when ready or failed. Connection failures must expose retry/practice rather than spin indefinitely. Preserve the single-file offline game and all embedded crests; splitting the asset payload would be a separate architectural decision.

## Verification

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py --suite seo-checks.js --suite account-startup-checks.js --suite offline-checks.js --suite saved-rivals-checks.js
npx --yes lighthouse https://derabona.club/ --quiet --chrome-flags='--headless' --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=test-results/seo-live.json
```

Also verify public redirects, raw HTML without JS, image and favicon responses, sitemap XML, and an actual live browser round. The full legacy browser suite has pre-existing failures reproduced on the unchanged `f59fe51` artifact: replay-reset scoring, longest-career visibility, replay visibility in difficulty checks, and legacy progress denominator. These were not removed or weakened for this SEO work. `test-results/seo-browser-audit.json` records the paired baseline/current diagnostics.

## Account-side follow-up

- Verify ownership of `derabona.club` in Google Search Console, submit `https://derabona.club/sitemap.xml`, and inspect the canonical home page for indexing. A public sitemap or a successful crawler-style fetch is **not** proof of submission, indexing or ranking.
- Review actual queries, impressions and clicks after Google has crawled the changes. Do not promise immediate indexing or a search position.
- Consider original football content only if it is genuinely useful. Do not mass-generate thin player/competition doorway pages or publish answers solely to stuff keywords.
- Keep previews and discovery separate: messaging apps cache cards independently from Google Search.

## Official guidance consulted

- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): helpful content, search intent, descriptive presentation; no guaranteed ranking.
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): crawling, rendering, indexable content and discoverable links.
- [Site names](https://developers.google.com/search/docs/appearance/site-names): home-page `WebSite` data and consistent naming.
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): canonical URLs and sitemap discovery/submission.
- [Structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies): accurate visible content, no misleading markup or fake reviews.
