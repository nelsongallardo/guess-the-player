# Derabona SEO and attribution improvements

Approved scope: the 2026-10-26 live audit and the owner's “proceed with everything.” Preserve offline single-file play, existing careers and frozen Daily schedule, accounts/scoring, consent-first anonymous analytics and sanitized URLs. No automatic tracking, full referrers, account linkage or fabricated historical sources. Implementation proceeds without another approval gate.

## Task 1: Loading and narrow-screen layout

Own index.html CSS/initial loading and embedded data representation, relevant SEO/loading/browser tests and docs/seo.md. Reproduce the 320px Spanish masthead overflow and startup CLS before fixing. Reduce initial payload without changing roster, schedules, crest identity/attribution, rendered pixels (prefer lossless optimization), or script IDs consumed by tests. Paint the loading status before bulk data work and reserve appropriate initial space without a permanent blank panel. Verify offline, saved state, mobile/desktop layout, model/SEO tests and paired mobile Lighthouse measurements. Use an isolated branch and return commits.

## Task 2: Complete consented measurement

Own inline analytics and gameplay instrumentation in index.html; add parity analytics on leaderboard.html and update privacy.html/docs/analytics.md. Keep one consented pageview per actual document, safe pathname/view categories only, no invite tokens or OAuth data. Add explicit mode/access context. Record Daily and ranked accepted answer/hint/completion transitions exactly once; do not capture historical completions on render/reload or failed/uncertain mutations. Integrate consent UI and withdrawal on Groups/Leaderboard; privacy signals/offline/noncanonical origins remain silent. Capture only supported campaign fields. Tests first for shared-page sanitization and transition behavior; extend real-SDK browser coverage. Verify Node 22, relevant account/daily/browser/privacy suites and marked backend ingestion.

## Task 3: PostHog reports and acquisition evidence

Read and back up current project 273163 insights; update existing Top referrers to a session-entry campaign/external-referrer report with Unknown and separate internal/auth exclusions. Preserve a historical event-source report for data captured before the standard field existed. Correct the disabled-autocapture funnel and exclude verification events consistently. Use explicit known mode labels/limitations rather than pretending historic gameplay covers every mode. Read back saved queries/results. Check Search Console using available authorized access; if login is needed request it while other work continues. Review campaign tagging in owned link generators and correct gaps without publishing messages.

## Review focus

- Analytics denied, DNT/GPC, offline, blocked SDK and withdrawal must never break play or leak requests.
- OAuth/invite/full referrer URLs and account identifiers never reach PostHog.
- Retries and re-rendered terminal rounds must not duplicate events.
- Daily schedule, player IDs, save fixtures and crest pixels remain unchanged by optimization.
- New leaderboard pageviews must preserve privacy and work across language/view switches.

## Integration and release

Review isolated commits, run relevant suites plus full Node/native PostgreSQL and Edge CI gates, real browser checks, fresh production baseline/candidate performance comparison. Publish a reviewed PR; integrate/deploy authorized work after checks, verify exact live artifact and marked ingestion. Record changes, limitations and external write readbacks in Obsidian state.md; commit/push that path and verify remote. Do not publish the primary checkout's unrelated four commits.
