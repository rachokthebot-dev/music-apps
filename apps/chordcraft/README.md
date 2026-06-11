# ChordCraft

Ear training for chord progressions. Pick a key, hit play, name what you hear.

<!-- ![ChordCraft](screenshots/chordcraft.png) -->

## What it does

- **Random progressions** in any key, drawn from a pool you can edit.
- **Configurable difficulty** — diatonic only, common borrowed chords, or full chromatic.
- **Audible playback** with timing controls.
- **Self-check** — reveal the answer when you're ready.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- Web Audio API for the piano playback (no audio files shipped)

## Run

```bash
npm install
npm run dev:chordcraft         # → http://localhost:3002/chordcraft
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
