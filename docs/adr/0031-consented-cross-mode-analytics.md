# ADR 0031: Consent-based page and gameplay coverage

Date: 2026-10-26. Status: accepted following the owner's approval of the SEO/attribution audit recommendations.

## Context

The standard referring-domain fix is already live. Remaining report gaps come from missing browser referrers, UTM-only arrivals, internal/auth returns and template reports expecting disabled autocapture. The board page sends no pageviews, and Daily/ranked actions bypass the existing guest Unlimited event calls. Loading a page was also incorrectly described as viewing an Unlimited round when Daily was selected.

## Decision

Keep the existing consent-first anonymous PostHog EU project and exact privacy gates. Reuse the inline analytics module and accessible bilingual consent controls on Play and the board page. Only two canonical pathname values and three page categories are sent; private group identifiers and URL queries/fragments remain excluded. Snapshot the three disclosed campaign tags in memory before OAuth/invite sanitization; consent is still required before SDK loading, persistence or transport.

Explicit `mode` and `access` enums describe Daily/Unlimited and guest/ranked/practice without account identity. Observe the displayed round, and record Daily/ranked action deltas only from successful mutation responses. Do not record historical completions from reads, render paths or reloads. Failed/uncertain actions stay unrecorded until their same-key retry confirms them; duplicate responses cannot create duplicate completions. Server scoring/idempotency and all game mutations remain unchanged.

Use session-entry campaign tags then external hostname for acquisition reports, label missing sources Unknown, exclude internal/auth entries and whole verification sessions. Preserve historical custom-referrer event reporting with honest event/session units. Replace the disabled-autocapture funnel with explicit game actions and label historical coverage gaps.

## Consequences and verification

Only consenting browsers are measured; blockers and omitted referrers still limit attribution. Historical Daily/ranked events and missing sources cannot be reconstructed. The standalone board gains a small inline consent module, not the game roster. No account IDs, round IDs, league IDs, nicknames, full referrers or person profiles are sent.

Node privacy tests cover category/path sanitization, consent/privacy suppression and action deduplication. The browser coverage suite exercises real UI transitions and the real SDK with intercepted ingestion, including lost-response retries, reloads and board withdrawal; account API is explicitly simulated. Real backend ingestion requires separately marked live events and readback, with verification sessions excluded from reports.
