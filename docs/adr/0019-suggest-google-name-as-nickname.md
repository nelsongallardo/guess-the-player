# 19. Suggest the player's Google name as an editable nickname default

Status: Accepted — implemented 2026-09-15. Amends [ADR 0007](0007-automatic-animal-aliases.md).

## Context

ADR 0007 deliberately made public leaderboard names independent of Google identity: every account gets a random animal alias automatically, and the account dialog's copy explicitly promised "we never publish your Google name or photo." That was the right default for a game nobody had to trust with their identity, but the owner reported the actual result was confusing for the audience they cared about — friends comparing scores see opponents as "Heron-4a76fa2a" instead of a name they recognize, and have to know the nickname field exists and manually type their own name to fix it.

The owner asked for two things: make Google's consent screen show `derabona.club` instead of the raw Supabase project domain (out of scope here — it needs Supabase's paid Custom Domains feature, DNS access and Google Cloud Console changes the agent doesn't have login for; the owner chose to leave it for later), and make Google "ask for the name" so it can be used on the leaderboard.

On the second point: Google already returns basic profile info (name, picture) as part of any standard sign-in: nothing was actually being withheld by Google, and the app already received it. What ADR 0007 chose not to do was *use* it publicly. The owner's request is a genuine policy change, not a technical gap - so it's implemented as a policy amendment, not a bug fix.

## Decision

- `Accounts.login()` now explicitly requests `scopes:'email profile'` from Google, rather than relying on whatever the Supabase project's default happened to be — makes the profile-info request explicit and deliberate, matching what the owner asked for by name.
- On a fresh sign-in, the client captures `session.user.user_metadata.full_name` (falling back to `name`, then `given_name`), trimmed and capped at 24 characters, as a **suggestion only** — never sent to the server as-is, never applied automatically to an existing custom nickname.
- The suggestion is written into the (already-existing, already-optional) nickname `<input>`'s **value**, once per fresh sign-in, only when: the account is signed in, a suggestion exists, the account's current nickname still matches the auto-generated `Animal-xxxxxxxx` pattern (a returning player who already chose their own nickname never has it silently replaced), the field isn't currently focused (don't fight a player already typing), and the field is currently empty (don't clobber something already there). The player still has to open Account and click "Guardar apodo"/"Save nickname" — exactly the same explicit, one-click-away action ADR 0007 already required for any custom nickname — for the suggestion to become their public name. Clearing or editing the field before saving works exactly as it always did.
- `index.html` and `leaderboard.html` both implement this identically (mirrored `googleNameSuggestion`/`nicknameSuggestionApplied` state and the same regex-gated pre-fill condition), matching the existing account-dialog component parity from ADR 0014 - `leaderboard.html` never calls `signInWithOAuth` itself (the handshake still only completes on `index.html`), but it reads the same persisted session's `user_metadata` once signed in, so the suggestion appears there too.
- Account-dialog copy (`nicknameDetail`, `aliasTooltip`, both languages, both pages) is rewritten to describe the suggestion truthfully instead of promising Google name is "never published." The photo/email promise is unchanged and still holds - only the name changed status, and only as an opt-in suggestion.
- Unchanged: PostHog analytics still never receives account IDs, nicknames, Google names/photos or emails (`docs/analytics.md`'s constraint is about analytics specifically, not the leaderboard, and nothing about this change touches analytics event payloads). The server-side `enroll` action, its validation and uniqueness handling are unchanged - it has never known or cared whether a submitted nickname originated from a suggestion or was typed from scratch, so no migration or Edge Function change was needed.

## Consequences

- A player who wants their real name on the leaderboard now needs zero typing - sign in, see the name already in the field, click save. A player who prefers the animal alias, or a different custom name, still gets exactly that: the suggestion is inert until explicitly saved, and never overwrites an existing custom nickname on a returning account.
- The Google-domain-on-consent-screen request is explicitly not addressed by this change and remains open, pending the owner's decision on Supabase's paid Custom Domains feature.
