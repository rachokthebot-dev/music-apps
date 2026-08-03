# Setlists

Build a gig out of the songs you've been practising, match each one to a Helix patch, then hand the lot to SoundPath to be levelled.

## What it does

Import a setlist from an Apple Music playlist or a pasted list of songs. For each song, pick the video you practise to and the Helix preset you play it on. Reorder by dragging. When it's ready, push it to SoundPath, which records every snapshot and produces one `.hls` where nothing jumps between songs.

## The wizard

Songs arrive with nothing attached, and each step fills something in:

1. **Import** — an Apple Music playlist URL, or paste titles one per line.
2. **Videos** — match each song to a YouTube video; imports into Shreddy for slow practice, and into LickBank when you want to clip a phrase out of it.
3. **Presets** — match each song to a Helix patch: search ToneCloud, paste a link, or upload an `.hlx`.

Re-running the wizard on a saved setlist prefills every choice, so changing one song doesn't mean redoing the rest.

## Where Helix settings live

They don't live here. This app decides *which* preset a song uses; SoundPath owns everything about how loud it is.

That split is deliberate. This app has no recordings, so any Helix file it handed you would be unlevelled while looking finished — which is why the `.hls` and per-song `.hlx` downloads were removed. **Edit in SoundPath** is the way over.

Snapshot counts come back from SoundPath too, rather than being counted here. The two apps read a preset by different rules — one whose author named a single slot and left the rest as copies is one snapshot to a simple parse and two to SoundPath, which falls back to distinct tones. The number next to a song is a promise about how much there is to record, so it comes from whatever does the recording.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- Prisma + SQLite (`data/setlists.db`)
- Talks to SoundPath over HTTP (`SOUNDPATH_URL`), Shreddy and LickBank by link

## Setup

ToneCloud credentials are entered on the Settings page rather than baked into the repo. They're stored in the local SQLite file in plaintext — this is a personal app on a personal machine, but it is not encrypted at rest, and the settings API never returns the password.

## Run

```bash
npm install
npm run dev:setlists          # → http://localhost:3006/setlists
```

Cross-app links resolve only through the proxy on 8080, not on the direct port.

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
