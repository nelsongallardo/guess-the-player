# 13. One round trip per ranked mutation, not two

Status: Accepted — implemented 2026-09-15. Amended the same day: even a single round trip still measures 0.6-1.4s against the live endpoint (see the Amendment below), which correctness verification cannot skip without moving it client-side and breaking ranked's anti-cheat premise - so a second, purely client-side fix addresses the *perceived* latency of answering specifically.

## Context

The owner reported ranked play (signed in) felt noticeably slow in a way guest/practice never did: picking an answer showed no option marked for about a second, "Pedir pista"/Get Hint took a visible beat to reveal anything, and "Siguiente jugador"/Next Player took several seconds to show the new career. Confirmed against guest/practice on the same device with the same connection: none of this was present there, since guest is entirely client-side with no network calls at all. That pointed straight at the ranked mutation path.

Every ranked mutation (`hint`, `answer`, `start`, `enroll`) went through `RankedUI.sendPending()`, which did:
1. Send the actual action (`Accounts.request(payload,...)`), `accept()` its response.
2. For `'start'` specifically, render the just-arrived career immediately (`loadingPhase='confirm'`) while keeping answer/hint controls locked.
3. **Unconditionally send a second, separate `{action:'progress'}` request** and `accept()` *that* response instead, described in-code as "read back the exact account after mutations, not just an acknowledgement."

That comment's premise doesn't hold against the actual `public.ranked_game` RPC: every branch (`hint`, `answer`, `start`, `enroll`) already returns `ranked_private.projection(uid, r.id)` (or the equivalent completed/null-round shape for `start`) — the exact same shape and the exact same authority a separate `{action:'progress'}` call would return, computed inside the same already-committed transaction. There is no read-replica lag or eventual consistency to guard against here (a single Supabase Postgres primary, `perform ... for update` serializing each account's own requests). The second call was doubling the network latency of every single ranked interaction to reconfirm something the first response had already said.

This directly explains the reported symptoms: an answer/hint's own response already reflects the guess/hint, but the UI didn't trust it until the *second* round trip resolved, so it visibly sat "unmarked" for a beat; `'start'` was worse, deliberately showing a two-stage "Preparando el desafío… / Confirmando el desafío…" sequence (documented in AGENTS.md's loading-feedback invariant) that cost a second full round trip on top of the first.

## Decision

`sendPending()` now `accept()`s the mutation's own response directly and stops - no follow-up `{action:'progress'}` call, for any action. The `'start'`-specific two-stage loading state (`loadingPhase`, the `confirming` render flag, the `.loading-compact` CSS class, and the `data.completed && ...` merge-with-`verified` logic that only ever mattered for that second call) is removed entirely rather than left dead: the loading card now shows "Preparando el desafío…"/"Preparing your challenge…" until the single request resolves, then unlocks directly.

This overturns AGENTS.md's previous loading-feedback wording ("keeping answer/hint controls locked until the existing confirming progress read completes... compact the confirmation status") - that described the now-removed second stage, not a requirement being preserved here.

## Consequences

- Every ranked interaction (hint, answer, start, enroll) is now roughly half the network latency it was, with no client-visible behavior lost: the response already used for the *first* accept was strictly equivalent to the discarded second one under normal single-primary-database operation.
- No test depended on the removed second call specifically (`tests/accounts-checks.js`'s only use of a deferred/held `{action:'progress'}` response, `holdProgress`, covers the *initial* sign-in `sync()` progress read on boot, a separate code path this ADR does not touch).
- If a future change introduces genuine eventual consistency (a read replica, a queue-based side effect after the mutation commits), this ADR's premise - that the mutation's own response is already fully authoritative - would need re-examining before removing round trips again elsewhere.
- Guest/practice is unaffected; it was never on this network path.

## Amendment: an instant local "checking" highlight for the tapped option

Even with one round trip instead of two, the owner still felt a tap on an answer "look deselected" for about a second before it registered. Measured directly against the live production endpoint (`curl` against `ranked-game`'s own `leaderboard` action, no client involved): 0.6-1.4s per call, real network/Supabase-Edge-Function latency, not a client-side inefficiency and not something a caching layer would help with (`PLAYERS`/crests were already fully embedded client-side; only the round's live state - which player, whether a guess is right - is server-authoritative, deliberately, so it can't be pre-fetched or verified locally without exposing the correct answer to the client before the player picks).

The actual bug was purely visual: `renderRanked()`'s options loop re-rendered the instant a tap fired mutate('answer', ...), but `cloud.round.guesses` doesn't change until the response arrives, so at that moment every option - the one just tapped included - looked identically plain-disabled. There was no way to tell which one had been picked until the round trip resolved, reading as "my tap did nothing."

Fixed by highlighting the tapped option immediately from already-known local state - `pending.optionId`, set synchronously the instant `mutate()` runs, well before any network activity - with a distinct `.option.awaiting` style (a soft celeste pulse, reduced-motion aware) and an updated aria-label ("…, checking"/"…, revisando"). This reveals nothing about correctness (that still only arrives with the server response) - it only shows "yes, this is the one you picked, hang on," turning a mystery-looking pause into a legible one. No change to the mutation/network path.
