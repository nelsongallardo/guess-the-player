# Derabona — UI/UX design and review brief

Updated: 2026-10-08  
Scope: the complete website, including repeat visits, gameplay, results, friends, rankings and accounts.  
Current direction: the game-first correction in PR #38 / ADR 0028.

This is a self-contained handoff for a fresh design or engineering session. It describes the intended experience and the implemented correction, and identifies what still needs observation. Read it before the older design plans. Inspect the current site and source before proposing changes: this document is a dated design baseline, not proof that every interaction is good.

## 1. Product and audience

Derabona is a casual football-memory game. Players recognize a footballer from the sequence of clubs in their career, using real club crests, then choose from ten names. It should feel like opening a football puzzle on the web: immediate, inviting and easy to keep playing.

The audience includes people who are not technical, do not explore websites, and may only visit through a shared link. Design for someone who will use what is obvious on the screen. This applies equally to a first visit, a quick return tomorrow, and a regular player checking friends' scores.

The main recurring experience is:

1. Open the site and see the puzzle.
2. Guess, use a hint if needed, and understand the answer feedback.
3. Continue to the next player.
4. See the Daily result, compare with friends, share, or keep playing Unlimited.
5. Return another day and immediately understand whether there is a new puzzle or an already-completed result.

Accounts are optional for playing. They are needed for persistent ranked results and private groups. Signing in must have a clear benefit and must not be a prerequisite for trying the game.

## 2. Owner feedback that governs the design

The owner repeatedly rejected isolated navigation fixes. Making a feature technically reachable is insufficient when people must explore to discover it.

The owner also rejected the subsequently shipped Play overview: it looked like a desktop application, contained too much explanation and navigation, and required extra clicks to reach the game. The original version was more engaging because the football puzzle was immediately present.

The current correction therefore follows these priorities:

- **Football first.** The crests, question and answers are the main content on arrival.
- **Direct play.** No dashboard, welcome wizard or Start/Continue screen before an available game.
- **Obvious optional participation.** A newcomer can see Create group without opening a vaguely named destination first.
- **One clear next action within play.** After an answer, show feedback and Next player; after the final answer, show Show result.
- **Contextual detail.** Scoring explanations, champion history and management belong where they help a task, with less prominence than the game or standings.
- **Continuity.** Language changes, refresh, signing in and browser navigation must not accidentally discard progress or the task a person intended to complete.
- **Restraint.** Remove repeated instructions and decorative interface pieces before adding another card, banner, tab or dialog.

Do not reinstate the rejected overview merely because it is a conventional navigation pattern. Do not equate visible navigation, passing tests, or lack of overflow with a good game experience.

## 3. Information architecture

There are three core destinations, with the game as the entry point. Groups and public standings are views of the separate leaderboard page, not separate games.

```text
Derabona / Play
  ├─ Daily: three shared players for the UTC day
  │    └─ Result → share / group standings / create group / Unlimited
  ├─ Unlimited: competition-based careers
  │    └─ Answer → next player → competition completion
  ├─ Create group / My groups
  │    ├─ Group list
  │    ├─ Create → name → sign in if needed → create → invite
  │    ├─ Invitation → sign in if needed → explicit join
  │    └─ Group → weekly standings
  │         ├─ Today (compact period selector)
  │         ├─ Weekly trophies and champions
  │         └─ Settings / members / invitation management
  ├─ Public leaderboard → competition filter / personal rank
  └─ Account, How to play, About, Privacy, Contact
```

### Routes and purposes

