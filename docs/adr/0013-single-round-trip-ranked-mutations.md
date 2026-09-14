# 13. One round trip per ranked mutation, not two

Status: Accepted — implemented 2026-09-15.

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
