@AGENTS.md

# Shreddy

Guitar practice companion web app. Local-first, accessed from iPad on local network.

## Running the app

### Development (local machine only)
```
npm run dev
```
Uses Turbopack by default. Fast hot-reload but **does not work on iPad Safari**.

### Development (iPad / local network access)
```
npx next dev --hostname 0.0.0.0 --webpack
```
Uses Webpack instead of Turbopack. Required for iPad Safari compatibility.

### Production (recommended for iPad use)
```
npm run build && npm start
```
Builds optimized bundle and serves on all network interfaces. Most reliable for iPad access.

### Access from iPad
Open `http://<mac-ip>:3000` in Safari (e.g. `http://192.168.1.41:3000`).

## Tech stack
- Next.js 16.2.1 (async params, async cookies/headers, route.ts handlers)
- React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- SQLite via Prisma 7.x with @prisma/adapter-libsql
- ffmpeg/ffprobe for audio processing
- Python venv (librosa) + Claude Vision API for auto-segmentation

## Key paths
- `prisma/schema.prisma` — data model
- `src/app/page.tsx` — library page
- `src/app/songs/[id]/page.tsx` — practice player
- `src/lib/process-audio.ts` — upload processing pipeline
- `../scripts/analyze.py` — audio analysis + Claude Vision
- `../data/` — SQLite DB, uploads, audio files, settings
