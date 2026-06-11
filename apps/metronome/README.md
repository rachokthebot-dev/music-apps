# Metronome

A focused metronome. No tempo trainer, no rhythm trainer — just a metronome that sounds right and stays in time on iPad.

<!-- ![Metronome](screenshots/metronome.png) -->

## What it does

- BPM dial with tap tempo.
- Visual beat indicator that stays accurate on iPad Safari (the platform's audio scheduling is finicky).
- Count-in toggle.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- Web Audio API with manual scheduling — `setInterval` is not accurate enough for an audible click.

## Run

```bash
npm install
npm run dev:metronome          # → http://localhost:3003/metronome
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
