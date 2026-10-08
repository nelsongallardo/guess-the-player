# Private Daily leagues

Date: 2026-10-08
Status: Draft for owner review; not implemented

## Intent and confirmed choices

Friends should be able to create a persistent league, share an invitation and return each day to compare their football knowledge. Success means joining is simple, one ordinary Daily attempt serves every joined league, and members can see today's contest and a fresh weekly contest.

Nelson confirmed:

- Ongoing friends leagues, using the normal Daily challenge.
- One signed-in Daily attempt counts across all joined leagues; no league-specific puzzles or extra attempts.
- Two standings periods: Today and This week.
- Anyone with an invite link can join after signing in. The owner can remove members and replace the invite link.

Everything below specifies proposed defaults for review, including membership eligibility, UTC boundaries, limits and deletion behavior. These defaults are not additional recorded owner decisions until this spec is accepted.

## Player experience

Add Public / Friends views inside `leaderboard.html`, preserving the existing Play / Leaderboard navigation and shared masthead. Friends lists the signed-in user's leagues and offers Create league. A league opens directly with its name, Today / This week controls, standings, a Play Daily action and membership controls. Today is the initial period; URL state preserves an explicitly selected period.

Creating a league asks only for its name. The creator becomes its owner and first member, then sees Copy invite link. An invited visitor signs in, sees the league name and an explicit Join league button, and joins without owner approval. Opening a link alone never changes membership. Existing members open their league without another join mutation.

Members see nickname, shared rank, points and progress. Today distinguishes Not played, In progress (for example 1/3 completed), and Finished (3/3). Weekly rows show points and completed days. A scored loss at zero points remains distinguishable from not playing. No answers, selected options, hints, email addresses or Google profile data are exposed.

The owner can rename the league, copy or replace its invitation, remove a member, restore a removed member's eligibility to join, and delete the league. A removal blocks rejoining with the old or current invite until the owner restores eligibility. Restoration does not silently rejoin someone: they must use an invitation and choose Join again. Members can leave. The owner must delete the league instead of leaving; ownership transfer is outside this version.

Removing a member, leaving, replacing an invite and deleting a league have confirmations explaining their effects. Replacing an invite invalidates the previous link immediately; existing memberships remain active. All active members may share a link they already have, but only the owner can retrieve or replace it through management controls.

## Scoring and periods

Leagues read existing server-verified `ranked_private.daily_results`; they never write or copy scores. Unlimited, guest and practice results do not count. League operations neither award additional global points nor change Daily attempts, streaks, clocks or scoring.

- Today is the current UTC date. This week is Monday 00:00 UTC through the current UTC date, inclusive. Show the date range and explain the reset timezone in both languages.
- Sum resolved Daily rounds as they finish, including partial days. A complete three-round Daily can contribute up to 300 points; an entire seven-day week up to 2,100. Missed rounds/days add zero; there are no makeups or best-day adjustments.
- Use the result's challenge `date`, not its completion timestamp, to choose the period. The server selects the current date and week; the client submits only Today or This week.
- Equal point totals share SQL `rank()` positions (1, 1, 3). Completed days, speed and nickname never break ties. Stable nickname/member ordering only stabilizes display.
- Rank members with at least one terminal result in the period. Show members without results below them with no rank and a Not played state. A partial day is visible immediately; completion requires all three results.
- A new member is eligible from the UTC date of joining. Their existing signed-in result from that date counts, even if they played before accepting the invitation. Earlier dates never count. Explain this before Join.
- Leaving hides the member and their row immediately. Voluntary rejoining retains the original eligibility date and includes their Daily results since then, including days away; leaving cannot reset eligibility or create extra points. Owner removal works similarly after explicit restoration and rejoining.
- Changing periods, opening a league or accepting an invite must not create or restart any gameplay round.

Weekly reset is a query boundary, not a scheduled deletion or a new group. Historical results remain intact. Weekly history, winner badges, notifications and all-time standings are outside this version.

## Membership, privacy and limits

Google sign-in and the existing account nickname flow are required to create or join. Guests retain ordinary offline play. A user can belong to several leagues, and the same Daily result contributes independently to each eligible league.

Proposed initial limits: 10 active leagues per account (owned and joined together), 50 active members per league including the owner, and 3–40 Unicode characters in a trimmed league name. Reject control characters and render names as text, never HTML. Names need not be globally unique. Enforce limits transactionally on the server, including concurrent joins and creates. Restoring join eligibility alone consumes no membership slot.

