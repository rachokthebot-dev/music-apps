# SoundPath

Helix LT preset editor + AI-assisted patch designer. Drop in your `.hlx`, visualize the signal chain, align snapshot loudness deterministically, measure real loudness against the estimator, and use Claude / Gemini / a local LLM to design or refine snapshots without leaving the browser.

<!-- ![SoundPath](screenshots/soundpath.png) -->

## What it does

Open a Helix preset exported from HX Edit and use it as a master template with 8 snapshots (Clean / Jazz / Rock / Heavy + matching solos). SoundPath gives you five flows on top of that:

1. **Align Gain** — pick a baseline snapshot, set dB targets for every other snapshot, and the deterministic aligner finds the smallest ChVol + Boost change that hits those targets without touching Drive or tone knobs. Auto-enables a bypassed Boost block or inserts one into a free slot if needed.
2. **Match Song** — give it a song reference; the LLM proposes parameter edits on a single snapshot to match that artist's recorded tone. Live loudness preview before you commit.
3. **Tone Discovery** — give it a vibe ("warm jazz like Wes Montgomery"). It picks an exemplar song first, then patches the snapshot toward that exemplar.
4. **Design Preset** — give it 3 tone descriptions (e.g. one each for jazz / rock / heavy). It generates a full 8-snapshot preset from scratch using the HelAIx catalog of 367 blocks.
5. **Measure** — capture the *real* loudness of each snapshot (ITU-R BS.1770 LUFS) and compare it to what the estimator predicts. See [Measure loudness](#measure-loudness-ground-truth-vs-the-estimator) below.

Plus deterministic helpers: signal-chain visualizer (React Flow + dagre), pending-change staging with live loudness preview, an Output Block "absolute baseline" knob for cross-preset loudness alignment, and a one-click export back to a Helix-importable `.hlx`.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- `@xyflow/react` + `dagre` for the signal chain layout
- `@music-apps/gain-estimator` (shared package): loudness math, preset skeleton, alignment, apply pipeline, and BS.1770 measurement (`loudness/bs1770.ts`, `loudness/wav.ts`)
- Web Audio (`getUserMedia` + `AudioWorklet`) for in-browser live capture
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

## Measure loudness (ground truth vs. the estimator)

The gain estimator *predicts* per-snapshot loudness from the preset JSON — it sums hand-tuned per-block dB models and never hears the patch (`packages/gain-estimator/src/blockGain.ts` admits ±1–3 dB error per block). **Measure** closes that loop: it captures the real output, computes integrated loudness, and shows how far the estimator is off so you can trust (or correct) it.

Open the editor, click **Measure** in the header, and each snapshot row gets a residual:

- **Est. (dB)** — estimator's loudness, relative to snapshot 0.
- **Measured (LUFS)** — integrated loudness of your capture (ITU-R BS.1770).
- **Meas. rel (dB)** — measured loudness relative to snapshot 0.
- **Residual** — `measured − estimated`. Color-coded: green &lt;1 dB, amber &lt;3 dB, red ≥3 dB off. Positive means the snapshot is louder in reality than predicted.

Two capture paths, both feeding the same `POST /api/measure` (WAV in → LUFS out, stored per snapshot in `measurements.json` next to your preset):

1. **Upload** (`WAV` button) — drop in a clip recorded anywhere (DAW, the Helix itself). Works over plain HTTP, so it's fine through the proxy at `192.168.1.18:8080`.
2. **Live** (`● Rec` / `■ Stop`) — records straight off the Helix via `getUserMedia` + an `AudioWorklet`, encodes a WAV in-browser, and uploads it. Pins a 48 kHz context and **disables auto-gain / noise-suppression / echo-cancellation** (AGC would dynamically change gain and corrupt the reading).

### Why USB / line-in, not a mic

The estimator models the *digital* signal chain (amp + cab IR). USB or line-in captures exactly that — the deterministic patch output. A mic in front of a physical cab adds room + speaker coloration the estimator never models, so it calibrates against the wrong target. For a Helix the direct path is the normal one anyway. A mic *can* work for relative snapshot-to-snapshot comparison if mic/room/picking are held constant, but it's noisier — treat it as a fallback.

### Secure-context caveat (live capture only)

`getUserMedia` needs a secure context. **Upload works anywhere; live `● Rec` does not work over plain HTTP from a LAN IP.** To use live capture:

- On the Mac running the Helix, open `http://localhost:3004/soundpath/edit` directly (`localhost` counts as secure), **or**
- front the proxy with HTTPS (`ngrok http 8080`) and use the `https://` URL from any device.

### How to test

1. Plug the Helix into the Mac via USB. In macOS this presents as an audio **input** device.
2. Open `http://localhost:3004/soundpath/edit` (localhost, for live capture) and click **Measure**.
3. Pick the Helix in the **Input** selector. (First `● Rec` triggers a mic-permission prompt.)
4. For each snapshot: select it on the Helix, hit **● Rec**, play a few seconds of full chords, hit **■ Stop**. The row fills in with measured LUFS + residual.
5. To sanity-check without hardware: record/export a WAV in a DAW and use the **WAV** upload button instead.

The measurement engine is unit-tested against BS.1770's calibration property (a 1 kHz tone reads its dBFS RMS in LUFS):

```bash
cd packages/gain-estimator
npm test                                       # bs1770.test.ts (6 cases)
```

> Note: the residual is currently **display-only**. Feeding it back into `blockGain.ts` to auto-correct the per-block models (the `cab()` / Klon / tube-amp constants that have explicit "calibrate later" TODOs) is the planned next step.

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
