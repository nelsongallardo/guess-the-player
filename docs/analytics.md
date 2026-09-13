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
- Event filtering strips full referrer URLs, query strings, fragments, free text and automatic person-property payloads. The current URL is always `https://derabona.club/`; only the referrer hostname is retained. SDK anonymous/session IDs and basic browser/device properties are retained after consent.

## Accounts remain separate

Google/Supabase requests provide optional account functionality and do not require or grant analytics permission. Public nickname enrollment is separate consent again. Never send account IDs, nicknames, Google names/photos, email addresses, bearer tokens, authorization codes or saved account state to PostHog; no account `identify` or `alias` calls. Ranked-mode analytics context supplies only language, not cloud progress. The callback scrubber runs before analytics and removes OAuth callback query/fragment values while retaining supported language selection. Analytics anonymous identity is not linked to the Google account. See [account contract](leaderboards.md) and the [bilingual public privacy page](../privacy.html).

## Event contract

- `$pageview`: one consented page view per document.
- `round_viewed`: current round at consent activation and subsequent new-round/competition transitions. Viewing a resumed completed round is not another completion.
- `answer_submitted`: accepted answer action, including `correct`.
- `hint_used`: an actual newly revealed hint.
- `round_completed`: transition from playing to won/lost, not a render/reload.
- `competition_selected`: successful switch to another playable deck.
- `competition_completed`: advancing beyond the final round.
- `language_changed`, `help_opened`, `progress_reset`: explicit UI actions.

Allowlisted context: language, competition, public player ID, round index, guess/hint counts, outcome and round points. No answer text, user-entered values, full saved-game objects, user name or email is collected. The charts describe **consenting visitors**, not all visitors. Consent bias and ad blockers mean these counts are not a complete traffic census.

## Verification and delivery

```sh
node --test tests/model.test.mjs tests/social-preview.test.mjs tests/seo.test.mjs tests/analytics.test.mjs
python3 tests/source-check.py
python3 tests/run-browser.py --suite analytics-checks.js --suite seo-checks.js --suite brand-checks.js --suite offline-checks.js --suite origin-checks.js --suite saved-rivals-checks.js
POSTHOG_PROJECT_ID=273163 posthog dashboard get 949592
```

The model/privacy tests use an explicitly mocked SDK. Browser regression tests download the real SDK but intercept ingestion; these tests establish behavior, **not** real backend ingestion. Live verification must send uniquely marked test events and query them back from project 273163. Dashboard queries exclude the `verification_run` marker.

PostHog's bot filter blocks automated browsers, including `navigator.webdriver` and HeadlessChrome, even when the SDK loads and identity storage works. In test contexts only, use the documented `opt_out_useragent_filter:true` override, attach a verification marker after the production event filter, and read back the events. Never disable production bot filtering just to make tests pass. See [PostHog troubleshooting](https://posthog.com/docs/product-analytics/troubleshooting).

The analytics integration stays inline in `index.html`; the shared account/analytics explanation also lives in deployed `privacy.html`. The Pages workflow validates all pushes, pull requests and manual runs; only validated non-PR runs on `main` deploy the static package. Supabase deployment is separate. The CDN SDK is an optional, after-consent dependency only; the portable game remains usable entirely offline. Recheck no-consent mobile performance and the actual deployed version after changes.

Official references: [data collection](https://posthog.com/docs/privacy/data-collection), [JS configuration](https://posthog.com/docs/libraries/js/config), [projects API](https://posthog.com/docs/api/projects), [insights API](https://posthog.com/docs/api/insights).
