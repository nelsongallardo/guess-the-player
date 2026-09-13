# ADR 0007 — Automatic animal aliases and leaderboard participation

- Status: Accepted.
- Date: 2026-09-13.
- Supersedes the manual nickname enrollment requirement in ADR 0006. Scoring, first-result eligibility, membership filtering and account/analytics separation are unchanged.

## Context

A signed-in player completed two ranked rounds but saw an empty leaderboard because the original design required a separate nickname and public-enrollment step. The owner explicitly removed that requirement: assign a random animal by default and explain optional custom naming with a tooltip.

## Decision

- Assign each account a stable, unique random-animal alias server-side, independent of Google name, email or account ID. Include a random suffix to distinguish repeated animal names and enforce case-insensitive uniqueness.
- Automatically enable leaderboard participation. An account appears only after a verified result in the board's scope; unfinished rounds still do not qualify.
- Backfill existing unnamed accounts and enable their saved results to appear. Preserve existing custom nicknames, results, active rounds and idempotency receipts.
- Keep custom nickname changes optional through Account. Remove the enrollment checkbox and publish gate; retain the existing `enroll` API action as a backwards-compatible rename operation.
- Display an accessible bilingual tooltip usable with pointer, keyboard and touch, explaining that the generated alias can be changed in Account.
- Explain automatic public aliases in login/account copy and the privacy page. Do not use Google identity in public projections or PostHog; analytics consent remains independent.

## Verification

Test the additive migration on legacy account fixtures, new/concurrent account creation, stable aliases, collision handling, custom-name preservation, optional renaming and automatic ranking after a verified result. Exercise tooltip accessibility and EN/ES/mobile account flows in the actual browser. Verify the hosted migration and exact existing-account/leaderboard readback without changing scores.
