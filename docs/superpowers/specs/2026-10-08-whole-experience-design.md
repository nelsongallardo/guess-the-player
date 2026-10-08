# Derabona: a connected playing and friends experience

Date: 2026-10-08

Status: approved by the owner on 2026-10-08 ("go for it"). Implemented and locally verified on `ux/site-wayfinding`; see TESTING.md for verification and hosted rollout evidence. ADR 0027 records the changed navigation, masthead and explicit-start contracts.

## Product problem

Derabona currently asks people to discover features and infer their relationships. Adding a Friends leagues link exposed a destination, but did not explain that anyone can create a group, that the same Daily feeds every group, or how to move from finishing a game to comparing results. Reducing controls on one standings page did not repair those relationships.

The experience must support a continuous routine: understand what is available, choose to play, complete or resume a challenge, understand the result, compare with friends, and return tomorrow. This applies to occasional guests, daily regulars, organizers, invitees and returning members. It must work without remembering a tutorial or exploring unlabeled controls.

Success means a person can answer, on each screen: Where am I? What is my current status? What can I do here? What happens when I do it?

## Evidence and confidence

Audited revision: `d1943ff` (PR #36), in an isolated checkout. Read the current runtime, the account/league routes and ADR 0026. Inspected the signed-in production league through the existing Hermes Chrome profile without playing, creating, joining or modifying a league. Exercised the local guest experience at 375 × 667, including completion and a return visit. Local completed results were a fixture, not real player activity. No hosted OAuth journey was repeated and no target-user usability study was conducted. Findings below are observed behavior plus explicitly identified design judgments.

| Journey | Observed behavior | Consequence to address |
| --- | --- | --- |
| Arrive to play | The page immediately opens a timed puzzle. The local clock reached 0:29 without an answer while inspecting navigation. | Orientation uses scoring time. Merely checking the site can create a commitment to a round. |
| Discover friends play | Gameplay offers “Friends leagues”; explanation and creation become visible only after visiting it. | People must infer both the benefit and the ability to create their own group. |
| Finish the Daily | The summary offers Share and Keep playing. | No contextual continuation into group comparison, creation or tomorrow's routine beyond the countdown. |
| Return after finishing | Completing the local Daily then reopening the bare URL selects Unlimited. Explicit `daily=1` still opens the completed Daily. | The same entry point changes task implicitly and hides the result a returning person may want. This is verified for guests; it is not evidence of identical signed-in behavior. |
| Move between destinations | Gameplay has public/friends links; the board has a public/friends switch; league details have only a My leagues breadcrumb. | Navigation changes shape and vocabulary as the person moves. |
| Understand points | The account header shows a combined global total. Group standings show eligible post-join Daily points for a period. | A larger unlabeled account number beside a zero-point group can look like missing progress. |
| Create another group | Creation is a disclosure in the groups list; automatically open for an empty list, normally closed otherwise. | Discoverability is treated as a first-visit concern even though returning members may want another group. |
| Accept an invitation | The authenticated preview names the group and explains zero-start eligibility; signed-out visitors must authenticate before the private preview is available. | The sign-in transition needs an explicit purpose and preserved destination. Do not promise a pre-login group name the API cannot safely supply. |
| Recover from failure | Daily error copy tells people to switch modes and back to retry. | A technical workaround becomes the user's navigation task. |
| Learn rules | The rules include “Hints ... They're free,” obsolete initials wording, numbered mobile rows and an all-player-deck claim. | Help can contradict the scoring or current UI. Content needs the same coherence review as navigation. |

The applicable principles are visible choices and contextual cues ([recognition rather than recall](https://www.nngroup.com/articles/recognition-and-recall/)), and keeping secondary detail subordinate without hiding essential actions ([progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)). These support the direction; they do not prove this specific design works for Derabona's audience.

## Recommended structure

Use three stable, labeled destinations everywhere online:

| English | Spanish | Purpose |
| --- | --- | --- |
| Play | Jugar | Today's challenge, its current state and Unlimited play |
| Groups | Grupos | Create a group, see existing groups, compare with friends |
| Leaderboard | Clasificación | Public standings with explicitly labeled score scope |

Account and Help are consistent utility controls, separate from those destinations. Account has a visible label even on mobile: Sign in / Iniciar sesión when signed out, Account / Cuenta when signed in. Nickname and the explicitly labeled lifetime points live inside Account and relevant standings; remove the naked global number from the shared header. This is a proposed change to the current header contract and must be documented in the eventual implementation ADR.

Use one primary navigation row in the same order, with an active-page indication and text labels at narrow widths. Let the compact brand/utility row and navigation fit naturally; do not hide primary destinations in a hamburger or reproduce navigation as a second switch inside the page. The logo returns to Play. Use real links, stable URLs and browser Back/Forward for destinations; buttons perform actions. Groups remains active inside a group, with a local “All groups / Todos los grupos” breadcrumb.

“Group / Grupo” consistently names the private place someone creates. The explanatory copy calls it a weekly competition among friends. Do not mix group, session, room and league as navigation synonyms. The backend can retain its league names.

### Approaches considered

1. **Recommended: a compact Play overview with persistent navigation and state-aware continuations.** Gives every visit a clear starting point, makes creation visible, and separates browsing from beginning a timed attempt. Costs one explicit Start/Continue action and requires separating status reads from round creation.
2. **Keep opening the puzzle and add more contextual links.** Lower implementation cost, but preserves the timing problem and forces discovery into an already busy playing screen. It repeats the limitations of the previous two revisions.
3. **A first-visit welcome or guided tour.** Can introduce features once, but does little for return visits, invitations, completed challenges or recovery. It creates knowledge users must remember. Do not make this the organizing model.

## The experience, screen by screen

### 1. Play: a useful starting point on every visit

The Play page is a compact game overview, not a marketing landing page or an obligatory tour. Keep the existing cream, navy and celeste identity. Establish hierarchy through type, spacing and restrained sections rather than equal-weight cards for every feature.

Reading order:

1. Today's Daily: three players, shared by everyone, and the person's current state. This is the dominant section.
2. Friends: the creation benefit and action, or the person's existing groups. It is visible before entering a puzzle, not after a long FAQ.
3. Unlimited: a plainly explained alternative, with competition selection and continuation state. It is not another Daily tab.

Illustrative Spanish content for someone with no groups:

> **La diaria de hoy**  
> Adiviná los mismos 3 jugadores que todos.  
> **Empezar la diaria**  
> 3 intentos por jugador. El tiempo y las pistas afectan los puntos.
>
> **Competí con tus amigos**  
> Creá un grupo privado. Jueguen la misma diaria y sumen puntos durante la semana.  
> **Crear un grupo**
>
> **Juego sin límite**  
> Elegí una competición y seguí adivinando jugadores.  
> **Elegir competición**

For a member, the friends section becomes a short list of group names with this week's standing when available, plus a visible Create a group action. Do not require every group request to finish before Play becomes usable. Treat unavailable group data as unavailable, not an empty membership list or a zero score. Limit the overview to three groups and provide All groups for larger lists.

| Daily state | Main action and explanation |
| --- | --- |
| Not started | Start today's Daily; no clues and no scoring clock before activation |
| In progress | Continue the Daily; show completed count out of three and that the active player's clock continues while away |
| Completed | View today's result; show the total, three-player outcome and next challenge's availability |
| Account status loading | Short translated loading state; do not show guest progress as account progress |
| Unable to load | Retry; explicitly available unranked guest/practice alternative without silently changing identity or score scope |
| New UTC day | Today's new challenge; previous completion remains accessible as previous, never labeled today's |

No automatic move into Unlimited after Daily completion. An explicit Unlimited URL resolves to that mode's ready/continue state. Reload or Back must preserve the selected task and engaged round, not reroll or create a new scoring window.

Guests may play without an account. Before their first timed start, put the existing essential disclosure next to the action: guest points do not enter rankings or transfer later. Provide a nearby Sign in to compete action that preserves the intended Daily or Unlimited destination. Do not make every round or returning visit an account-choice wizard. Account completion and mandatory nickname selection finish before a new timed round begins.

### 2. During play: one task in focus

Show the active mode, understandable progress, career, remaining attempts, answer choices and the next available hint. Keep persistent navigation accessible, but remove promotional messages and repeated mode explanations from the playing area. Competition selection belongs to Unlimited's setup/context, never the shared masthead.

Name the hint and its scoring effect before use, for example “Show position · lowers points” / “Ver posición · resta puntos.” Detailed scoring examples stay in Help. A correct or missed result gives clear feedback, then one primary Next player action; after player three, Show result. Existing speed scoring, attempts, eligibility and hint order remain unchanged.

Starting or continuing does not imply pause support. Once a ranked round starts, its existing server time remains authoritative while navigating elsewhere. Navigation must never reset it. Avoid a new confirmation modal each time someone changes mode. Explain this once beside Continue and in scoring help.

### 3. Results: close the loop

Lead with what happened: players found, today's points, and local/unranked versus account scope in ordinary language. “Verified by server” is implementation detail; “Counts toward your rankings” or “Guest result — not ranked” communicates the consequence.

For members, follow the result with group comparison links labeled by group name and “This week.” Show actual authoritative standings when available. A result screen must not claim all of today's points counted in a newly joined group: eligibility is per completed player, after joining.

For people without groups, show “Compare tomorrow's Daily with your friends — Create a group.” Explain that a new group starts at zero, so a completed Daily cannot be brought into it. For a partially finished Daily, say only the players completed after joining count. Do not promise a replay.

Sharing is a secondary action with spoiler-free text and clear success/failure feedback. Keep playing names its destination: Play Unlimited. The next Daily's availability remains visible. Do not automatically launch the next mode or bury the result when the player returns.

### 4. Groups: make creation an ordinary, visible action

The Groups page always has a visible Create a group action, including when the user already belongs to groups. The empty state explains the benefit in one sentence and uses the same action. No explanatory step list repeats above every populated group list.

Creating takes one group name, then confirmation and an invitation link. A signed-out person may enter the name before sign-in; preserve the draft and the create intent through authentication, then return to the populated form for explicit submission. Do not create a group just because an OAuth callback completes.

Copy invite link and device sharing are labeled actions, with an explicit Copied state and a selectable-link fallback. Describe the consequence: anyone with the link can sign in and join. Never send a message automatically. Owners see Invite friends; member behavior follows the existing owner-only token contract. Creating additional groups remains visible on the list.

Invitation journey:

1. Explain that this link is an invitation to a private group and sign-in is needed to join. Acknowledge sign-in cancellation on the same journey with a retry action.
2. After authentication, show the actual group name, membership count, weekly competition explanation and start-at-zero rule.
3. Join is a separate explicit action. On success, open that group's standings and confirm membership.
4. If today's Daily is already complete, say the next Daily can earn points here. If partly complete, only later completed players are eligible. Neither joining nor inspecting an invitation starts a puzzle.
5. Expired/replaced/full/removed-member states have honest recovery: ask the organizer for another link where appropriate, or go to Groups. Do not silently land on public standings.

The API intentionally withholds private invitation details until authentication. Keep that boundary; a named pre-login invitation preview would be a separate privacy/backend decision, not a copy change.

### 5. Group detail: a weekly competition you can read immediately

Persistent navigation, All groups breadcrumb, group name and member count establish place. The primary content is This week's standings and its date range. A compact Today option remains available as a filter, not a destination competing with the whole page. Keep the owner's Invite friends action beside the group heading.

The table labels points as weekly Daily points. Distinguish No eligible play, In progress and a played zero-point loss; never collapse them all to zero. If current data cannot establish a particular status, show only what it supports. Highlight the person's own row with text as well as styling.

Weekly wins appear beside each nickname as a trophy plus a readable count; activation reveals which weeks were won. A small “Last week's winners” line gives immediate context when there are winners; full history remains a clearly labeled disclosure below standings. Empty history says No completed weeks yet. Ties show all winners; never imply only one trophy can be awarded.

Keep settings and detailed rules secondary. Rename, remove members, replace invite link and delete group live in Group settings with consequence-specific confirmation. Leaving is explicitly named. Former members' earned results and archived wins retain the existing contract.

Honor the owner's request to remove the Play Daily CTA from group detail. Persistent Play navigation provides the route back; do not reintroduce that button inside empty states, welcome banners or settings.

### 6. Public standings, account and help

Leaderboard is clearly titled Public leaderboard and describes its cumulative score scope. Put competition/ranking filters under that title. It has no public-versus-friends switch; Groups is already a primary destination. A person with no qualifying result sees why and a route to Play, without suggesting their guest points will transfer.

Account consistently contains nickname, account progress, sign-out and separately confirmed deletion. Explain effects before deletion, including owned groups. Guest reset and account deletion remain distinct. Public display names never silently become Google names.

Help is reachable from the same location on Play, Groups and Leaderboard; small contextual explanations sit next to the affected decision. Rewrite the contradictory rules as part of the redesign: ten choices, three attempts, three ordered hints, speed/hint-based points, actual competition/deck scope, accurate guest retention and no ranked reset. Keep English and Spanish aligned. Privacy and analytics remain accessible and independent of gameplay and authentication; no new tracking is implied.

Offline `file:` play keeps the complete guest game in index.html. Account/group destinations explain that they need the online site rather than showing dead online controls. The ready screen and Help work without fetching assets.

## Interaction contract across all screens

- One visually dominant next action per task state. Destinations, mode selection, period filters and actions use distinct placement and semantics.
- Keep primary actions visible. Use disclosures for history depth, detailed scoring and management, not the existence of group creation.
- Preserve destination, draft input and invite intent through sign-in; do not include invite secrets in URLs, analytics or logs. If storage cannot preserve an invitation, give a recoverable instruction to reopen the original link rather than falsely claiming completion.
- Loading has a clear purpose; failure offers a direct retry. Do not use mode switching as recovery instructions. Uncertain writes reconcile with their original idempotency identity before inviting another submission.
- Browser Back/Forward, focus return after dialogs, keyboard operation, readable labels, touch targets, reduced motion and 320px fit are part of the flow, not polish added afterward.
- Translate dates into readable local presentations where helpful, while keeping the actual UTC day/week boundaries explicit and consistent. Do not promise a local-midnight reset.
- Do not introduce chat, notifications, extra puzzle modes, ranking resets, new point rules, public group discovery or an all-time private points board in this redesign.

## Implementation boundaries that must inform the plan

This is more than a header change. A Play overview must be safe to browse. The current Daily progress request creates timed rounds, so hiding the puzzle while calling it would make the experience worse.

1. Add or extend an authenticated **read-only status projection** for Daily/Unlimited readiness, completion and return-state needs. It must not create rounds or reveal unstarted clues/answers. Assess existing progress/list projections before adding fields or calls. Overview loading must not trigger `dailyProgress` or career `start`.
2. Separate application initialization, status reads and explicit gameplay activation. Existing engaged rounds, idempotency, server clocks and score contracts stay authoritative. Starting a new round still starts its server clock when accepted; this design does not propose a client-controlled clock or a pause mechanism.
3. Build the shared navigation, Play overview and result continuations together with URL/history and auth-intent handling. Avoid a frontend-only release that looks ready but secretly starts clocks. Keep the single-file offline path.
4. Adapt group discovery/create/join/detail and public/account/help copy to that structure. Derive new progress text from real projections; extend them explicitly if necessary rather than inventing frontend state.
5. Document changed boot/header/navigation behavior in an ADR and update README/DESIGN/TESTING together. Applied migrations are immutable; any server status change uses a forward migration and preserves old clients during rollout. Publish the compatible backend before the frontend.

These are delivery seams for one experience, not separate product redesigns. Do not merge another isolated “make groups easier to find” patch as completion of this work.

## Verification and acceptance

The eventual implementation must pass the relevant existing model, account, Daily, leaderboard, league, URL/privacy and browser tests. Add the smallest behavioral coverage for new gaps: overview reads cause no gameplay writes, Start/Continue preserves clocks, completed Daily stays discoverable, and auth returns to the intended create/join/play task. Run native PostgreSQL and Edge coverage for projection/migration changes. Verify real HTTP, portable file play, denied storage, both languages and mobile/desktop. Never weaken existing tests merely to claim success.

Use tasks to evaluate the experience. Screen-fit assertions alone cannot establish usability:

| Task | Successful outcome without coaching |
| --- | --- |
| “Play today's challenge.” | Person recognizes the three-player Daily and starts intentionally; browsing beforehand creates no timer. |
| “Continue where you left off.” | Person sees the unfinished state, continues the same round, and understands that a started clock was not paused. |
| “You finished earlier. Find your result.” | Completed Daily and its result are visible from Play, without searching modes. |
| “Set this up with your friends.” | Person sees Create a group on Play, creates it and finds the invitation action. |
| “Make another group for other friends.” | Creation remains visible after membership exists. |
| “Accept this invitation.” | Sign-in returns to the named group preview; Join confirms membership without starting gameplay. |
| “Why are your group points lower?” | Person understands weekly, post-join Daily eligibility and does not expect imported global points. |
| “Who won last week?” | Person finds winners and can inspect a player's winning weeks. |
| “Play more after finishing the Daily.” | Person chooses Unlimited explicitly and understands its different scope. |
| “Recover after a connection problem.” | Person finds Retry and retains the task; no forced exploration, lost draft or duplicate write. |

Before calling the new UX validated, observe several nontechnical people attempting representative tasks, including returning and invited states, without hints about which control to use. Record wrong turns and misunderstandings. This audit identifies issues and proposes a coherent solution; it does not substitute for that evidence.