| URL or surface | Purpose | Expected entry behavior |
| --- | --- | --- |
| `/` or `index.html` | Daily game | Open/resume today's puzzle; show its result if already completed |
| `index.html?unlimited=1` | Unlimited | Open/resume the selected competition |
| `leaderboard.html` | Public leaderboard | Read standings; never start a game |
| `leaderboard.html?view=friends` | Groups | Existing groups, visible creation, invitation guidance |
| `leaderboard.html?view=friends&create=1` | Create a group | Focused group-name task |
| `leaderboard.html?view=friends&league=<id>` | One group | This week's standings by default |
| Group invitation link | Preview and join | Preserve invitation; membership requires explicit confirmation |
| `index.html?auth=friends` with create/invite markers | Account handoff for groups | Complete sign-in/nickname, then return to the intended group task; never initialize gameplay |
| Account dialog | Sign in, account totals and settings | Stay in context; destructive actions are separate |
| Footer / `privacy.html` | Help, explanation, privacy and contact | Secondary to gameplay |

Language uses `lang=es` or `lang=en`. Default visible content is Spanish. Invite tokens are private link fragments that are scrubbed early; they must not become ordinary tracking/query data. The route table is conceptual and intentionally omits real tokens.

### Navigation hierarchy

- The wordmark returns to Daily.
- The game header contains brand, language and Account / Sign in.
- Immediately below: compact Daily / Unlimited controls on the left, contextual group link and public-board link on the right. Wrapping is allowed on very narrow screens.
- A visitor without a group sees **Create group** directly. A member sees **My groups**. Creation also remains available below the puzzle and on the Groups page.
- Standings pages use ordinary Play / Groups / Leaderboard links, with a local All groups breadcrumb inside group details. They do not use a second public/friends switch.
- Help stays in the footer. The game footer already provides How to play; the standings footer opens its help dialog.
- No Play Daily button is added inside group details; the owner explicitly removed that competing action.

## 4. Screen hierarchy and behavior

### Playing the Daily

```text
[derabona + tagline]                         [language] [account]
----------------------------------------------------------------
[Daily]  Unlimited                         Create group   Leaderboard
Daily #22
Three players. Three guesses each.
Guest score disclosure, when applicable

[                       CAREER / CRESTS                          ]
[time played                                      attempts left]
Player 1 / 3
Who is this player?
[Name]                                  [Name]
[Name]                                  [Name]
[Name]                                  [Name]
[Name]                                  [Name]
[Name]                                  [Name]
[Hint]                   Revealed clues, when any
Answer feedback                                  [Next player]

Who knows football best?                         Create a group
Short invitation / an existing group link

About the game, FAQs and footer
```

This is a hierarchy sketch, not a fixed pixel layout. On phones the same sequence stacks; the ten answers remain two columns, with names wrapping and touch targets preserved.

The initial game itself is the demonstration. Instructions are short and adjacent to the action. Do not add a separate hero explaining all site features before the puzzle.

- Daily uses the same three players for everyone that day.
- Ten options, three attempts per player, up to three hints.
- Hint order: position, nationality, club years. Revealed hints remain visible; empty future-hint boxes are hidden.
- Wrong/correct states use text/symbols as well as color. Decorative letter badges and outgoing-arrow symbols are hidden from answer choices.
- The clock is a quiet count-up readout with scoring details on activation. It is not a deadline or countdown.
- The active answer stays visible after resolution. Next player is deliberate; the final player leads to Show result.

### Unlimited

Use the same visual game and interaction vocabulary. Its additional control is the competition selector. Completed competitions remain visibly labeled and unavailable for selection. An active ranked round can restrict changing competition; explain the restriction rather than silently substituting another game.

The switch from Daily/result to Unlimited opens the puzzle in one action. It must remove any Daily summary. Switching back restores the Daily or its completed result, with existing clocks and answers preserved.

### Completed Daily

Lead with completion, the player's result, the three-player recap and the next Daily time. Put Share and Play Unlimited beside the result. Then show existing groups for comparison or a short invitation to create one.

Do not display the raw share-message preview by default. Sharing reports actual success, failure or cancellation honestly. The next-Daily countdown is appropriate here because it describes availability, not time pressure while solving.

Returning to the home page after completing the Daily shows this result directly. It must not require a View result click or silently start Unlimited.

### Groups list and creation

The list is useful for existing members and understandable when empty. Create a group remains visible in both states. Joining is through a friend's invitation link; avoid implying there is a public directory of private groups.

