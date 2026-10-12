# Short-form video lane (TikTok / YouTube Shorts)

`tools/video-growth/` turns one verified Derabona career into a narrated 1080 × 1920 puzzle video (question → thinking pause → answer) and, behind owner gates, hands an approved derivative to Buffer for one YouTube Shorts or TikTok post. It is a standalone operator tool. It does not change `index.html`, rankings, accounts, emails, migrations or the X tools in `tools/x-growth/`.

The owner's plan lives in the Obsidian vault (`projects/derabona/2026-10-12-tiktok-youtube-shorts-implementation-plan.md`). This page records what the code actually enforces.

## Status

| Layer | State |
|---|---|
| Code and offline tests | On branch `feat/derabona-shortform`: 99 tests (`node --test tools/video-growth/test/`). Vendor calls are mocked; rendering and encoding are real (Playwright + FFmpeg) |
| Runtime | **Disabled.** `enabled:false`, empty target allowlist, every cap `0`. No cron or scheduler exists |
| ElevenLabs narration | Client, cache, spend caps and clipping check implemented. **No real request made.** The paid plan, voice choice and two-voice audition are still pending (G2/G4) |
| Rendered samples | Only tone/silent mock renders exist, for tests and layout review. **No narrated sample exists** (G3) |
| Media host | Verifier implemented. **No host chosen, uploaded to or fetched** (G4) |
| Buffer | YouTube mapping, read-only discovery, intent ledger, reconciliation and public readback are implemented. **No authenticated read or write has run** (G1/G6) |
| TikTok automatic publishing | **Hard-blocked in code.** Buffer's `TikTokPostMetadataInput` has only `isAiGenerated` and `title`. It has no privacy, comment/Duet/Stitch or "Promotional content" disclosure field, so the controls TikTok requires cannot be sent. `prepare.mjs` creates YouTube targets only |
| YouTube Shorts | Mapping implemented. Blocked until G1–G6 evidence exists |

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
| G6 smoke | Separate authorization; exact native readback plus an owner observation record | `publish.mjs --submit`, `reconcile.mjs`, `verify-public.mjs` |
| G7/G8 | Pilot and any automation | Not implemented as a scheduler |

## Content rules the code enforces

- The source is a git commit. `index.html` and `research/verified-players.json` are read with `git show <commit>:<path>` and hashed; a later roster or schedule change invalidates the job.
- A career is eligible only if it is outside every Daily round from today through 14 days after its planned publication, unused by this lane in the previous 30 days, between 3 and 8 clubs, matched club-for-club (repeat spells included) by a research record with at least one source, and every crest resolves.
- Scripts contain only the ordered clubs and the verified name. Numbers, trophies, fees, "today"/Daily wording and any name token before the reveal are rejected. TikTok copy carries no brand, URL or call to action.
- The reveal is at least 5 seconds after the question ends; the whole video is 22–30 seconds. Captions come only from ElevenLabs alignment; missing or inconsistent timing blocks rendering.
- Public object keys, titles and captions never contain the answer.
- The renderer draws one PNG per visual state from an offline template. It checks that every element sits inside the proposed safe box (x 72–900, y 180–1500), that club names are at least 36 px (12.5 px at a 375 px phone width) and that captions are at least 44 px and fit. It then proves, on the encoded MP4, that the frame before the reveal is the thinking state. The finished mix targets −16 LUFS with a true peak of −1 dBTP or lower. Careers longer than 8 clubs are rejected rather than squeezed.
- `public_verified` needs the public YouTube page to show the exact channel ID, title, description, public visibility and playability, **and** an owner observation (playback, club order, reveal timing, audio, visible AI label). A bot wall or a parsing failure records `public_unverified`; it never verifies.

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
