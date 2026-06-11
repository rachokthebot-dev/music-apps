# SoundPath

Helix LT preset editor + AI-assisted patch designer. Drop in your `.hlx`, visualize the signal chain, align snapshot loudness deterministically, and use Claude / Gemini / a local LLM to design or refine snapshots without leaving the browser.

<!-- ![SoundPath](screenshots/soundpath.png) -->

## What it does

Open a Helix preset exported from HX Edit and use it as a master template with 8 snapshots (Clean / Jazz / Rock / Heavy + matching solos). SoundPath gives you four flows on top of that:

1. **Align Gain** — pick a baseline snapshot, set dB targets for every other snapshot, and the deterministic aligner finds the smallest ChVol + Boost change that hits those targets without touching Drive or tone knobs. Auto-enables a bypassed Boost block or inserts one into a free slot if needed.
2. **Match Song** — give it a song reference; the LLM proposes parameter edits on a single snapshot to match that artist's recorded tone. Live loudness preview before you commit.
3. **Tone Discovery** — give it a vibe ("warm jazz like Wes Montgomery"). It picks an exemplar song first, then patches the snapshot toward that exemplar.
4. **Design Preset** — give it 3 tone descriptions (e.g. one each for jazz / rock / heavy). It generates a full 8-snapshot preset from scratch using the HelAIx catalog of 367 blocks.

Plus deterministic helpers: signal-chain visualizer (React Flow + dagre), pending-change staging with live loudness preview, an Output Block "absolute baseline" knob for cross-preset loudness alignment, and a one-click export back to a Helix-importable `.hlx`.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- `@xyflow/react` + `dagre` for the signal chain layout
- `@music-apps/gain-estimator` (shared package): loudness math, preset skeleton, alignment, apply pipeline
- HelAIx block catalog (367 entries) for design flows
- LLM providers, in priority order:
  - **Claude** via Claude Code CLI subprocess (uses OAuth, no API key)
  - **Gemini Flash** via REST (set `GEMINI_API_KEY`)
  - **Ollama local** — `gemma-hermes:latest` for Match Song / Tone Discovery, `qwen-coding-fast:latest` for Design Preset

## Setup

```bash
cp apps/soundpath/.env.example apps/soundpath/.env
```

Then point `SOUNDPATH_PRESET_DIR` at the folder containing your `.hlx` files. Defaults to `~/Documents/helix-presets/` if unset. Drop any exported preset in there — SoundPath will pick the first `.hlx` it finds as the master on first run.

## Run

```bash
npm install
npm run dev:soundpath          # → http://localhost:3004/soundpath
```

## Smoke tests

A few command-line diagnostics live in `packages/gain-estimator/src/smoke-*.ts`. Each accepts an optional path to a `.hlx`, or reads `SOUNDPATH_PRESET_DIR`, or falls back to the default dir.

```bash
cd packages/gain-estimator
npx tsx src/smoke.ts                          # raw loudness landscape
npx tsx src/smoke-align.ts                    # default-tier alignment plan
npx tsx src/smoke-align-user-targets.ts       # user-targets alignment plan
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
