# Open items

A living list of what's known-open, deferred, or wanting review across the monorepo. Not bug tracking — issues belong in GitHub Issues. This file is for "context the source code doesn't reveal."

Last reviewed: 2026-07-02

---

## Shreddy

**Recently landed (need review pass):**
- **Deep-practice v1** (branch `feat/integrate-deep-practice-v1`, shipped 2026-06-18, ~1900 lines; **not yet merged to main**). See `docs/plans/2026-06-18-deep-practice-v1-shipped.md`. Bundles: ultra-slow tempo 0.1×–0.4× via server ffmpeg stretch, R5 stems pipeline (Demucs) + mixer, section-transition loop pill, R3 Silent/mental-rehearsal toggle, rotating cue overlay, R6 Distraction overlay, share-with-stems, basePath API-fetch fixes.
- Distraction overlay timer reworked 2026-07-02 — wall-clock ticker that restarts on playhead move; sentence prompts (`DistractionOverlay.tsx`).

**Shipped earlier (reviewed):**
- Bar count per section + time signature, section CSV export, Share Audio File endpoint (`apps/shreddy/src/app/api/songs/[id]/clip/`), and local SongFormer section detection (replaced the old Claude Vision flow in `apps/scripts/analyze.py`).

**Known gaps:**
- SongFormer model (`apps/data/models/songformer/`) is **not bundled in the repo** (~3 GB, gitignored). Need a setup script or docs entry that fetches it. Without the model, section detection will fail at runtime.
- SongFormer emits two `RuntimeWarning: invalid value encountered in divide` lines on every run (modeling_songformer.py:264-265). Sections still come out correctly; warnings are upstream and harmless, but worth filtering or pinning to a version that fixes it.
- iPad Safari audio scheduling: section markers can drift on very long songs (>15 min). Workaround is a re-render on `seek`. Worth a polish pass.
- No automated tests on the export-structure pipeline yet.

---

## LickBank

**Recently landed (need review pass):**
- Sources detail page rewrite (`apps/lickbank/src/app/sources/[id]/page.tsx`, +500 lines)
- Lick detail page rewrite (`apps/lickbank/src/app/licks/[id]/page.tsx`, +414 lines)
- Side-by-side iPad layout for source view

**Known gaps:**
- No README screenshot — the repo lists a placeholder.
- No automated tests on the API routes.

---

## ChordCraft

**Recently landed:**
- Layout + global styles polish.

**Known gaps:**
- No README screenshot.
- Difficulty configuration is hardcoded — would benefit from a settings UI.

---

## Metronome

**Status:** initial public release. Single-file app.

**Known gaps:**
- No README screenshot.
- No `Dockerfile` in repo yet despite the `docker-compose.yml` reference. Either add one or remove the metronome service from compose.

---

## SoundPath

**Recently landed:**
- Gain Targets feature — user-set baseline + per-snapshot dB targets, with structural Boost insertion when the chain doesn't have one. Smoke tests: `packages/gain-estimator/src/smoke-align*.ts`.
- All three primary flows (Match Song, Tone Discovery, Design Preset) wired across Claude / Gemini Flash / local Ollama.
- Output Block "absolute baseline" knob for cross-preset loudness alignment.

**Known gaps:**
- Hardcoded Helix LT topology (5 slots per DSP). Helix Floor / Stadium have more slots; some heuristics would need to widen.
- `GET /api/master` still returns a `alignmentProposals` field computed with DEFAULT_CONFIG that is no longer consumed by the UI — dead payload, harmless but worth dropping.
- `gemma-hermes:latest` for Design Preset exhibited template-token leakage. Currently locked to Gemini/Claude for that flow; a smaller local model retry would be welcome.

---

## Proxy + landing

**Recently landed:**
- Path-based routing for all 5 apps at `:8080`.
- Landing page at `/` listing each app.

**Known gaps:**
- ngrok support is documented but not scripted. Was previously load-bearing in the README; now demoted to optional.
- HelAIx (`http://localhost:3005`) is referenced but lives in a sibling repo not in this monorepo.

---

## helix-builder

- `phelix/` directory is **not bundled** because phelix is GPL v3 and this monorepo is MIT. `build.py` won't run without cloning phelix separately into `packages/helix-builder/phelix/`. See [packages/helix-builder/README.md](packages/helix-builder/README.md).
- For most users, [HelAIx](https://github.com/MrCitron/helaix) is the cleaner MIT-licensed alternative — we already vendor its catalog data into `packages/gain-estimator/data/helaix-catalog.json`.

## Repo / tooling

- No CI yet. A simple "build all apps on push to main" workflow would catch regressions on shared package changes.
- No CONTRIBUTING.md or issue templates.
- Per-app screenshots placeholder in each README; want a coordinated screenshot pass before sharing widely.
- Commit author on existing history is `Rachok <rachok@Rachoks-Mac-mini.local>` — leaks local hostname. Low impact (GH user is `rachokthebot-dev`); rewriting history is heavy and not currently planned.