Creation is one focused task: name the group, authenticate if needed, explicitly create it, then receive an invitation link. Keep the entered name and intended destination across sign-in. Do not create a group automatically because an OAuth callback completed.

Use the user's language: **group / grupo** in the product. “Private league” is an implementation/domain term and need not appear in every instruction.

### Invitation and join

Show the group identity, relevant membership information and the score rule before explicit Join. If sign-in or first-time nickname confirmation is required, return to the invitation afterward.

A new member starts at zero. Existing public totals and earlier Daily results do not transfer. Results finished after joining can count; there is no extra replay of today's Daily. Invalid, replaced, missing or unavailable invitations need a truthful state and a clear recovery route.

### Group standings

The table is the main content. Header: group name, member information and owner invitation action. Default period: This week. Today is available through a compact native selector, not a large competing switch.

- The week starts Monday at 00:00 UTC; the day changes at 00:00 UTC.
- Weekly points reset; earned weekly titles remain.
- Ties share rank and first-place trophies.
- Trophy counts beside names reveal which weeks were won.
- Past champions are an inline disclosure below standings.
- Settings, rename, membership changes, invitation replacement, leave and deletion stay secondary; destructive actions retain confirmation.
- Empty/not-yet-played is different from failed-to-load. A network error must not imply that everyone has zero points.

### Public leaderboard and Account

The public leaderboard compares cumulative verified account results and supports competition filtering and personal placement. It is distinct from a group's weekly Daily competition. Keep that distinction brief and adjacent to the relevant heading or score.

The account header is labeled; an unexplained global score is not displayed there. Account contains **Lifetime points / Puntos acumulados**, nickname and account controls. Optional Google sign-in is separate from analytics consent. First-time nickname confirmation is a required one-time task; existing accounts do not repeat it.

## 5. State and continuity matrix

| Situation | What the person should see / be able to do |
| --- | --- |
| New guest | Immediately playable Daily, optional sign-in and direct group creation |
| Returning unfinished guest | Same answers, hints and appropriate persisted clock; no Start screen |
| Signed-in player | Resolve account, then open the selected server-backed game |
| First account enrollment | Confirm/change suggested nickname, then continue the original task |
| Completed Daily | Completed result immediately; Share, group comparison, Unlimited |
| Language change | Same game/state, translated controls and help |
| Group-auth callback | Return to create/join; no background game starts |
| Account/network failure | Hide unavailable/stale ranked clues; Retry or explicit unranked practice |
| Daily selected from signed-in practice | Retry account resolution before opening ranked Daily |
| UTC day changes | Offer/load the new Daily without relabeling yesterday's result as today |
| Missing or failed group data | State that loading failed; do not invent an empty membership list |
| Signed out | Fresh guest game; no previous-account group data or totals |
| Portable offline file | Play without network, no unusable sign-in prompt; explain that groups require the online site |
| Browser storage unavailable | Play in memory with an honest persistence message |

Opening a game starts its clock. Once started, refresh, changing language, switching modes and time away do not grant a scoring reset. Server timestamps stay authoritative; the frontend must not invent a fairer-looking replacement. This is an intentional consequence of immediate entry, replacing the explicit-activation decision in ADR 0027.

## 6. Visual system

### Character

Argentinian football memory: warm match-programme paper, ink blue, celeste, real club crests and the distinctive italic lowercase wordmark. The pitch is the strongest visual element. Surrounding controls should be quieter.

Keep the established brand rather than reskinning the game as a generic dashboard, productivity tool or marketing landing page. No external font downloads, framework shell or new decorative asset pack is needed.

### Color tokens

