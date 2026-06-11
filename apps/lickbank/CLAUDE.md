@AGENTS.md

# LickBank

Clip, collect, organize, and practice guitar licks from YouTube videos.
Part of the music-apps suite alongside Shreddy.

## Running the app

### Development
```
npm run dev
```

### Development (iPad / local network access)
```
npx next dev --hostname 0.0.0.0 --webpack
```

### Production
```
npm run build && npm start
```

### Access from iPad
Open `http://<mac-ip>:3001/lickbank` in Safari. The `/lickbank` prefix is
required (basePath in `next.config.ts`). Or access all apps via the proxy at
`http://<mac-ip>:8080`. See `../../proxy/README.md`.

## Tech stack
- Next.js 16.2.1, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- SQLite via Prisma 7.x with @prisma/adapter-libsql
- ffmpeg/ffprobe for video/audio processing
- yt-dlp for YouTube download

## Key paths
- `prisma/schema.prisma` — data model (Source, Lick, Folder, Section, etc.)
- `src/app/page.tsx` — lick library
- `src/app/sources/[id]/page.tsx` — clipper view
- `src/app/licks/[id]/page.tsx` — practice player
- `src/lib/youtube-download.ts` — YouTube video download
- `src/lib/extract-clip.ts` — ffmpeg clip extraction
- `../data/` — SQLite DB, source videos, clips
