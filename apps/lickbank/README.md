# LickBank

A personal lick library. Clip the riffs that catch your ear from YouTube videos, organize them by source and folder, and practice them at your own pace.

<!-- ![Library](screenshots/library.png) -->

## What it does

- **Clip from YouTube** — paste a URL, set in/out points, save the slice as a lick with notes.
- **Sources** — every clip is linked to its parent video so you can jump back to the full context.
- **Folders** — group licks by song, technique, key, whatever you want.
- **Side-by-side source view** — practice a lick next to the original video on iPad.
- **Waveform markers + A-B loop** — visual lick markers on a shared waveform, loop the hard bar.
- **Sticky left column** — comfortable iPad layout that survives scroll.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- SQLite via Prisma with libSQL adapter
- yt-dlp for YouTube ingestion
- ffmpeg for audio slicing
- Shared utilities from `@music-apps/shared` (youtube-utils, ffmpeg-pitch)

## Run

From the monorepo root:

```bash
npm install
npm run dev:lickbank          # → http://localhost:3001/lickbank
```

To run all music-apps behind one URL:

```bash
~/claude/run-all.sh hub        # apps + proxy at http://localhost:8080
```

## Setup

Copy the example env:

```bash
cp apps/lickbank/.env.example apps/lickbank/.env
```

Then push the Prisma schema:

```bash
cd apps/lickbank
npx prisma db push
```

The SQLite file lives in `data/dev.db` at the monorepo root (gitignored).

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