| Role | Value | Use |
| --- | --- | --- |
| Paper | `#f7f4eb` | Page background |
| Ink | `#122a38` | Text, pitch, selected game mode |
| Panel | `#fffdf7` | Answer surfaces |
| Celeste | `#89cff0` | Pitch accents, lives, selected competition |
| Text/link accent | `#176180` | Links and focus treatment on paper |
| Muted text | `#52636a` | Supporting information |
| Divider | `#d4d8d3` | Quiet separation |
| Correct | `#17613e` | Correct state with explicit symbol/text |
| Incorrect | `#a93637` | Wrong state with explicit symbol/text |

`--lime` is a historical CSS variable name for the blue accent, not a request to introduce lime green. The pitch locally overrides text/accent tokens for contrast on ink.

### Typography

- Body: native system sans-serif (`-apple-system`, BlinkMacSystemFont, Segoe UI, Arial).
- Wordmark: heavy italic Arial Black/Arial treatment, tightly spaced, lowercase. Desktop base 36px; phone 28px, reducing to 24px at the narrowest breakpoint.
- Game question: heavy, approximately 23px desktop / 18px phone.
- Mode controls: 14px desktop / 13px phone.
- Phone answers: 13px with wrapping; prioritize legibility over forcing names onto one line.
- Metadata uses the existing compact monospaced treatment sparingly. Do not turn every heading or label into an uppercase eyebrow.
- The tagline remains part of the brand. Its current very small mobile size is an item to assess in a global review, not evidence of good readability.

### Layout and components

- Content width: maximum 1000px; desktop side allowance 64px total; phones 16px per side.
- Header: compact brand/language/account row; avoid a second utility row.
- Career grid: four columns at 800px and below, six above; left-to-right then down in chronological order. Long careers compact on desktop rather than scroll horizontally.
- Pitch: ink surface, approximately 14px radius, subtle celeste-related base shadow, faint competition watermark confined inside it.
- Answers: two equal columns, 8px desktop / 7px phone gaps; approximately 50px desktop / 52px phone minimum height; names may make a row taller.
- Buttons and links used as actions: at least 44px touch height with visible keyboard focus. Avoid making every link a filled button.
- One compact selected mode pill; inactive mode is quiet. Contextual destinations use text links.
- Group invitation: a short text section below the puzzle, not another hero or equal-weight product card.
- Results: centered readable column, with actions near the result and group comparison following it.
- Motion: action feedback only where useful; preserve reduced-motion support. No ambient animation competing with reading club sequences.

These describe the current rendered direction. CSS is layered in the single-file runtime; earlier declarations can be overridden later. Inspect computed styles before treating an earlier literal as the effective design.

## 7. Copy and terminology

Write in short, concrete sentences. Explain what the player can do now. Preserve the warm Argentinian Spanish tone and complete English parity; do not translate proper names.

| Intent | Spanish game label | English game label |
| --- | --- | --- |
| Daily mode | Diaria | Daily |
| Unlimited mode | Sin límite | Unlimited |
| Discover creation | Crear grupo | Create group |
| Existing groups | Mis grupos | My groups |
| Full create action | Crear un grupo | Create a group |
| Public standings link | Tabla | Leaderboard |
| Account access | Cuenta / Iniciar sesión | Account / Sign in |
| After final player | Ver resultado | Show result |
| Next game from result | Jugar sin límite | Play Unlimited |

The standings page currently uses Grupos / Clasificación and Groups / Leaderboard. A fresh global review should assess whether this variation helps context or creates unnecessary vocabulary changes. Record observed confusion before introducing another naming scheme.

Avoid technical phrasing such as “server-authoritative,” “projection,” “idempotency” and “OAuth” in player-facing copy. Guest score and group eligibility consequences need plain explanations, not system terminology or multiple repeated warnings.

## 8. Accessibility and interaction requirements

- Real buttons for actions and real links for destinations; no clickable text masquerading as navigation.
- Complete keyboard operation, logical focus order, visible focus, and focus return after dialogs.
- Screen-reader labels for icon actions such as refresh; meaningful status/error announcements without noisy timer announcements every second.
- Feedback distinguishable without color alone.
- All player names readable at narrow widths and with longer names; never solve layout by truncating the answer.
- Club crest, club name, qualifier and revealed years stay grouped together.
- Preserve chronological visual and DOM order in the career grid.
- Translation and responsive changes must not reset play.
- No page overflow at 320px; also inspect browser zoom and longer English copy, not only default Spanish screenshots.

