# SoundPath

Gain alignment between Helix presets. Load a preset, pick a baseline snapshot, and align every other snapshot to it with per-snapshot dB targets — then load a second preset and align its baseline to the first one's. Deterministic (no LLM anywhere): the aligner only ever touches ChVol, a Boost block's gain, and the Output Block.

<!-- ![SoundPath](screenshots/soundpath.png) -->

## What it does

Two preset slots, side by side:

- **A — baseline preset.** Import a `.hlx` (upload or from the shared presets library). Pick a baseline snapshot; set a dB offset target for every other snapshot. The aligner finds the smallest ChVol + Boost change that hits those targets without touching Drive or tone knobs — auto-enables a bypassed Boost, or inserts one into a free slot if needed.
- **B — preset to align.** Same within-preset flow, plus **Align B to A**: shifts B's Output Block gain so B's baseline snapshot matches A's estimated loudness. Uniform shift — B's internal snapshot-to-snapshot alignment is preserved.

Staged changes show a live predicted loudness landscape before anything is written; **Export** produces a Helix-importable `.hlx` (and drops a copy next to the slot files in the preset dir).

The cross-preset delta is an estimate — it doesn't model cab/IR/voicing differences between presets. Treat the staged value as a starting point and fine-tune by ear with the Output level knob.

## Measure loudness (ground truth vs. the estimator)

The gain estimator *predicts* per-snapshot loudness from the preset JSON — it sums hand-tuned per-block dB models (`packages/gain-estimator/src/blockGain.ts`, ±1–3 dB error per block) and never hears the patch. **Measure** (per-pane button) closes that loop: capture the real output, compute integrated LUFS (ITU-R BS.1770), and see the per-snapshot residual (`measured − estimated`, both relative to snapshot 0; green <1 dB, amber <3 dB, red ≥3 dB).

Two capture paths, both feeding `POST /api/preset/[slot]/measure`:

1. **Upload** (`WAV` button) — a clip recorded anywhere (DAW, the Helix itself). Works over plain HTTP.
2. **Live** (`● Rec` / `■ Stop`) — records off the Helix via `getUserMedia` + an `AudioWorklet` at a pinned 48 kHz, with auto-gain / noise-suppression / echo-cancellation disabled (AGC would corrupt the reading). Needs a secure context: `localhost` directly, or HTTPS (`ngrok http 8080`) from other devices.

Use USB / line-in, not a mic — the estimator models the digital chain (amp + cab IR); a mic adds room coloration it never models. Measurements are stored per slot (`measurements-a.json` / `measurements-b.json` in the preset dir) and cleared when a new preset is imported into that slot.

## Presets library

The library DB (`data/soundpath.db`) is read-only in the UI (import picker). It's fed externally via `POST /api/presets/ingest` — [HelAIx](https://github.com/MrCitron/helaix) pushes its generated presets there.

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4
- `@music-apps/gain-estimator` (shared package): loudness math, alignment, apply pipeline
- Prisma + SQLite for the presets library

## Setup

```bash
cp apps/soundpath/.env.example apps/soundpath/.env
```

Then point `SOUNDPATH_PRESET_DIR` at the folder for your working `.hlx` files (slot files and exports land there). Defaults to `~/Documents/helix-presets/` if unset.

## Run

```bash
npm install
npm run dev:soundpath          # → http://localhost:3004/soundpath
```

## API

| Route | What it does |
|---|---|
| `GET/POST/DELETE /api/preset/[slot]` | Read slot state (loudness estimates, snapshots) / import a preset (multipart `.hlx` or JSON `{ presetId }`) / clear the slot — slot is `a` or `b` |
| `POST /api/preset/[slot]/align` | Compute alignment proposals for baseline + targets (pure, writes nothing) |
| `POST /api/preset/[slot]/preview` | Predicted loudness landscape with staged changes applied |
| `POST /api/preset/[slot]/export` | Apply staged changes and return the patched `.hlx` |
| `GET/POST /api/preset/[slot]/measure` | Read measured-vs-estimated landscape / upload a WAV capture for one snapshot (BS.1770 LUFS) |
| `GET /api/presets`, `GET /api/presets/[id]`, `GET /api/presets/[id]/download` | Read the presets library |
| `POST /api/presets/ingest` | External ingest (HelAIx) |

## Smoke tests

Command-line diagnostics live in `packages/gain-estimator/src/smoke-*.ts`. Each accepts an optional path to a `.hlx`, or reads `SOUNDPATH_PRESET_DIR`, or falls back to the default dir.

```bash
cd packages/gain-estimator
npx tsx src/smoke.ts                          # raw loudness landscape
npx tsx src/smoke-align.ts                    # default-tier alignment plan
npx tsx src/smoke-align-user-targets.ts       # user-targets alignment plan
```

## License

MIT — see [LICENSE](../../LICENSE) at the repo root.
