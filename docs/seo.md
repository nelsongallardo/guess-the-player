# Search visibility — derabona

## Positioning

Primary audience: Spanish-speaking football fans, with Argentinian wording. The primary intent is **adivinar jugadores de fútbol por su carrera**; supporting phrases are **quiz de fútbol**, **juego de fútbol gratis** and **trayectorias de futbolistas**. These are editorial intent choices, not claims about measured search volume or rankings.

The game’s canonical URL is **https://derabona.club/**; the standalone ranking destination canonicalizes to **https://derabona.club/leaderboard.html**. The sitemap lists both real pages. These declarations are not proof of search-engine indexing. It serves Spanish title, heading, description, explanatory content and structured data in the initial HTML. First-time visits use Spanish; explicit `?lang=en`/`?lang=es` and a saved preference still take precedence. The English toggle remains fully functional. Game query variants canonicalize to the home page and leaderboard language/competition variants to its own canonical page; do not add hreflang until there are genuine separately served, indexable language pages.

## Implemented

- Descriptive Spanish title and natural meta description; existing branded OG/Twitter card retained.
- One canonical URL per real page, crawlable site-name `WebSite` and accurate `WebApplication` JSON-LD. No fabricated ratings, reviews, search action or unsupported rich-result promises. The markup describes the app; it does not establish Google's software-app rich-result eligibility.
- A concise explanation and expandable rules, competitions and offline/progress information below the game. Initial Spanish content does not require JavaScript; it translates when the UI language changes.
- Root `robots.txt`, canonical-only `sitemap.xml`, and crawlable `favicon.svg`. No invented `lastmod` dates, priority values or keyword meta tags.
- The deployment explicitly includes these assets; research and tests remain outside the published site.
- Embedded PNGs reduced in size while preserving every crest key and source attribution. Maximum dimensions are 128 × 128. Palette reduction is visually lossy, so every before/after pair was reviewed; an alpha-channel guard preserves fully transparent pixels. The game remains a portable offline HTML file.
- A temporary, labelled loading area reserves the game viewport until the first round is laid out. It does not add permanent empty space or conceal the explanatory content. With JavaScript disabled the explanation and a noscript message remain available.

## Performance evidence and caveats

Baseline live Lighthouse mobile run on 13 September 2026 (`test-results/seo-before.json`): performance **31**, accessibility **100**, best practices **100**, SEO **100**. Simulated FCP/LCP **16.8 seconds**, CLS **0.494**. This is a lab sample, not field Core Web Vitals and not a ranking metric. The initial SEO score already passed the basic checklist; the work goes beyond that checklist.

Original embedded PNG payload: **3,060,219 bytes**. Optimized PNG payload: **743,566 bytes**. All 156 keys and metadata are retained. Reproduce optimization from the original revision rather than requantizing an already optimized file:

```sh
uv run --with pillow python research/optimize-crests.py --source-ref f59fe51
```

Local checks eliminated the measured startup layout shift. Production performance must be measured separately after deployment: the local Python server does not use GitHub's transfer compression. Audits are affected by hardware, network and randomly selected careers; compare more than one run before drawing fine-grained conclusions.

## Verification

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py --suite seo-checks.js --suite brand-checks.js --suite offline-checks.js --suite origin-checks.js --suite saved-rivals-checks.js
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
