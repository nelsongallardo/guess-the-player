# video-growth

Narrated vertical career puzzles for YouTube Shorts, published only as approved Buffer posts. TikTok is prepared for in the code but its automatic publishing is blocked. Gates, status and content rules: [docs/video-growth.md](../../docs/video-growth.md).

**Runtime is off.** Nothing here is scheduled. The default config refuses every paid or network write, and there is no cron, installer or wrapper.

## Setup

```sh
cd tools/video-growth
npm ci                      # pinned playwright 1.57.0; uses the local Chromium cache
node --test test/           # 99 tests; vendor calls are mocked
```

Requires Node 22+, `ffmpeg` and `ffprobe` on `PATH` (libx264, libmp3lame, aac, ebur128, astats).

## Private state

`STATE` is a private directory outside the repository, mode `0700` (proposed: `~/.hermes/profiles/engineering/state/derabona-video/`):

| File | Written by | Purpose |
|---|---|---|
| `config.json` | owner/engineering by hand | `enabled`, Buffer organization + channel allowlist, caps, rates, host allowlist, `tts.authorized`. Missing file = disabled default |
| `PAUSE` | anyone | presence stops every paid/network write |
| `jobs/<job>.json` | `prepare.mjs` | immutable job manifest (contains the answer: never publish it) |
| `tts-cache/` | `narrate.mjs` | accepted audio + alignment, keyed by exact request |
| `spend.json` | `narrate.mjs` | reservations; every attempt counts against the cap |
| `approvals.jsonl` | `approve.mjs --approve` | owner receipts bound to a payload digest |
| `intents.jsonl` | `publish.mjs`, `reconcile.mjs`, `verify-public.mjs` | append-only fsynced intent/outcome ledger |
| `publish.lock` | publisher | exclusive lock; a stale one is never auto-removed |

## Workflow

Each step is a separate command at a separate permission boundary.

```sh
git fetch origin                                                          # fresh upstream for source checks
node preflight.mjs --mode offline --state STATE                           # gate report, no network
node prepare.mjs --state STATE --campaign pilot-20261019 --job v01 \
  --publish-at 2026-10-19T16:00:00Z --seed v01 --youtube-privacy public --made-for-kids false
# PAID, owner-approved only:
ELEVENLABS_API_KEY=… node narrate.mjs --manifest STATE/jobs/v01.json --platform youtube --state STATE \
  --voice-id VOICE --model-id eleven_multilingual_v2 --settings '{"stability":0.5,"similarity_boost":0.75}' \
  --out PRIVATE/v01-narration.json --authorize-spend
node render.mjs --manifest STATE/jobs/v01.json --narration PRIVATE/v01-narration.json --platform youtube --out PRIVATE/v01
ffprobe -v error -show_streams -show_format -of json PRIVATE/v01/youtube.mp4
# Owner watches with and without sound, checks proof-375-*.png and the QA JSON, then:
node approve.mjs --manifest STATE/jobs/v01.json --platform youtube --derivative PRIVATE/v01/youtube.mp4 --state STATE --review-only
node approve.mjs ... --approve --approver Nelson --digest <digest shown> --expires 2026-10-19T15:00:00Z
# Upload PRIVATE/v01/youtube.mp4 to the approved host at the opaque key from lib/hosting.mjs publicObjectKey (manual, G4).
node publish.mjs --init-ledger --state STATE                              # once per lane
node publish.mjs --manifest STATE/jobs/v01.json --channel CH --derivative PRIVATE/v01/youtube.mp4 --asset-url URL --state STATE   # dry run
BUFFER_API_KEY=… node preflight.mjs --mode readonly --target youtube --state STATE
BUFFER_API_KEY=… node publish.mjs ... --submit                           # G6+, separately authorized
BUFFER_API_KEY=… node reconcile.mjs --readonly --manifest … --channel CH --derivative … --asset-url URL --state STATE
node verify-public.mjs --manifest … --channel CH --derivative … --asset-url URL --state STATE --owner-evidence PRIVATE/v01-evidence.json
node report.mjs --state STATE --campaign pilot-20261019 [--metrics METRICS.json] > PRIVATE/pilot-20261019.csv
```

`prepare.mjs --sample` writes placeholder targets so samples can be rendered and reviewed before any account is connected. Sample jobs can never be approved or published.

## Stop, recover, roll back

- **Stop now:** `touch STATE/PAUSE`. This blocks new TTS, writes and submissions. It does **not** cancel posts Buffer already holds as scheduled; list them and cancel each one only with an incident-scoped owner decision, then read it back.
- **`uncertain` or `intent` target:** run `reconcile.mjs --readonly`. Exactly one exact match (same channel, text, media URL and slot) is attached. Zero or several matches are recorded as an incident; that target never resends. The owner decides.
- **Missing or malformed `intents.jsonl`:** an incident, not an empty queue. Do not re-initialize while any remote post may exist. Inspect Buffer read-only first.
- **Stale `publish.lock`:** the holder died, maybe mid-write. Reconcile every unresolved target, then remove the lock by hand.
- **Rejected target:** fix the payload, re-render if needed, get a new approval; the changed digest allows one new intent.
- **Media cleanup:** only with `canDeleteObject` true. That needs every dependent target resolved, 7 days past publication and an owner decision. Deleting the source object does not remove native platform copies.
- Restoring older code does not rewind the ledger or remote posts. Keep the private state across upgrades.
