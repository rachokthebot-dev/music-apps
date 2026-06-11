# music-apps

A monorepo of guitar-practice web apps I built for myself. Each one is a self-contained Next.js 16 project under `apps/` that shares utilities from `packages/`.

If you're a guitarist who likes building things, the most useful pieces are probably **Shreddy** (song practice) and **SoundPath** (Helix LT preset editor). The rest fills out the toolkit.

## The apps

| App | Path | Port | What it does |
|---|---|---|---|
| [Shreddy](apps/shreddy)       | `apps/shreddy`    | 3000 | Practice songs with AI-detected sections, tempo and pitch control, A-B loops. Optimized for iPad. |
| [LickBank](apps/lickbank)     | `apps/lickbank`   | 3001 | Clip licks from YouTube, organize, practice. |
| [ChordCraft](apps/chordcraft) | `apps/chordcraft` | 3002 | Ear training for chord progressions. |
| [Metronome](apps/metronome)   | `apps/metronome`  | 3003 | A metronome that stays accurate on iPad Safari. |
| [SoundPath](apps/soundpath)   | `apps/soundpath`  | 3004 | Helix LT preset editor + AI patch designer. |

Each app has its own README with setup steps and run commands.

## Running everything

Install once at the root:

```bash
npm install
```

Run any single app:

```bash
npm run dev:shreddy        # http://localhost:3000/shreddy
npm run dev:lickbank       # http://localhost:3001/lickbank
npm run dev:chordcraft     # http://localhost:3002/chordcraft
npm run dev:metronome      # http://localhost:3003/metronome
npm run dev:soundpath      # http://localhost:3004/soundpath
```

Each app is mounted at `/<slug>` (so the URL is `http://localhost:3001/lickbank`, not `/`). The Next config sets `basePath` so it composes cleanly behind the proxy below.

## One URL for all apps (optional)

The `proxy/` directory contains a small reverse proxy that fronts every app on port 8080 so a single URL reaches them all via path routing. See [`proxy/README.md`](proxy/README.md) for the architecture.

```bash
~/claude/run-all.sh hub    # all apps + proxy → http://localhost:8080
```

That's mainly useful for sharing one URL with a phone or iPad on your LAN. If you only run apps individually, you don't need the proxy.

### Exposing it to a phone (also optional)

If you want the apps reachable off your LAN — e.g. an iPad over cellular — point [ngrok](https://ngrok.com) at the proxy:

```bash
ngrok http 8080
```

ngrok is **not** required to run the apps. It's a convenience for one specific setup.

## Packages

| Package | Purpose |
|---|---|
| `packages/shared`         | youtube-utils, ffmpeg-pitch, practice-stats — used by Shreddy + LickBank |
| `packages/ui`             | small set of shared components |
| `packages/gain-estimator` | Helix preset loudness math, alignment, apply pipeline — used by SoundPath. Block catalog vendored from [HelAIx](https://github.com/MrCitron/helaix) (MIT). |
| `packages/helix-builder`  | Optional Python build tooling for regenerating preset skeletons. **Not required at runtime.** See [its README](packages/helix-builder/README.md) — depends on phelix (GPL v3) which is not bundled. |

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS v4
- SQLite via Prisma (Shreddy + LickBank)
- Python (librosa) + Claude Vision for Shreddy's section detection
- ffmpeg for audio normalization, pitch shifting, slicing
- yt-dlp for YouTube ingestion

## License

[MIT](LICENSE).

## Why this repo exists

I'm a guitar player who builds web apps. I started writing one for my own practice (Shreddy), then needed a place to clip licks (LickBank), then ear training (ChordCraft), then a metronome that didn't drift on iPad, then a way to wrangle my Helix LT presets (SoundPath). Now they share enough scaffolding that they belong in one repo.

If any of it's useful to you, take what you want. Issues + PRs welcome but I run this on personal time, so responsiveness varies.
