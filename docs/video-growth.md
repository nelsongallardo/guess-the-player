# Short-form video lane (TikTok / YouTube Shorts)

`tools/video-growth/` turns one verified Derabona career into a narrated 1080 × 1920 puzzle video (question → thinking pause → answer) and, behind owner gates, hands an approved derivative to Buffer for one YouTube Shorts post or one TikTok draft. It is a standalone operator tool. It does not change `index.html`, rankings, accounts, emails, migrations or the X tools in `tools/x-growth/`.

The owner's plan lives in the Obsidian vault (`projects/derabona/2026-10-12-tiktok-youtube-shorts-implementation-plan.md`). This page records what the code actually enforces.

## Status

| Layer | State |
|---|---|
| Code and offline tests | On branch `feat/derabona-shortform`: 113 tests (`node --test tools/video-growth/test/`). Vendor calls are mocked; rendering and encoding are real (Playwright + FFmpeg) |
| Runtime | **Disabled.** `enabled:false`, empty target allowlist, every cap `0`. No cron or scheduler exists |
| Narration | **Azure AI Speech, free F0 tier** (owner choice 2026-10-12, instead of paid ElevenLabs): voice **`es-AR-ElenaNeural`** (owner pick after a Tomás/Elena audition) through the official Speech SDK (pinned 1.51.0). Caption timing comes from Azure's word boundaries. One audition sample (Marcelo) was narrated with both voices and rendered on 2026-10-12. The ElevenLabs client remains as an option |
| Rendered samples | Three narrated TikTok samples with Elena (Marcelo, Simão, Marcel Desailly), private and on placeholder targets, sent to the owner for review 2026-10-12 (G3 pending the owner's verdict) |
| Media host | **Google Cloud Storage bucket `gs://derabona-video-media`** in project `ledgi-488011` (`derabona-club` has no billing; owner choice 2026-10-12). us-east1, uniform access, 60-day auto-delete, anonymous get-only (`allUsers` → `roles/storage.legacyObjectReader`): an exact URL downloads, listing (403/401) and anonymous upload (403) are refused, verified with a throwaway file. Allowlist host: `derabona-video-media.storage.googleapis.com` (not the shared `storage.googleapis.com`). No video uploaded yet |
| Buffer | YouTube and TikTok-draft mapping, read-only discovery, intent ledger, reconciliation and public readback are implemented. One owner-authorized read-only lookup ran on 2026-10-12: the organization has TikTok `derabona.club` and X connected, **no YouTube channel**. **No Buffer write has run** (G1/G6) |
| TikTok | **Draft-only** (owner decision 2026-10-12). Buffer's `TikTokPostMetadataInput` has only `isAiGenerated` and `title` (confirmed against the live schema), with no privacy, comment/Duet/Stitch or "Promotional content" field. The tool sends `saveToDraft: true` with the AI label and can never schedule a TikTok post itself. The owner applies the approved settings in Buffer and schedules it. **Unverified:** whether Buffer's composer offers privacy and comment/Duet/Stitch for TikTok, and whether TikTok accepts the media host's URL |
| YouTube Shorts | Mapping implemented. Blocked until G1–G6 evidence exists |

## Gates

Nothing past G0 is authorized. Each gate needs recorded evidence before the code path it guards can run.

| Gate | Evidence | Enforced by |
|---|---|---|
| G0 scope | Owner authorized implementation in a fresh worktree (2026-10-12) | This branch |
| G1 account | Exact Buffer organization, channel IDs, service and native handle/channel ID in the private config allowlist | `lib/config.mjs`, `lib/buffer.mjs` channel checks |
| G2 rights/policy | Paid ElevenLabs commercial rights and voice, crest/font rights, TikTok disclosure route, YouTube AI/kids/privacy review | `license` block of the job manifest; TikTok draft-only mapping |
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
- For TikTok, TikTok's official oEmbed endpoint (public videos only) must show the approved account, video ID and caption, **and** the owner must confirm the same items plus the privacy, comment/Duet/Stitch settings and the visible promotional label, because those were set by hand and cannot be read by machine.

## Write safety

Buffer writes have no idempotency key. The publisher therefore:

1. holds an exclusive lock and refuses to run if the ledger is missing or malformed;
2. writes an fsynced `intent` line before any network call;
3. sends at most one `createPost` per `(campaign, asset, channel, slot)` key (for TikTok that one call creates a draft);
4. records a timeout, dropped connection or 5xx as `uncertain` and never re-creates it; `reconcile.mjs` looks for the post instead;
5. treats each platform target independently.

`--dry-run` (the default) runs every gate and performs no vendor, host or ledger write.

## Operations

All paths are private and outside the repository (proposed): state in `~/.hermes/profiles/engineering/state/derabona-video/`, artifacts in `~/.hermes/profiles/engineering/artifacts/derabona/video/`. Files are created `0600`, directories `0700`.

See [`tools/video-growth/README.md`](../tools/video-growth/README.md) for commands, PAUSE and recovery.