Only current members can read a league's standings and member list. An authenticated holder of a valid invitation may read just the league name, member count and eligibility explanation before joining. There is no public directory. Invalid, revoked and unavailable invitations get the same generic unavailable response. Removed users cannot preview/join a league via an invitation until restored.

Private means the group, membership and group standings are restricted. Existing Daily contributions to public rankings remain governed by the current public account contract; joining a private league does not make those pre-existing public rankings private. Explain this in league help/privacy copy.

Account deletion removes that user's memberships. If they own leagues, deletion also deletes those leagues and all associated memberships/invitations; the Account deletion confirmation on both pages must explicitly explain this consequence. Deleting a league never deletes anyone's Daily results or account. There is no automatic ownership transfer.

## Frontend, invitations and authentication

Keep the portable guest runtime self-contained. Implement Friends and league management in named inline sections of `leaderboard.html`, with minimal changes to `index.html` for an authentication return flow. Do not introduce a frontend framework or a separate static asset build.

Use a URL fragment for the opaque invite token, for example `leaderboard.html#join=<token>`, with language in the ordinary query string. Capture the token before SDK initialization, remove it from visible history with `replaceState`, and retain the pending invitation in per-tab session storage. Never put invitation tokens into analytics, referrers, console output or error reports. League UUIDs may appear in authenticated board URLs; they are identifiers, not read credentials.

An unsigned visitor reaches an authentication-only route on `index.html`, where the existing Google PKCE callback and mandatory nickname enrollment can complete before returning to Friends. Only allow the known same-origin Friends destination; never accept an arbitrary return URL. No invitation token goes into the OAuth redirect URI. The pending invitation stays in the same tab through OAuth and is cleared on successful join, explicit cancellation or terminal invalidation.

The authentication-only route must suppress guest, ranked and Daily gameplay initialization throughout sign-in, callback handling and nickname enrollment. In particular, do not call `start` or `dailyProgress`. The current Daily progress action creates timed rows, so it is not a harmless read suitable for a league screen. Ordinary Play navigation continues to initialize gameplay normally.

If storage is denied, keep invitation state in memory while possible. After a full OAuth navigation loses it, show an explicit invitation-recovery message asking the user to reopen their original link; never pretend they joined or place the token in a query-string fallback.

League reads refresh on entry, period selection, returning focus after gameplay, and an explicit Refresh action. No realtime subscription or continuous polling in this version. Loading and retry states are bilingual, keyboard accessible and reduced-motion aware. Clear private DOM/state immediately on sign-out or identity changes; bind every response to its initiating account and selected league/period.

## Backend boundaries and persistence

Add a dedicated `private-leagues` Edge Function and service-only `public.private_leagues(uuid,jsonb)` RPC. Reuse the existing verified-identity and HTTP boundary conventions without appending league management to the large gameplay dispatcher. Share only the narrowly reusable request/auth/error helpers; preserve the established ranked endpoint's behavior and tests.

Add forward migrations with new tables under `ranked_private`:

| Table | Purpose |
| --- | --- |
| `friend_leagues` | UUID, owner account, name, creation timestamp, management version |
| `friend_league_members` | League/account pair, opaque member ID, first joined timestamp/eligible UTC date, active/left/removed state, state-change timestamp |
| `friend_league_invites` | One current invitation per league, cryptographically random token, rotation timestamp |
| `friend_league_receipts` | Account/idempotency key, request digest and minimal mutation outcome |
| `friend_league_rate_limits` | Account request bucket and window timestamp |

Use foreign keys and cascades for account/league deletion. Enable RLS and revoke direct client access on all new tables. Only verified Edge identity reaches the RPC; a request cannot choose its acting account. Management targets use league-scoped opaque member IDs, never public Auth UUIDs. Keep `daily_results` immutable and add only justified query indexes.

Invitation tokens contain at least 32 random bytes encoded for URLs. Store them in the private, service-only invite table so the owner can copy the same current link across devices; return the raw value only to the verified owner through management reads/rotation. Non-owner responses never include it. Token possession permits an authenticated join, not a standings read or owner action. No tokens in routine receipts or logs.

