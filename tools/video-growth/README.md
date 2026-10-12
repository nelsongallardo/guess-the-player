# video-growth

Narrated vertical career puzzles for YouTube Shorts and TikTok, published only through approved Buffer posts. Gates, status and content rules: [docs/video-growth.md](../../docs/video-growth.md).

**Runtime is off.** Nothing here is scheduled, and the default config refuses every paid or network write.

## Setup

```sh
cd tools/video-growth
npm ci            # pinned playwright only; uses the local Chromium cache
node --test test/*.test.mjs
```

Requires Node 22+, `ffmpeg` and `ffprobe` on `PATH` (libx264, aac, ebur128).