## 9. Evidence and open review questions

The correction passed the complete 305-test Node/native PostgreSQL suite, focused browser journeys, the real local PostgreSQL/Edge creation → Daily → group journey, and the actual analytics SDK regression with ingestion intercepted. Browser account authentication is simulated. Desktop and phone screenshots were inspected in both languages.

This establishes tested behavior and layout fit. It does **not** establish that the owner likes the revised design or that inexperienced players find it intuitive. There has been no target-user study, complete native Safari/Firefox review, or fresh two-account hosted Google invitation test for this correction.

A new global review should investigate:

1. Does the puzzle engage immediately, and can people answer without reading site instructions?
2. Is direct group creation noticed, or does the short link still blend into navigation?
3. Does a newcomer understand Daily versus Unlimited from the game and context?
4. Are guest score explanations understandable without crowding the puzzle or feeling like a login wall?
5. Is the mobile answer grid comfortable for long names and fast thumb use?
6. Are the tiny tagline and metadata useful/readable, or merely visual noise?
7. Are game and standings labels consistent enough for someone who does not explore?
8. Does completing the Daily make the next useful action obvious without promoting every feature at once?
9. Can a returning group member quickly understand their weekly position and earned trophies?
10. Do Account, privacy, explanatory content and error states feel like the same lightweight game website?

Observe tasks, hesitation, misclicks and comprehension. Do not invent conversion improvements, usability scores or participant findings from screenshots or automated tests.

## 10. Fresh-session review handoff

Suggested opening brief:

> Review Derabona's entire recurring UI/UX using UX_DESIGN.md as context, not as a design to defend. The audience includes nontechnical people who do not explore websites. The owner rejected both hidden group discovery and the later dashboard/extra clicks before playing. Inspect the current live site and source, including mobile and returning-player states. Start with the actual game, then completion, Unlimited, groups, creation/invitation, rankings, account and failure recovery. Identify the underlying hierarchy and flow problems before proposing a coherent improvement. Keep the puzzle engaging and immediate, and keep optional social features obvious. Separate observed evidence, hypotheses and proposals; passing tests is not user approval.

Read next, only as relevant:

| File | Purpose |
| --- | --- |
| `README.md` | Runtime and product overview |
| `DESIGN.md` | Detailed gameplay/technical acceptance contract |
| `BRAND.md` | Brand assets, wordmark and provenance |
| `docs/adr/0028-game-first-experience.md` | Current entry/navigation decision |
| `docs/adr/0027-connected-play-and-groups.md` | Partly superseded overview decision; useful history |
| `docs/adr/0026-private-daily-leagues.md` | Group scoring/membership invariants |
| `TESTING.md` | Dated verification and limitations |
| `index.html` | Actual game markup, styles, state controllers, translations and embedded assets |
| `leaderboard.html` | Public board, groups, creation/joining, account and management |
| `privacy.html` | Bilingual privacy page |
| `tests/site-wayfinding-checks.js` | Current entry, return, failure and rollover journeys |
| `tests/connected-journey-checks.js` | Real local game/group integration, simulated Auth |

Implementation note: `PlayOverview` is a historical controller name in `index.html`; after ADR 0028 it handles account resolution and automatic entry, not a visible lobby. `DailyUI`, `DailyRankedUI` and `RankedUI` own their respective gameplay paths; `FriendsLeagues` lives in `leaderboard.html`. Read those boundaries before changing flow.

Preserve existing saves, clocks, scoring, roster, bilingual behavior, offline play and analytics consent while reviewing or changing presentation. Never infer permission to modify real groups, answer live puzzles, delete accounts or message friends merely from permission to inspect the interface. The owner's explicit instructions in the new session determine the requested implementation/publication scope.