The RPC supports list leagues, invitation preview, league standings, owner management read, create, rename, join, leave, remove member, restore join eligibility, rotate invitation and delete. Reads return no gameplay projection and write no gameplay state. Standings return the server period boundaries, league metadata, member entries and the requesting member's placement. A read-only existence check on today's `daily_rounds` can distinguish In progress with zero terminal results from Not played; expose only that status, not round contents. A bounded 50-member response avoids unnecessary pagination in the first version.

Use a dedicated league request rate bucket at 60 requests/account/minute, strict action-specific field allowlists, an 8,192-byte body limit, bounded names/tokens and `Cache-Control: no-store`. Reject client scores, clocks, dates, ownership assignments and raw account identities. Anonymous identities and missing/invalid credentials are rejected even for invitation preview.

Mutations use idempotency keys and transactional locking. Serialize account-cap checks and league-cap/management checks in a documented lock order. Owner mutations carry an expected management version; stale edits return a conflict and fresh management state must be read. Rotation and join lock the same league so a revoked token cannot win a race after rotation commits.

Keep dedicated league mutation receipts with minimal outcomes, not frozen standings, member lists or invite tokens. Recheck current access before replay and never let a removed member recover private data from an old receipt. A replay of rotation returns its stable outcome; the owner reads the current link separately. Deletion/leave replays may return an already-completed acknowledgement without private data. Reuse a pending key/body after an uncertain response; do not manufacture a fresh mutation.

## Failure behavior

- A private request failure shows a private-view error and Retry; it must never fall back to an anonymous public request for the same resource.
- A removed member, deleted league or revoked invitation clears any displayed private data and shows an appropriate unavailable state.
- Join/create cap failures return clear, translated explanations without partially creating memberships or groups.
- A network timeout on a mutation preserves its pending key and body for a retry. Board reads remain authoritative; there is no optimistic score or membership success.
- Authentication refresh must preserve same-user pending work. Switching accounts clears it; responses for the previous identity cannot render or change the new user's view.

## Verification and release

Write the smallest behavioral tests that exercise new guarantees, using the existing native PostgreSQL, Deno and browser harnesses. Required evidence:

1. Multi-account creation, joining and private reads: owner/member/outsider/removed access, invalid tokens, invite replacement and race handling, duplicate requests, caps, rollback and forbidden client identity/score fields.
2. Today/week queries: UTC midnight and Monday boundaries; partial days, zero-point losses, unplayed members, ties, join-date inclusion, no earlier backfill, leave/rejoin and deletion. One stored Daily result must appear in multiple eligible leagues without an extra global result or changed global total.
3. Read-only gameplay invariants: exact before/after rows and timestamps prove listing, previewing, joining and viewing leagues do not create or modify career/Daily rounds. Verify the entire authentication-only browser path too, not just RPC calls.
4. Browser flows in English and Spanish, short mobile viewports, keyboard/focus/live feedback, owner/member controls, browser history, token scrubbing, denied storage, OAuth cancellation/return, identity changes and network errors. Public boards, ordinary Daily/Unlimited play and offline `file:` guests retain their current contracts.
5. Fresh database replay plus upgrade from the actual prior schema, with preservation checks for existing rounds, results, accounts and receipts. Run the existing ranked PostgreSQL suite, relevant Daily/account/leaderboard/analytics/SEO suites, source identifiers, and Deno type/HTTP checks. Extend coverage only for real gaps.

Implementers must refresh upstream before starting. Update README, DESIGN, privacy text, account deletion copy, an ADR and TESTING with actual verification evidence. In particular, qualify DESIGN's current prohibition on weekly seasons as a public-board rule and document this accepted private-league exception.

Deployment requires the forward database migration and the new Edge Function separately from Pages. Deploy backward-compatible backend changes first, verify authenticated hosted boundaries with disposable test accounts, then release the frontend and verify real invitation/OAuth return flows. Local mocks do not establish hosted OAuth behavior. Do not record hosted verification before it is performed.

## Current evidence and scope boundary

This draft is based on fetched `origin/main` at `3624e05` and the existing Daily schema/RPC, account HTTP boundary, standalone leaderboard contract, and ADR 0021. The main checkout has two additional unrelated local commits; they are not incorporated or published by this design work.

This is a design artifact only. No gameplay code, migration, hosted configuration or deployment has changed. After owner review, the next artifact is an implementation plan with exact integration and verification steps.
