# music-apps

> Five web apps for guitarists who like to practice slowly, listen carefully, and own their tools.

I'm a guitar player. I built these because the off-the-shelf options either kept changing their pricing model, lost my data when the company pivoted, or just weren't quite right for how I actually practice. Everything here is **local-first, iPad-ready, free, and yours to fork.**

Together they cover a real practice loop: **find something to learn → slow it down → train your ears → stay in time → dial in your sound.**

```
        Find a song            Pull a lick out
        or a YouTube clip      of any video
                │                    │
                ▼                    ▼
            Shreddy              LickBank ───┐
        practice the song    drill the riff  │
                │                    │       │
                ▼                    ▼       ▼
            Metronome ◄──── ChordCraft ────  SoundPath
        stay in time         train your ear   shape your tone
```

Five apps, one monorepo, one URL behind a local proxy. Use the ones you want.

---

## The apps

### Shreddy — practice the song you can't quite play yet

![Shreddy library](apps/landing/assets/screenshots/shreddy-library.png)

Drop in any MP3 or paste a YouTube URL. Shreddy auto-detects sections (Intro, Verse, Chorus, Solo, etc.), BPM, and key. Then you slow it down — 0.5× to 1.2× without affecting pitch — and loop the hard four bars until your fingers know it.

![Shreddy practice](apps/landing/assets/screenshots/shreddy-practice.png)

Tap a section to loop it. Shift-tap to chain sections. Shift the pitch by 12 semitones in either direction without changing tempo. The metronome syncs to the detected BPM. Your practice time per song is logged so you can see what you've actually been working on. Optimized for iPad Safari — practice on the couch, not at a desk.

[→ Shreddy README](apps/shreddy/README.md)

---

### LickBank — your personal lick library, sourced from YouTube

![LickBank library](apps/landing/assets/screenshots/lickbank.png)

You hear a great phrase in a YouTube cover or lesson and you know you'll forget it by tomorrow. LickBank fixes that. Paste a YouTube URL, set in/out points, save the clip with notes, organize by source and folder.

![LickBank — clip a lick from a video](apps/landing/assets/screenshots/lickbank-extract.png)

The clipped lick sits next to the original video so you can A/B between your slow-loop and the source whenever you want to check your fingering. iPad-friendly side-by-side layout so a tablet is enough for a full session.

[→ LickBank README](apps/lickbank/README.md)

---

### ChordCraft — train your ear on real progressions

![ChordCraft](apps/landing/assets/screenshots/chordcraft.png)

Pick a key. Pick a difficulty (basic triads, 7ths, or extended). Hit play. Name what you hear before the reveal. Twenty-plus built-in progressions covering pop, rock, blues, jazz, country, and folk — plus drums and bass so it sounds like a real song, not piano flashcards. Use this between Shreddy sessions when you're trying to figure out what key a new song is in by ear.

[→ ChordCraft README](apps/chordcraft/README.md)

---

### Metronome — the clean one that doesn't drift on iPad

![Metronome](apps/landing/assets/screenshots/metronome.png)

Web-Audio scheduled (not `setInterval`), so it stays in time even on iPad Safari, which is famously terrible at audio timing. Big BPM readout, tap tempo, 4/4 / 3/4 / 6/8, a timer for focused practice blocks. Nothing else, on purpose.

[→ Metronome README](apps/metronome/README.md)

---

### SoundPath — Helix LT preset editor with AI patch designer

![SoundPath](apps/landing/assets/screenshots/soundpath.png)

For anyone running a Line 6 Helix LT. Drop in a `.hlx` exported from HX Edit and SoundPath visualizes the entire signal chain, measures each snapshot's loudness, and gives you tools HX Edit doesn't:

- **Align Gain** — set a target dB for each snapshot, and SoundPath calculates the smallest ChVol/Boost change to hit it without touching your tone.
- **Match Song** — give it a song reference; Claude/Gemini/local Ollama proposes parameter edits to match that recorded tone.
- **Tone Discovery** — describe a vibe ("warm jazz like Wes Montgomery") and let an LLM pick a song exemplar and patch toward it.
- **Design Preset** — give three tone descriptions, get back a complete 8-snapshot preset from scratch.

Export the result back as a `.hlx` that HX Edit imports directly.

[→ SoundPath README](apps/soundpath/README.md)

---

## How they complement each other

You're not meant to use all five at once. The point is they share enough scaffolding that a session flows naturally:

- **Learning a new song?** Shreddy slows it down, ChordCraft trains the ear for the progression, Metronome holds the click.
- **Stuck on a riff?** LickBank clips it from the original, Shreddy lets you slow-loop it inside its parent song.
- **Tone not right?** SoundPath dials it in for Helix users; Shreddy stays your practice surface.

Same look-and-feel across all of them. One proxy so a single URL on your LAN reaches every app from any device. Shared utilities (YouTube import, ffmpeg pitch, practice stats) so behavior is consistent.

---

## Running it

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

Each app is mounted at `/<slug>` so it composes cleanly behind the proxy below.

### One URL for all apps (optional)

The `proxy/` directory contains a small reverse proxy that fronts every app on port 8080 so a single URL reaches them all via path routing. See [`proxy/README.md`](proxy/README.md).

```bash
~/claude/run-all.sh hub    # all apps + proxy → http://localhost:8080
```

If you want them reachable off your LAN — e.g. an iPad over cellular — point [ngrok](https://ngrok.com) at the proxy: `ngrok http 8080`. Not required.

---

## Packages

| Package | Purpose |
|---|---|
| `packages/shared`         | YouTube import, ffmpeg pitch, practice stats, basepath shim — shared by Shreddy + LickBank |
| `packages/ui`             | Small set of shared components |
| `packages/gain-estimator` | Helix preset loudness math, alignment, apply pipeline — used by SoundPath. Block catalog vendored from [HelAIx](https://github.com/MrCitron/helaix) (MIT). |
| `packages/helix-builder`  | Optional Python build tooling for regenerating preset skeletons. **Not required at runtime.** Depends on phelix (GPL v3) which is not bundled — see [its README](packages/helix-builder/README.md). |

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS v4
- SQLite via Prisma (Shreddy + LickBank)
- Python (librosa + SongFormer) for Shreddy's section detection — local, free, ~30 s/song
- ffmpeg for audio normalization, pitch shifting, slicing
- yt-dlp for YouTube ingestion
- Claude / Gemini / Ollama for the optional LLM flows in Shreddy + SoundPath

## License

[MIT](LICENSE). Take what you want.

## Why this repo exists

I'm a guitar player who builds web apps. I started writing one for my own practice (Shreddy), then needed a place to clip licks (LickBank), then ear training (ChordCraft), then a metronome that didn't drift on iPad, then a way to wrangle my Helix LT presets (SoundPath). Now they share enough scaffolding that they belong in one repo.

If any of this is useful to you, take it. Issues + PRs welcome but I run this on personal time, so responsiveness varies. Known gaps and forward-looking items live in [OPEN.md](OPEN.md).
