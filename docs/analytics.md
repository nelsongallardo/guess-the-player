# Consent-first PostHog analytics

## Account and scope

- PostHog EU project: **derabona**, ID **273163**.
- [Gameplay dashboard](https://eu.posthog.com/project/273163/dashboard/949592): consented daily visitors, gameplay activity and round outcomes.
- The public `phc_` project ingestion token is embedded in the `analytics` script. It is intended for browser exposure. **Never embed a personal API key, CLI credentials or another project's token.**
- Admin work uses the installed `posthog` CLI (`phog-cli`), with `POSTHOG_PROJECT_ID=273163` per command; do not change the global active project. This is distinct from the official `posthog-cli` binary. If its convenience command is stale, use the documented API through `posthog api`; preserve and read back existing resources.

## Consent and privacy contract

The owner selected **consent-first analytics with persistent anonymous identity**, not cookieless automatic collection.

- Before explicit permission, there is **no PostHog SDK download, config request or event request**. No prior gameplay is buffered for later upload. Allow and decline are equally accessible; the banner is non-modal and does not prevent playing.
- `derabona.analytics-consent.v1` stores only `accepted`/`declined`. `Privacy and analytics` / `Privacidad y analítica` below the game opens a bilingual explanation and allows changing the choice.
- After acceptance, the async SDK uses EU ingestion (`https://eu.i.posthog.com`) and localStorage identity. An accepted anonymous ID survives reload for returning-visitor analysis; clearing browser storage loses that link.
- Declining or withdrawing stops future capture, drops this integration's pending events and clears SDK persistence. Withdrawal does not delete events already sent or recall in-flight requests. Gameplay saves are never cleared by privacy controls. Cross-tab changes also apply.
- File URLs, localhost/noncanonical hosts, an offline network status, Global Privacy Control and Do Not Track suppress collection. SDK/network/storage failures must not affect answers or progress.
- Autocapture, pageleave capture, recordings, surveys, heatmaps, automatic exceptions, performance capture and feature-flag evaluation are disabled. Only explicit events below are allowed. Person profiles are never created.
- Project-side IP anonymization is enabled. SDK `ip:false` and `$geoip_disable:true` further suppress IP/geolocation event enrichment. PostHog still necessarily receives a network request after consent; do not describe this as collecting no personal data or as a blanket legal-compliance guarantee.
- Event filtering preserves the SDK-required public `token` property; deleting it makes the SDK drop events after `before_send`, even when hooks appear to fire. Tests must assert actual transport and backend ingestion, not only entry into the hook.
- Event filtering strips full referrer URLs, query strings, fragments, free text and automatic person-property payloads. The current URL is always one of `https://derabona.club/` or `https://derabona.club/leaderboard.html`, with no query or fragment; only the HTTP(S) referrer hostname is retained, as both the existing `referrer_host` event property and PostHog's standard `$referring_domain`. Both are derived from the current document, overriding any SDK-persisted source. Empty, malformed and non-HTTP(S) referrers produce empty values. SDK anonymous/session IDs and basic browser/device properties are retained after consent.
- One narrow, disclosed exception to the stripped query string: `utm_source`/`utm_medium`/`utm_campaign`, if present, are read once into memory by `campaign-entry` before OAuth/invite URL scrubbing (before any `history.replaceState` call can remove them) and attached to every event for that document, so a specific social post/campaign can be attributed in PostHog. Nothing else from the query string is retained, and PostHog's own automatic UTM-to-person-property capture stays off either way (`person_profiles:'never'`, `autocapture:false`) - these three values travel only as regular, allowlisted event properties, the same as `language` or `competition`. The consent dialog (both languages) discloses this explicitly rather than claiming zero URL parameters are ever sent.

## Accounts remain separate

Google/Supabase requests provide optional account functionality and do not require or grant analytics permission. Public leaderboard participation now uses an automatically assigned animal alias; optional nickname changes do not change analytics consent. Never send account IDs, nicknames, Google names/photos, email addresses, bearer tokens, authorization codes or saved account state to PostHog; no account `identify` or `alias` calls. Ranked-mode events supply only the displayed public player ID, mode, accepted action counts and round result/points, never account progress, identity or private round IDs. The callback scrubber runs before analytics and removes OAuth callback query/fragment values while retaining supported language selection. Analytics anonymous identity is not linked to the Google account. See [account contract](leaderboards.md) and the [bilingual public privacy page](../privacy.html).

## Event contract

- `$pageview`: one consented page view per document on Play, Groups or Leaderboard, labelled with a bounded `page` category.
- `round_viewed`: the actual displayed round at consent activation and subsequent round transitions. No invented game round on Groups/Leaderboard; no completion event from loading a resumed terminal round.
- `answer_submitted`: accepted answer action, including `correct`.
- `hint_used`: an actual newly revealed hint.
- `round_completed`: transition from playing to won/lost, not a render/reload.
- `competition_selected`: successful switch to another playable deck.
- `competition_completed`: advancing beyond the final round.
- `language_changed`, `help_opened`, `progress_reset`: explicit UI actions.

Allowlisted context: language, competition, public player ID, round index, guess/hint counts, outcome and round points; `mode` is `daily`/`unlimited`, `access` is `guest`/`ranked`/`practice`, and `page` is `play`/`groups`/`leaderboard`. All three categories reject arbitrary values. Daily guest and both ranked modes record only accepted action transitions. An uncertain mutation emits no success event; a confirmed same-key retry emits once. Rendering, reads and reloads never mint completion events. An internal in-memory round key handles deduplication but is never transmitted. No answer text, user-entered values, full saved-game objects, user name or email is collected. The charts describe **consenting visitors**, not all visitors. Consent bias and ad blockers mean these counts are not a complete traffic census.

## Referral and campaign reports

PostHog's Web Analytics referring-domain and channel reports use the standard `$referring_domain` event property to derive session attribution. Before the 2026-10-14 fix, our filter dropped that property while retaining `referrer_host`, so those built-in reports could not use the recorded hostname. For earlier data, use a `$pageview` Trends insight broken down by the **event** property `referrer_host`; `utm_source`/`utm_medium`/`utm_campaign` are also available on tagged arrivals. The fix affects newly captured events, not historical rows or the entry source of an already-started session.

An absent referrer is unknown: it can be a direct visit, a browser/app that omits the referrer, or a redirect that loses it. Missing historical sources cannot be reconstructed. Use the three supported UTM fields on links you publish to distinguish campaigns when the browser provides no referrer. Internal `derabona.club` navigation and `accounts.google.*` sign-in returns are not acquisition sources; exclude them when interpreting the raw event breakdown. No new attribution cookies, account linkage, full referrer URL capture or IP enrichment are introduced.

## Verification and delivery

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py --suite analytics-checks.js --suite analytics-coverage-checks.js --suite seo-checks.js --suite brand-checks.js --suite offline-checks.js --suite origin-checks.js --suite saved-rivals-checks.js
POSTHOG_PROJECT_ID=273163 posthog dashboard get 949592
```

The model/privacy tests use an explicitly mocked SDK. Browser regression tests download the real SDK but intercept ingestion; these tests establish behavior, **not** real backend ingestion. Live verification must send uniquely marked test events and query them back from project 273163. Dashboard queries exclude the `verification_run` marker.

PostHog's bot filter blocks automated browsers, including `navigator.webdriver` and HeadlessChrome, even when the SDK loads and identity storage works. In test contexts only, use the documented `opt_out_useragent_filter:true` override, attach a verification marker after the production event filter, and read back the events. Never disable production bot filtering just to make tests pass. See [PostHog troubleshooting](https://posthog.com/docs/product-analytics/troubleshooting).

The same analytics module and consent controls stay inline in `index.html` and `leaderboard.html`; the shared account/analytics explanation also lives in deployed `privacy.html`. The Pages workflow validates all pushes, pull requests and manual runs; only validated non-PR runs on `main` deploy the static package. Supabase deployment is separate. The CDN SDK is an optional, after-consent dependency only; the portable game remains usable entirely offline. Recheck no-consent mobile performance and the actual deployed version after changes.

Official references: [data collection](https://posthog.com/docs/privacy/data-collection), [JS configuration](https://posthog.com/docs/libraries/js/config), [projects API](https://posthog.com/docs/api/projects), [insights API](https://posthog.com/docs/api/insights).

## Reports updated 2026-10-26

Both [Starter](https://eu.posthog.com/project/273163/dashboard/949581) and Gameplay retain their existing layouts and exclude marked verification activity.

- [Acquisition](https://eu.posthog.com/project/273163/insights/MUP57PLQ): rolling seven-day consented pageview sessions, session-entry UTM source first, external domain second, explicit Unknown otherwise. Entire sessions containing verification markers and untagged internal/auth entries are excluded.
- [Reconciliation](https://eu.posthog.com/project/273163/insights/20l6t7uf): total sessions and each exclusion, so omitted internal traffic is visible rather than relabelled direct.
- [Historical referrals](https://eu.posthog.com/project/273163/insights/XH9QejeO): 90-day pageview **events** using `referrer_host`, including data from before standard source capture existed. These are not acquisition-session counts.
- [Interaction funnel](https://eu.posthog.com/project/273163/insights/vLwg4MdK): pageview → accepted answer → completed round. The disabled `$autocapture` event is no longer used. Its identity-based conversion window can span sessions/rounds; it is not a per-round conversion rate.
- [Mode/access coverage](https://eu.posthog.com/project/273163/insights/Is4CYp9d): new explicit categories with missing historical properties labelled Unknown (legacy). Before this release answer/completion charts measured guest/practice Unlimited only; past Daily/ranked activity cannot be backfilled.

### Campaign links

Use lowercase non-personal labels, each at most 64 characters: `utm_source` for the publisher, `utm_medium` for the channel, `utm_campaign` for the public post/initiative. Examples: `https://derabona.club/?utm_source=x&utm_medium=social&utm_campaign=daily_40`, `https://derabona.club/?utm_source=instagram&utm_medium=social&utm_campaign=bio`, and `https://derabona.club/?utm_source=reddit&utm_medium=social&utm_campaign=club_quiz`. Do not put emails, account names, invite IDs or other private values in these fields. Only tag links you own; never fabricate missing historical sources.

The repository's X Daily clickable-link generator now adds `x`/`social`/`daily_<challengeNumber>`; bare-domain/no-link posts remain unchanged. This source change does not modify approved queues, publish posts, or activate a different installed automation release. EmailOctopus-tagged arrivals were already visible in the audit. Plain spoken/video-overlay domains cannot carry reliable campaign attribution: use a tagged clickable bio/description link where the platform permits one.
