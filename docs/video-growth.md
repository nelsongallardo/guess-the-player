# Short-form video lane (TikTok / YouTube Shorts)

`tools/video-growth/` turns one verified Derabona career into a narrated 1080 × 1920 puzzle video (question → thinking pause → answer) and, behind owner gates, hands an approved derivative to Buffer for one YouTube Shorts or TikTok post. It is a standalone operator tool. It does not change `index.html`, rankings, accounts, emails, migrations or the X tools in `tools/x-growth/`.

The owner's plan lives in the Obsidian vault (`projects/derabona/2026-10-12-tiktok-youtube-shorts-implementation-plan.md`). This page records what the code actually enforces.

## Status

| Layer | State |
|---|---|
| Code and offline tests | Implemented on `feat/derabona-shortform`; all vendor calls are mocked in tests |
| Runtime | **Disabled.** `enabled:false`, empty target allowlist, every cap `0`. No cron or scheduler exists |
| ElevenLabs narration | Client implemented; **no real request made**. Paid plan, voice choice and audition are pending (G2/G4) |
| Rendered samples | Only silent/tone mock renders used by tests. **No narrated sample exists** (G3) |
| Media host | Verifier implemented; **no host chosen or configured** (G4) |
| Buffer | Payload mapping, read-only discovery and the intent ledger are implemented; **no authenticated read or write has run** (G1/G6) |
| TikTok automatic publishing | **Hard-blocked in code.** Buffer's `TikTokPostMetadataInput` has only `isAiGenerated` and `title`; it has no privacy, comment/Duet/Stitch or "Promotional content" disclosure field, so the controls TikTok requires cannot be represented |
| YouTube Shorts | Mapping implemented; blocked until G1–G6 evidence exists |

## Gates

Nothing past G0 is authorized. Each gate needs recorded evidence before the code path it guards can run.

| Gate | Evidence | Enforced by |
|---|---|---|
| G0 scope | Owner authorized implementation in a fresh worktree (2026-10-12) | This branch |
| G1 account | Exact Buffer organization, channel IDs, service and native handle/channel ID in the private config allowlist | `lib/config.mjs`, `lib/buffer.mjs` channel checks |
| G2 rights/policy | Paid ElevenLabs commercial rights and voice, crest/font rights, TikTok disclosure route, YouTube AI/kids/privacy review | `license` block of the job manifest; TikTok hard block |
| G3 quality | Three narrated, listened-to, phone-reviewed samples | Owner review; `render.mjs` QA report |
| G4 spend/hosting | Fixed costs recorded, variable cap > 0, approved host on the allowlist | `lib/spend.mjs`, `lib/hosting.mjs` |
| G5 asset approval | Receipt bound to the canonical digest of the target payload and derivative bytes | `lib/approval.mjs` |
| G6 smoke | Separate authorization; exact native readback | `publish.mjs --submit`, `lib/verify-public.mjs` |
| G7/G8 | Pilot and any automation | Not implemented as a scheduler |

## Content rules the code enforces

- The source is a git commit. `index.html` and `research/verified-players.json` are read with `git show <commit>:<path>` and hashed; a later roster or schedule change invalidates the job.
- A career is eligible only if it is outside every Daily round from today through 14 days after its planned publication, unused by this lane in the previous 30 days, between 3 and 8 clubs, matched club-for-club (repeat spells included) by a research record with at least one source, and every crest resolves.
- Scripts contain only the ordered clubs and the verified name. Numbers, trophies, fees, "today"/Daily wording and any name token before the reveal are rejected. TikTok copy carries no brand, URL or call to action.
- The reveal is at least 5 seconds after the question ends; the whole video is 22–30 seconds. Captions come only from ElevenLabs alignment; missing or inconsistent timing blocks rendering.
- Public object keys, titles and captions never contain the answer.

## Write safety

Buffer writes have no idempotency key. The publisher therefore:

1. holds an exclusive lock and refuses to run if the ledger is missing or malformed;
2. writes an fsynced `intent` line before any network call;
3. sends at most one `createPost` per `(campaign, asset, channel, slot)` key;
4. records a timeout, dropped connection or 5xx as `uncertain` and never re-creates it; `reconcile.mjs` looks for the post instead;
5. treats each platform target independently.

`--dry-run` (the default) runs every gate and performs no vendor, host or ledger write.

## Operations

All paths are private and outside the repository (proposed): state in `~/.hermes/profiles/engineering/state/derabona-video/`, artifacts in `~/.hermes/profiles/engineering/artifacts/derabona/video/`. Files are created `0600`, directories `0700`.

See [`tools/video-growth/README.md`](../tools/video-growth/README.md) for commands, PAUSE and recovery.
