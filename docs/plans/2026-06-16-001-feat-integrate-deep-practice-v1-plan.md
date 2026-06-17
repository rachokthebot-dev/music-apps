---
title: Integrate deep-practice techniques v1 (R1 + R3 + R4 + R5 + R6)
type: feat
status: active
date: 2026-06-16
origin: docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md
sandbox_plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md
grading: docs/brainstorms/2026-06-15-shreddy-deep-practice-grading.md
---

# Integrate deep-practice techniques v1

## Enhancement Summary

**Deepened on:** 2026-06-17
**Research agents used:** Web Audio + iPad Safari (Explore), Demucs production pipeline (Explore), time-mapping precision (Explore), background job UI patterns (Explore), architecture-strategist, kieran-typescript-reviewer, julik-frontend-races-reviewer, performance-oracle, code-simplicity-reviewer.

### Key refinements that changed the plan

1. **PR strategy locked: one PR, five revertable commits in order R3 → R4 → R6 → R1 → R5.** Original plan recommended a 3-PR sequence (Option B); simplicity reviewer's "ship as one PR with commit isolation" + architecture reviewer's "commit ordering recovers most of B's safety" + user's stated preference converge. Option B alternative dropped.
2. **R5 reframed: no "stems mode" toggle. Pills are always visible.** When all stems are unmuted, the page plays the original `<audio>` mix (no DSP cost). When any stem is muted, `useSongPlayer` automatically swaps to `StemsEngine`. When all are re-unmuted, swap back to `<audio>`. Eliminates `setStemsEnabled(true/false)` as a user-facing concept; pills become honest mixer faders. Simplicity reviewer's reframe — accepted.
3. **iPad memory risk upgraded from Medium → High/High.** Real PCM math: 4 stems × 63 MB at 44.1 kHz Float32 = **~252 MB per song**, not the 120 MB previously estimated. Three songs back-to-back can cross Safari's ~1.0–1.5 GB per-tab limit → silent renderer crash. Concrete mitigations added: 32 kHz AudioContext (~27% reduction), module-singleton ctx (StrictMode-safe), eager release on song change, `pagehide` listener.
4. **Glitch-free seek pattern specified.** Both `source.stop(when)` and new `source.start(when, offset)` must share the same future `seekCtxTime = ctx.currentTime + 0.02`. Plan previously said "stop all 4, create new, start all 4" — that's the audible naive pattern with ~3-10 ms gap. Fix is a one-line discipline.
5. **GainNodes persist across seek; only BufferSourceNodes recreate.** Plan previously implied both might recreate. Recreating GainNodes loses mute state on every loop wrap.
6. **`useSongPlayer.SongPlayerApi` gains a discriminated `mode: SongPlayerMode` union** per kieran's review. The original `stemsEnabled: boolean + stemMutes` pair lets consumers render against inconsistent snapshots during the loading-stems phase. Mode states: `html | loading-stems | stems | error`.
7. **`useTempoEngine` state machine specified explicitly:** 5-state discriminated union (`idle | rendering | swapping | playing | error`) with monotonic requestId. Sandbox's R1 lessons port verbatim. Plan previously sketched lifecycle in prose only.
8. **`useSourceTime` becomes `useSyncExternalStore`-based**, not a pure-function hook or sibling hook. Tearing-free across `useABLoop`, `useMetronome`, position pill within a single React commit — eliminates the divergent-by-render risk.
9. **`getAudioContext()` shared utility extracted now.** 5 callsites today (`useMetronome` × 2, `useMetronomePattern`, `useStubPlayer`, new `StemsEngine`); the inline `(window as unknown as { webkitAudioContext: typeof AudioContext })` cast actually lies about reality (`webkitAudioContext` is optional). Move to `packages/shared/src/audio-context.ts` as a Phase 1 task.
10. **Pitch route is the anti-pattern, not the target.** New tempo route returns `{ ok: true; filename; cached } | { ok: false; error }` discriminated union with zod validation matching `songs/[id]/route.ts` shape, NOT the existing pitch route's schema-less `{ filename }`.
11. **Demucs facts corrected per research:** htdemucs_ft is *worse* than base htdemucs by 0.15 dB SDR overall (only 0.19 dB better on vocals) at 4× the runtime. Drop the "htdemucs vs htdemucs_ft" tradeoff entirely; ship `htdemucs` and don't mention `_ft` in the plan or in user-facing UX.
12. **Demucs first-run model download surfaced.** `pip install demucs` does NOT download model weights; first `python -m demucs` invocation does (~300-500 MB, 30-120s on home internet). Backfill script needs to communicate this on first run.
13. **Demucs idempotency caveat:** Demucs silently overwrites output files. Backfill script uses temp-dir + atomic rename for crash-safe resumability instead of trusting in-place overwrites.
14. **iOS mute toggle needs 20 ms gain ramp** via `linearRampToValueAtTime`, not direct `.value` assignment. Sub-perceptual transition but kills the click cascade from rapid pill mashing.
15. **rAF-based loop boundary overshoot at 0.10×.** GC pause or backgrounded tab can stall rAF 2+ seconds. At 0.10×, sourceTime advances 200 ms in that stall — bounded; but at 1.0× a 2 s stall = 2 s overshoot. For stems, **schedule loop boundary via `source.stop(seekCtxTime)` + `onended` callback** — sample-accurate. For HtmlAudio engine where this isn't available, add a hard clamp: if overshoot > `1.5 / multiplier` seconds, force seek anyway.
16. **`stemsStatus` renamed to `stemsState` + add `stemsErrorMessage`** per architecture review. `stemsState` reads better when v2 introduces a `StemsJob` table parallel to `ImportJob.status`. Without `stemsErrorMessage`, errors are write-once-to-stderr-only — UI can't surface specifics.
17. **Backfill script tightened:** UUID format guard against SQL string-interpolation surprises, SIGINT trap to reset `processing` rows to `pending` on Ctrl-C, `--dry-run` flag, file-lock at `apps/data/.stems-pipeline.lock` to prevent contention with `processAudio` during user practice.
18. **LRU eviction script lands in v1, not v2.** ~89 MB per song if all 4 sub-0.5× tempos are explored; 500 songs × 89 MB = ~44 GB. Trigger at 20 GB; prune variant files (`_tempo_*`, `_pitch_*`) by atime > 30 days. Never prune base files or `_stem_` files.
19. **`/stems/regenerate` API route CUT.** CLI rerun of `backfill_stems.sh` on a single song is fine for v1 solo dev. Avoids new endpoint + zod schema + UI retry link.
20. **`docs/solutions/` write-ups DEFERRED again.** Same call as the sandbox plan: write them when production usage reveals the actual gotchas worth canonicalizing, not speculatively.

### Implementation phases now collapse to one PR

```
feat/integrate-deep-practice-v1 branch:
├── commit 1: R3 Silent toggle + R6 Distraction overlay (½ day)
├── commit 2: R4 Rhythmic alternation in Metronome app (½ day)
├── commit 3: getAudioContext() + useMetronome ctx.suspend fix + statechange listeners (½ day)
├── commit 4: R1 Ultra-slow tempo (server pipeline + UI + useTempoEngine state machine) (1 day)
├── commit 5a: Demucs pipeline + schema migration + backfill script + LRU eviction (1 day)
├── commit 5b: useSongPlayer + StemsEngine (single AudioContext, 32 kHz, module-singleton) (1.5 days)
└── commit 5c: StemMixer UI + practice page wiring (½ day)
```

Total: **6 days of focused work**, dominated by R5's three commits. Each commit is independently revertable. If R5 commits regress R1/R3/R4/R6, revert just commits 5a-5c.

---

## Overview

Promote five of the seven sandbox techniques into production Shreddy and the Metronome app, based on the user's grading review on 2026-06-15. R2 (backward chaining) is deferred. R7 (tone variation) is cut. The five surviving techniques land as **inline UI elements on the existing surfaces** — not as separate routes — per the user's explicit framing: "I don't want it to be a separate screen, but a UI element on the practice screen."

| Technique | Lands on | Effort |
|---|---|---|
| R1 Ultra-slow tempo | `apps/shreddy/src/app/songs/[id]/page.tsx` — extends `TEMPO_VALUES` | 1 day |
| R3 Mental rehearsal | `apps/shreddy/src/app/songs/[id]/page.tsx` — Silent toggle in header | ½ day |
| R4 Rhythmic alternation | `apps/metronome/src/app/page.tsx` — rhythm pattern picker | ½ day |
| R5 Vocal integration | `apps/shreddy/src/app/songs/[id]/page.tsx` — 4 stem mute pills + new playback engine + Demucs pipeline + DB schema + backfill script | **3–4 days** |
| R6 Distraction overlay | `apps/shreddy/src/app/songs/[id]/page.tsx` — togglable overlay panel with layout fix | ½ day |
| **R2 Backward chaining** | Deferred — code stays on `feat/sandbox-deep-practice` branch | — |
| **R7 Tone variation** | Cut — no pedagogy backing; remove from sandbox before merging | — |

**Total realistic effort: 6–7 days of focused work**, dominated by R5. The user requested one PR (`feat/integrate-deep-practice-v1`), but I'll surface a phasing option in §"Implementation Phases" because the stems work has the most cross-cutting impact and would benefit from review isolation.

## Problem Statement

Shreddy's current practice page optimizes for physical repetition — tempo, pitch, A-B loop, section looping, metronome. It does not address **cognitive flexibility** — the multiple overlapping mental pathways neuroscience identifies as the difference between brittle muscle memory and bulletproof playing. The user spent two days mocking seven techniques in a `/sandbox` route gated by `SHREDDY_SANDBOX=1`, graded them on iPad, and locked in five for v1 integration plus specific UX corrections discovered during grading.

This plan promotes those five into production with the architectural commitments that the sandbox mockups intentionally deferred:

- **R5 specifically** carries the largest cost — real Demucs pipeline integration into the song-import flow, a stems-aware playback engine that replaces parallel `<audio>` tags with `AudioBufferSourceNode`s on a single `AudioContext` clock (the sandbox skirted this with pre-mixed combinations that explicitly do NOT survive to v1), a `stemsStatus` Song field, a backfill script to retroactively process the existing library.
- **R1** ports the existing `packages/shared/src/ffmpeg-stretch.ts` module from sandbox-only to production by adding a sibling `app/api/songs/[id]/tempo/route.ts` mirroring the pitch endpoint shape. The tempo grid extends below 0.5 via server-rendered files (iPad Safari clamps `playbackRate` at 0.5 — confirmed in 2026 builds).
- **R3, R4, R6** are mostly UI ports from the sandbox with small but real engineering caveats (R6 needs a layout-shift fix, R4 needs the metronome app's separate `useMetronome` to gain pattern support, R3 needs the Silent toggle to coexist cleanly with the existing tempo/pitch/A-B/section controls).

See origin: `docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md` for the full per-technique pedagogy backing, the grading rubric, and the rejected alternatives. See `docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md` for the sandbox architecture this plan promotes from.

## Proposed Solution

Five integrations, three risk tiers:

**Tier 1 — low risk, UI-only (R3, R4, R6):** Lift components and hooks from the sandbox; rewire to live on production surfaces. R4 goes to the Metronome app (cleaner separation of concerns per user feedback). R3 + R6 land on the practice page as toggleable overlays/modes that compose cleanly with the existing controls.

**Tier 2 — server pipeline extension (R1):** Promote `packages/shared/src/ffmpeg-stretch.ts` unchanged. Add new route `app/api/songs/[id]/tempo/route.ts` mirroring `pitch/route.ts` shape (and adopting the per-key render lock the pitch route lacks — see learnings §"prior decisions #6"). Extend `TEMPO_VALUES` with `[0.1, 0.2, 0.3, 0.4]` prepended. Introduce a small time-mapping abstraction so section markers, A-B bounds, and the position display read source-time even when the audio element is playing a stretched file.

**Tier 3 — stems engine + Demucs pipeline + DB + backfill (R5):** The architectural commitment, refined by the deepening pass.
- **Pills always visible, no "stems mode" toggle.** Stem mute pills are mixer faders that always appear above the transport when `stemsState === "ready"`. All-stems-on plays the original `<audio>` mix (no DSP cost). First mute toggle automatically swaps engines to `StemsEngine`. Un-muting all stems swaps back to `<audio>`. The user doesn't think in terms of "modes."
- New `useSongPlayer` hook with discriminated `mode: SongPlayerMode` union (`html | loading-stems | stems | error`) — both engines expose the same `sourceTime` / `play` / `pause` / `seek` / `setStemMute` interface so `useABLoop` and `useMetronome` consume it identically, but consumers that genuinely need to know which engine is active (tempo pills, StemMixer) read `mode` discriminator.
- **`StemsEngine` uses a single, module-singleton AudioContext at 32 kHz.** Module-singleton survives React 19 StrictMode double-mount and Next.js navigation. 32 kHz over the default 44.1 kHz drops decoded PCM size by ~27% — meaningful for iPad's tab memory ceiling (see Memory Budget below).
- **GainNodes persist across seeks; only `AudioBufferSourceNode`s recreate.** Sample-locked seek via shared `seekCtxTime = ctx.currentTime + 0.02` for both `stop(seekCtxTime)` and `start(seekCtxTime, srcSec)`.
- **Mute toggles ramp gain over 20 ms** via `linearRampToValueAtTime`, not direct `.value = 0/1` assignment, to kill clicks from rapid pill mashing.
- Demucs runs in the existing fire-and-forget pipeline `processAudio` after SongFormer. New Python script `apps/scripts/separate_stems.py` wraps `htdemucs --mp3 -d cpu -j 4`. ~30–90s per song on M-series. Script uses temp-dir + atomic rename for crash-safe resumability (Demucs silently overwrites otherwise).
- **First-run note:** `pip install demucs` does NOT include model weights; first `python -m demucs` invocation downloads ~300-500 MB and takes 30-120s on home internet. Backfill script prints a "downloading model on first run" warning.
- Prisma: add `stemsState String @default("pending")` AND `stemsErrorMessage String?` to Song (renamed from the original plan's `stemsStatus` per architecture review — sets up future `StemsJob` table cleanly).
- Backfill script `apps/scripts/backfill_stems.sh` iterates all songs where `stemsState IN ("pending", "error")`. Hardened: UUID-format guard, SIGINT trap to reset `processing` rows to `pending`, `--dry-run` flag, file-lock at `apps/data/.stems-pipeline.lock` to prevent contention with `processAudio` during user practice.
- UI: 4 mute pills (Vocals / Drums / Bass / Other) with `all on` default. When `stemsState === "processing"`, pills row shows "Separating stems (~30s)…" with a spinner. When `stemsState === "pending"`, shows "Stems pending — run apps/scripts/backfill_stems.sh". When `stemsState === "error"`, shows error message inline (no retry button — re-run backfill from CLI per v1 simplification).
- **Tempo + pitch controls disable when StemsEngine is active.** Inline note next to the disabled controls (NOT a hover tooltip — iPad doesn't render those): "Slow tempo turns off when stems are muted." User can un-mute all stems to restore tempo control. v2 unlocks composition via pre-rendered per-stem tempo variants. The disable is correctness, not workaround.

**Quality gate added per user requirement:** Every acceptance criterion verifies through the **public ngrok URL on a production build** (`npm run build && npm start`), not just local dev. The repeated failures during sandbox grading came from dev-mode + ngrok interaction (Webpack HMR WebSocket 503s, Basic Auth subresource quirks). Production build eliminates HMR; `PROXY_OPEN=1` (already committed) eliminates the auth interaction. The plan's success criteria explicitly require an end-to-end ngrok test pass.

## Technical Approach

### Memory Budget (iPad Safari, post-deepening)

Real PCM math for stems decoded at 32 kHz Float32 stereo (the v1 choice):

```
1 stem  = duration_sec × 32000 samples/sec × 2 channels × 4 bytes/sample
        = ~46 MB per 3-min stem
4 stems = ~184 MB per song

At default 44.1 kHz: 4 stems = ~252 MB per song (the cost we're avoiding)

iPad Safari per-tab budget: ~1.0-1.5 GB before renderer kill
```

**Mitigations baked into `StemsEngine` design:**

1. **Module-singleton AudioContext** at 32 kHz, created lazily on first user gesture. Reused across all songs in the session. StrictMode-safe.
2. **Synchronous buffer release on song-change.** Effect cleanup nulls all 4 `AudioBuffer` refs, disconnects all 4 BufferSourceNodes (in stop → disconnect order), disconnects GainNodes from master gain, then calls `ctx.suspend()`. Three songs back-to-back never exceed ~200 MB of decoded buffer memory.
3. **`pagehide` listener** in addition to `visibilitychange`. iOS bfcache will freeze the page; pagehide is the last synchronous moment to release buffers before suspension.
4. **`AbortSignal.timeout(3000)` on stem fetches** so failures don't pile up open requests when the user is on a flaky connection.
5. **No eager decode.** Stems decode only when user toggles the first mute pill — until then, the page plays the original `<audio>` mix and stems memory is 0.
6. **Cap stem fetches at song change.** If user navigates from Song A (decoded) to Song B mid-decode, the new effect's `AbortController.abort()` kills A's in-flight decode before B's begins.

### TypeScript Conventions

All new code in this v1 follows:

- **Discriminated unions for all hook states.** No `string | null` for errors, no `boolean + boolean + boolean` for state combinations. State variants carry only the fields valid in that state. Pattern: `useTempoEngine` 5-state union, `useSongPlayer` 4-state mode union, `SongPlayerException.info` 4-kind error union.
- **`as const` for literal-union enums.** Shared types extracted to `packages/shared/src/` with type derived via indexed access (`(typeof STEM_NAMES)[number]`).
- **Refs for prop-mirrors in `setInterval` / `requestAnimationFrame` callbacks.** Pattern locked by `useMetronome.ts:43-52` (`bpmRef`, `volumeRef`, `tempoRef`). Applies to `useMetronome`'s new `sourceTime` prop: mirror into `sourceTimeRef.current` on every render; **do NOT add `sourceTime` to the scheduler effect's deps array.**
- **`useSyncExternalStore` for external mutable reads.** Specifically for `useSourceTime` — guarantees all consumers see the same `sourceTime` within a single React commit. Eliminates inline-divide tearing across `useABLoop` / `useMetronome` / position pill.
- **Zod at every new API route edge.** Match `songs/[id]/route.ts` pattern. The pitch route's schema-less shortcut is the anti-pattern.
- **Discriminated-union response shapes** for new API routes: `{ ok: true; ...data } | { ok: false; error: string }`. Lets client `switch` on `.ok` for type narrowing.

### Architecture

#### R1 — Ultra-slow tempo (sub-0.5× server-rendered)

```
apps/shreddy/src/app/songs/[id]/page.tsx:89
- const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
+ const TEMPO_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

apps/shreddy/src/hooks/useTempoEngine.ts (NEW, ~80 lines)
// State as discriminated union — race-safe under rapid tempo picks
export type TempoEngineState =
  | { kind: "idle"; multiplier: number }                                         // live playbackRate (>= 0.5)
  | { kind: "rendering"; multiplier: number; requestId: number }                 // POST in flight, AbortController bound
  | { kind: "swapping"; multiplier: number; filename: string }                   // audio.src set, awaiting loadedmetadata
  | { kind: "playing"; multiplier: number; filename: string | null }             // null = live path
  | { kind: "error"; multiplier: number; reason: "render-failed" | "swap-failed"; cause?: unknown };

export interface UseTempoEngineApi {
  state: TempoEngineState;
  setTempo: (multiplier: number) => void;
  retry: () => void;  // explicit retry from "error" state
}

// Implementation pattern:
// - useReducer (NOT useState) — five-state machine with concurrent transitions
// - tempo >= 0.5: audio.playbackRate = tempo (live, pitch-preserved by Safari)
// - tempo < 0.5: POST /api/songs/[id]/tempo, swap audio.src to rendered file, restore currentTime
// - Monotonic requestId in dispatched action (mirrors useStubPlayer.swapSrc:73,93)
// - AbortController on every fetch, aborted on subsequent setTempo
// - During "swapping" state, useSourceTime returns last known good sourceTime (audio.currentTime is garbage between src set and loadedmetadata on iPad)
// - preservesPitch = true re-applied AFTER loadedmetadata fires (Safari order-sensitivity)

apps/shreddy/src/app/api/songs/[id]/tempo/route.ts (NEW)
- POST { multiplier: 0.1 - 0.5 } → returns { ok, filename } (mirrors pitch route shape but with
  zod validation matching songs/[id]/route.ts, NOT the pitch route's schema-less shortcut)
- Per-key in-memory render lock (Map<string, Promise<string>>) prevents concurrent ffmpeg runs
  for the same key (R5.1 from the sandbox's tempo route is the canonical pattern; pitch route
  lacks this — flagged in learnings §6)
- Delegates to stretchTempo() from packages/shared/src/ffmpeg-stretch.ts (UNCHANGED — already
  written and tested in sandbox, just gains a new caller)
- Cache lands at AUDIO_DIR/<songId>_tempo_<NNN>.mp3 alongside existing pitch variants

packages/shared/src/ffmpeg-stretch.ts (PROMOTED FROM SANDBOX — no changes needed)
- Tries rubberband filter if compiled, falls back to chained atempo
- Filename: ${entityId}_tempo_${tag}.mp3 where tag = padStart(3, "0") (e.g. _tempo_010.mp3)

apps/shreddy/src/hooks/useSourceTime.ts (NEW small utility)
- For tempo < 0.5: audio.currentTime is in the stretched file's timeline (e.g. 0.3x file is
  3.33× longer than source). Section markers and A-B bounds are in SOURCE time.
- Hook returns { sourceTime, sourceDuration, mapToFileTime(srcSec), mapToSrcTime(fileSec) }
  given { audio, multiplier }
- All consumers (useABLoop loop boundary check, section overlap detection, position pill
  display, bookmark save) read sourceTime instead of audio.currentTime directly
```

**Why the time-mapping matters:** The existing pitch shifter uses `asetrate + atempo` which preserves duration — audio.currentTime stays in source time. Ultra-slow tempo via `atempo` alone changes duration: a 70s source at 0.10× becomes a 700s file. Section markers say "Verse from 14.76s to 34.8s" in source time. If we don't map, the Verse appears at 147.6s–348s in the stretched file's timeline, and the section strip / A-B bounds / "now playing" pill all break.

#### R3 — Silent toggle

```
apps/shreddy/src/app/songs/[id]/page.tsx
+ const [silent, setSilent] = useState(false);
+ <SilentToggle value={silent} onChange={setSilent} /> in header (between session-clock and re-analyze)

When silent === true:
  audio.volume = 0  (preserves currentTime, sections still highlight)
  metronome.enabled = true (forces on if it was off)
  CueOverlay component (new) shows rotating prompts every 8 bars from
    apps/shreddy/src/components/CueOverlay.tsx (NEW, ~30 lines)

apps/shreddy/src/components/SilentToggle.tsx (NEW, ~15 lines)
- Toggle pill in the header. Shows "Silent" with a small moon icon when active.
- Tooltip: "Audio off — metronome + visualization only. Mental rehearsal mode."
```

**No engine changes needed.** Audio keeps playing (so section progress + A-B loop continue to work), just muted. Metronome forced on. Cue overlay reuses the rotation from `apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx:13-23` (6-prompt array).

#### R4 — Rhythmic alternation (Metronome app)

```
apps/metronome/src/hooks/useMetronome.ts (existing, MODIFY)
+ Add pattern: MetronomePattern = "straight" | "dotted-forward" | "dotted-reverse" | "triplet"
+ In startScheduler at lines 170-207, replace fixed beat interval with subdivision offsets
  from PATTERN_OFFSETS table (lifted from apps/shreddy/src/hooks/useMetronomePattern.ts:25-30)

apps/metronome/src/app/page.tsx (MODIFY)
+ const [pattern, setPattern] = useState<MetronomePattern>("straight");
+ <RhythmPicker value={pattern} onChange={setPattern} /> in controls row at lines 214-241
  (currently holds time-signature + tap)

apps/metronome/src/components/RhythmPicker.tsx (NEW, ~25 lines)
- 4-button row: Straight | ♩.♪ | ♪♩. | ♪♪♪ (Unicode music glyphs)
- Active state matches existing time-signature pill style

Persistence: extend the localStorage settings object at apps/metronome/src/app/page.tsx:59-78
{ bpm, timeSigIndex, timerSeconds }  →  { bpm, timeSigIndex, timerSeconds, pattern }
```

**Why this stays in the Metronome app and not Shreddy:** Per user grading feedback — the Metronome app already owns BPM + tap-tempo + time signature. A rhythm pattern picker fits the same mental model. Pushing it into Shreddy's practice page would crowd the already-busy transport with another mode dimension that's orthogonal to song practice.

#### R5 — Vocal integration (stems)

The largest commitment. Three subsystems:

**1. Demucs pipeline integration**

```
apps/scripts/separate_stems.py (NEW, ~50 lines)
- Wraps: python -m demucs -n htdemucs --mp3 --mp3-bitrate 192 -d cpu -j 4 --out <outDir> <src>
- Flattens output from <outDir>/htdemucs/<basename>/{vocals,drums,bass,other}.mp3
  to AUDIO_DIR/<songId>_stem_<name>.mp3
- Exit code + stderr propagation so process-audio.ts can detect failure

apps/shreddy/src/lib/process-audio.ts (MODIFY at line ~247, after SongFormer completes)
+ try {
+   await prisma.song.update({ where: { id: songId }, data: { stemsStatus: "processing" } });
+   await execFileAsync(PYTHON_BIN, [STEMS_SCRIPT, audioPath, songId, AUDIO_DIR], { timeout: 600000 });
+   await prisma.song.update({ where: { id: songId }, data: { stemsStatus: "ready" } });
+ } catch (err) {
+   await prisma.song.update({ where: { id: songId }, data: {
+     stemsStatus: "error",
+   }});
+   // do NOT throw — stems failure should not fail the song import
+ }
- Stems run AFTER SongFormer because they're heavier and the user can start practicing without
  stems while they generate.
```

**2. Playback engine — `useSongPlayer` abstraction**

```
apps/shreddy/src/hooks/useSongPlayer.ts (NEW, ~200 lines)
- Two internal implementations behind one interface:
  - HtmlAudioEngine: wraps existing <audio> element. Active when ALL stems are unmuted (or stems not ready).
  - StemsEngine: wraps single module-singleton AudioContext + 4 AudioBufferSourceNodes + 4 GainNodes.
    Auto-activated when first stem mute toggle flips. Auto-deactivated when all are unmuted again.

// Shared types from packages/shared/src/stems.ts
import { STEM_NAMES, type StemName, type StemMutes, type StemsState } from "@music-apps/shared";

export type SongPlayerMode =
  | { kind: "html"; ready: boolean }                                       // running on <audio> element
  | { kind: "loading-stems" }                                              // mute toggle triggered, decode in flight
  | { kind: "stems"; mutes: StemMutes }                                    // running on StemsEngine
  | { kind: "error"; reason: "decode" | "network" | "autoplay-denied" | "stems-missing"; cause?: unknown };

export interface SongPlayerApi {
  mode: SongPlayerMode;
  sourceTime: number;                                  // always song-source seconds, regardless of engine
  sourceDuration: number;
  playing: boolean;
  play: () => Promise<void>;                           // Rejects with SongPlayerException on autoplay denial or decode failure
  pause: () => void;
  seek: (srcSec: number) => void;                      // glitch-free: shared seekCtxTime for stop()+start()
  setStemMute: (stem: StemName, muted: boolean) => void;  // 20ms linearRampToValueAtTime, no clicks
}

// Tagged error for play() rejection — consumer switches on err.info.kind
export class SongPlayerException extends Error {
  constructor(public readonly info:
    | { kind: "autoplay-denied" }
    | { kind: "decode-failed"; stem?: StemName; cause: unknown }
    | { kind: "network"; cause: unknown }
    | { kind: "stems-missing" }
  ) { super(`SongPlayer: ${info.kind}`); }
}
- StemsEngine specifics (per learnings §1 + §13):
  - One AudioContext (lazy-init in tap handler), webkitAudioContext fallback
  - Decode 4 stem mp3s into AudioBuffers on enable (preload metadata, then arrayBuffer + decodeAudioData)
  - 4 AudioBufferSourceNode → 4 GainNode → master GainNode → destination
  - play() = start all 4 nodes simultaneously at the chosen offset
  - pause() = ctx.suspend()
  - seek() = stop all 4, create 4 new nodes, schedule with offset = srcSec
  - setStemMute(stem) = gainNodes[stem].gain.value = muted ? 0 : 1
  - visibilitychange + ctx.onstatechange listeners reset sourceTime tracking on resume
  - Unmount: ctx.suspend() (NOT close — preserves slot per learnings §3)
  - Decoded buffers released via array-clear on unmount

- HtmlAudioEngine wraps current <audio> behavior identically to today's practice page:
  - audio.currentTime drives sourceTime
  - audio.playbackRate handles tempo >= 0.5
  - audio.src swaps handle pitch + ultra-slow tempo (with time-remap from useSourceTime)

apps/shreddy/src/hooks/useABLoop.ts (small MODIFY)
- Today reads no audio directly. The page's rAF loop at songs/[id]/page.tsx:526-559 reads
  audio.currentTime to enforce loop bounds. That rAF moves into useSongPlayer.
- Page passes useSongPlayer.sourceTime to useABLoop unchanged; useABLoop stays pure.
- No behavioral change to useABLoop itself.

apps/shreddy/src/hooks/useMetronome.ts (small MODIFY)
- Currently reads audioRef.current.currentTime at line 129 for beat sync.
- Change to consume a sourceTime number prop instead of audioRef directly.
- Page passes useSongPlayer.sourceTime.
- Required side-effect: fix the visibilitychange + ctx.onstatechange gap (existing TODO per
  plan line 196 — bring in the pattern from useMetronomePattern.ts:91-104).
- Also: switch ctx.close() at line 276 to ctx.suspend() per learnings §3.
```

**3. Stems UI on the practice page**

```
apps/shreddy/src/app/songs/[id]/page.tsx — between the waveform (line 1019) and transport (line 1022)
+ <StemMixer
+   stemsStatus={song.stemsStatus}
+   enabled={stemsEnabled}
+   mutes={stemMutes}
+   onToggleEnabled={setStemsEnabled}
+   onToggleMute={setStemMute}
+ />

apps/shreddy/src/components/StemMixer.tsx (NEW, ~60 lines)
- Row of 4 pills: Vocals / Drums / Bass / Other
- Each pill: muted = bg-destructive/15 border-destructive/40 text-destructive (matches sandbox R5)
- States:
  - song.stemsStatus === "ready" + enabled: 4 active pills
  - song.stemsStatus === "ready" + !enabled: collapsed strip with "Enable stems" link
  - song.stemsStatus === "processing": "Separating stems… (~30s)" + spinner, no pills
  - song.stemsStatus === "pending": "Stems pending — run apps/scripts/backfill_stems.sh"
  - song.stemsStatus === "error": "Stems failed: <error>" + retry link → POST /api/songs/[id]/stems/regenerate
- iPad: full-width row matching existing tempo-pills row pattern from page.tsx:1027-1041
```

**Demucs backfill** (per user instruction "After done run demucs on all songs")

```
apps/scripts/backfill_stems.sh (NEW)
#!/usr/bin/env bash
# Iterates over all Songs with stemsStatus ∈ {"pending", "error"}, runs the stems pipeline,
# updates the DB row. Idempotent; safe to interrupt and resume. Logs progress.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$REPO_ROOT/apps/.venv-sf/bin/python"
DB="$REPO_ROOT/apps/data/dev.db"

# Find pending songs via sqlite directly (faster than spinning up Prisma)
PENDING=$(sqlite3 "$DB" "SELECT id FROM Song WHERE stemsStatus IN ('pending', 'error') AND processingStatus = 'ready';")
TOTAL=$(echo "$PENDING" | wc -l | xargs)
echo "[backfill] $TOTAL songs to process. Approx. $((TOTAL * 60)) seconds total."

i=0
for songId in $PENDING; do
  i=$((i + 1))
  echo "[backfill] $i/$TOTAL: $songId"
  sqlite3 "$DB" "UPDATE Song SET stemsStatus = 'processing' WHERE id = '$songId';"
  if "$PY" "$REPO_ROOT/apps/scripts/separate_stems.py" "$REPO_ROOT/apps/data/audio/${songId}.mp3" "$songId" "$REPO_ROOT/apps/data/audio"; then
    sqlite3 "$DB" "UPDATE Song SET stemsStatus = 'ready' WHERE id = '$songId';"
  else
    sqlite3 "$DB" "UPDATE Song SET stemsStatus = 'error' WHERE id = '$songId';"
  fi
done
echo "[backfill] done."
```

User invokes once after merge: `bash apps/scripts/backfill_stems.sh`. Output is tail-able; safe to interrupt (any incomplete row will be `processing` and the next run re-picks it via a small modification, or the user resets it to `pending` manually).

#### R6 — Distraction overlay

```
apps/shreddy/src/app/songs/[id]/page.tsx
+ const [distractionOpen, setDistractionOpen] = useState(false);
+ <DistractionToggle value={distractionOpen} onChange={setDistractionOpen} /> in header
+ {distractionOpen && <DistractionOverlay onClose={() => setDistractionOpen(false)} />}

apps/shreddy/src/components/DistractionOverlay.tsx (NEW, port from sandbox)
- Lift from apps/shreddy/src/app/sandbox/distraction/page.tsx (lines 48-244 — the body, not the
  page wrapper or the SandboxHeader).
- Two real fixes per user feedback:
  1. INTERVAL options become [1, 3, 5, 10] (sandbox had [3, 5, 10]).
  2. Fixed-height container so distractor character changes do NOT reflow surrounding UI.
     Wrap the distractor display in `<div className="h-56 ...">` with the actual content
     absolute-positioned inside. The mode/interval pickers and stats panels live outside
     this fixed-height region.
- Williamon & Valentine 2002 skill-level warning banner preserved verbatim.
- Renders as a fixed-position overlay below the transport so the user can still see the
  song's section progress and waveform.
```

### Implementation Phases

**Locked after deepening: one PR with five revertable commits.** Branch: `feat/integrate-deep-practice-v1`. Commits land in dependency order — R3 + R4 + R6 first (no engine touch), then R1 (no stems touch), then the R5 architectural commitments. Each commit is independently revertable if review finds a regression. The 3-PR alternative from the original draft was dropped during the deepening pass because the simplicity reviewer's "commit-order isolation recovers most of B's safety" + architecture reviewer's same conclusion + user's stated preference for one PR all converge.

**Commit order:**

1. `feat(shreddy): R3 silent toggle + R6 distraction overlay` (½ day)
2. `feat(metronome): R4 rhythmic alternation pattern picker` (½ day)
3. `refactor(shared): getAudioContext util + useMetronome ctx.suspend + statechange listeners` (½ day — bundled here so all downstream audio code uses the right pattern)
4. `feat(shreddy): R1 ultra-slow tempo (server pipeline + state machine + useTempoEngine)` (1 day)
5a. `feat(shreddy): stems pipeline + schema migration + backfill script + LRU eviction` (1 day)
5b. `feat(shreddy): useSongPlayer + StemsEngine (single 32 kHz ctx, module-singleton)` (1.5 days)
5c. `feat(shreddy): StemMixer pills + practice page wiring` (½ day)

**Total: 6 days of focused work.** If review finds the StemsEngine architecture problematic, revert commits 5b + 5c and ship the remaining four. Pipeline + schema (5a) is harmless to keep — stems generate in the background, UI just doesn't surface them yet.

#### Phase 1 — Foundation (R3, R4, R6, tempo-grid UI) — 1.5 days

**Tasks**
- [ ] Modify `apps/metronome/src/hooks/useMetronome.ts` — add `pattern` prop, replace fixed beat scheduling with subdivision offsets table.
- [ ] Add `apps/metronome/src/components/RhythmPicker.tsx` — 4-button row with Unicode glyphs.
- [ ] Modify `apps/metronome/src/app/page.tsx` — wire RhythmPicker into controls row, extend localStorage settings.
- [ ] Add `apps/shreddy/src/components/SilentToggle.tsx` — pill component for the practice header.
- [ ] Add `apps/shreddy/src/components/CueOverlay.tsx` — rotating cue prompts (lift array from sandbox).
- [ ] Modify `apps/shreddy/src/app/songs/[id]/page.tsx` — add `silent` state, audio.volume gate, CueOverlay render gate, SilentToggle in header.
- [ ] Port `apps/shreddy/src/app/sandbox/distraction/page.tsx` body → `apps/shreddy/src/components/DistractionOverlay.tsx`. Add 1s interval. Wrap distractor in fixed-height container with absolute-positioned content.
- [ ] Add `apps/shreddy/src/components/DistractionToggle.tsx` for the header.
- [ ] Modify `apps/shreddy/src/app/songs/[id]/page.tsx` — add distractionOpen state + render DistractionOverlay overlay.
- [ ] Modify `TEMPO_VALUES` at `apps/shreddy/src/app/songs/[id]/page.tsx:89` — prepend `[0.1, 0.2, 0.3, 0.4]`. The UI grid will need to be a 2-row layout for 12 pills on phone screens.

**Success criteria**
- Metronome app renders rhythm picker; tapping changes the click pattern audibly.
- Practice page silent toggle mutes audio while leaving section progress + metronome running.
- Distraction overlay shows distractors at 1s/3s/5s/10s intervals without surrounding UI reflowing.
- Tempo grid shows 12 pills (4 server-rendered + 8 live), but the server-rendered ones don't work yet — that's Phase 2.

**Estimated effort:** 1.5 days

#### Phase 2 — Server-side tempo pipeline (R1) — 1 day

**Tasks**
- [ ] Add `apps/shreddy/src/app/api/songs/[id]/tempo/route.ts` — zod validation, per-key render lock, calls `stretchTempo`.
- [ ] Update `packages/shared/src/index.ts` — verify `stretchTempo` is already exported (it is — line 6-11).
- [ ] Add `apps/shreddy/src/hooks/useTempoEngine.ts` — replaces tempo branch of `usePitchShifter`. For `tempo >= 0.5`, sets `audio.playbackRate`. For `tempo < 0.5`, POSTs to the new route, swaps `audio.src`, restores currentTime, re-applies preservesPitch after loadedmetadata.
- [ ] Add `apps/shreddy/src/hooks/useSourceTime.ts` — small utility for time-mapping.
- [ ] Modify `apps/shreddy/src/app/songs/[id]/page.tsx` — consume useTempoEngine alongside usePitchShifter; pipe currentTime through useSourceTime for section/loop detection.
- [ ] Modify `apps/shreddy/src/hooks/useABLoop.ts` — accept `sourceTime` prop instead of reading audio directly (small surface change; loop math unchanged).

**Success criteria**
- Pick 0.30× on a real song → audio plays at 0.30× speed, pitch preserved, file lands in `apps/data/audio/<songId>_tempo_030.mp3`.
- Pick 0.30× a second time → response is `cached: true`, no ffmpeg invocation.
- Pick 0.30× then 0.10× before 0.30× completes → final audio is 0.10× (monotonic requestId pattern working).
- Section markers and A-B loop bounds still match the music at 0.30× (time-mapping working).

**Estimated effort:** 1 day

#### Phase 3 — Stems engine + pipeline + DB (R5) — 3–4 days

This is the largest phase by far. Breaking it into sub-phases:

##### Phase 3a — Pipeline + DB (1 day)

- [ ] Add `apps/scripts/separate_stems.py` — Demucs wrapper, output flattening.
- [ ] Modify `apps/shreddy/prisma/schema.prisma` — add `stemsStatus String @default("pending")` to Song.
- [ ] Generate Prisma migration `20260616_add_stems_status`. The migration backfills "pending" for existing rows; no data loss.
- [ ] Run `npx prisma migrate dev` and verify schema updates.
- [ ] Modify `apps/shreddy/src/lib/process-audio.ts` — after SongFormer (line ~247), kick off stems. Set `stemsStatus = "processing"` → `"ready"` | `"error"`. Stems failure does NOT propagate to song import failure.
- [ ] Add `apps/scripts/backfill_stems.sh` — iterates pending songs, runs pipeline, updates DB.
- [ ] Smoke test: upload a new song, watch logs, verify `apps/data/audio/<songId>_stem_{vocals,drums,bass,other}.mp3` lands on disk after ~30–90s.

##### Phase 3b — Playback engine refactor (1.5 days)

- [ ] Add `apps/shreddy/src/hooks/useSongPlayer.ts` — unified interface, dual engines.
- [ ] Implement `HtmlAudioEngine` (port from current practice-page audio lifecycle at `songs/[id]/page.tsx:435-559`).
- [ ] Implement `StemsEngine` (single AudioContext + 4 AudioBufferSourceNodes + GainNodes).
- [ ] Wire visibilitychange + ctx.onstatechange listeners on StemsEngine.
- [ ] Fix `useMetronome.ts` while we're touching audio plumbing: add visibility/state listeners (lift from `useMetronomePattern.ts:91-104`), switch `ctx.close()` to `ctx.suspend()` on unmount.
- [ ] Modify `useMetronome` to consume a `sourceTime: number` prop instead of `audioRef.current.currentTime`.
- [ ] Modify `useABLoop` likewise.
- [ ] Modify `apps/shreddy/src/app/songs/[id]/page.tsx` — replace the imperative `<audio>` lifecycle (lines 435-486) with `useSongPlayer`. Replace the rAF loop (lines 526-559) with useSongPlayer-internal handling.

##### Phase 3c — UI surface (½ day)

- [ ] Add `apps/shreddy/src/components/StemMixer.tsx` — 4 mute pills + status-aware display.
- [ ] Modify `apps/shreddy/src/app/songs/[id]/page.tsx` — render `<StemMixer>` between waveform and transport. Wire `stemsEnabled` + `stemMutes` state.
- [ ] When stems mode is active: disable tempo + pitch controls with explanatory tooltip (v1 simplification — see Outstanding Questions §R5.1).
- [ ] Add `apps/shreddy/src/app/api/songs/[id]/stems/regenerate/route.ts` — POST handler that retries stems for an errored song.

**Success criteria for Phase 3**
- Upload a fresh song → after song's processingStatus = "ready", stems status transitions pending → processing → ready (~30–90s) via background pipeline.
- StemMixer shows "Separating stems…" while processing, then 4 pills when ready.
- Toggle stems on → audio re-routes to StemsEngine, currentTime preserved across the swap.
- Mute Vocals → vocals stem gain → 0, no clock drift between remaining 3 stems on iPad.
- Pause + seek + resume work identically across HtmlAudioEngine and StemsEngine.
- Backfill script runs to completion over all existing songs in the library.

**Estimated effort:** 3 days (1 + 1.5 + 0.5)

#### Phase 4 — Cut R7 + remove sandbox R7 — ½ day

- [ ] Remove `apps/shreddy/src/app/sandbox/tone-variation/page.tsx`.
- [ ] Remove `song-a_tone_*.mp3` from `apps/data/sandbox/` (gitignored, harmless cruft otherwise).
- [ ] Update `apps/shreddy/src/app/sandbox/page.tsx` index — remove the R7 tile.
- [ ] Update `OPEN.md` to note R7 was cut per user feedback during grading.

#### Phase 5 — Ngrok + production-build verification (½ day)

- [ ] Run `npm run build:shreddy` and `npm run build:metronome` — confirm both compile clean.
- [ ] Start production builds: `npm run start --workspace=apps/shreddy` + `npm run start --workspace=apps/metronome`.
- [ ] Start proxy + ngrok (existing tunnel at `riot-negligent-lasso.ngrok-free.dev` per session, with `PROXY_OPEN=1` for the cookie-skip flow).
- [ ] Run the §"Integration Test Scenarios" checklist end-to-end through the public URL on iPad Safari. Every test must pass before PR opens.

#### Phase 6 — Backfill the library — runtime hour(s), not engineering time

After merge: `bash apps/scripts/backfill_stems.sh`. With ~118 mp3 files in `apps/data/audio/` and ~30–60s per song, expect ~1–2 hours of wall-clock CPU time on the Mac. User runs this once; subsequent uploads get stems automatically via the modified `processAudio`.

## Alternative Approaches Considered

- **Keep R5 stems UX on its own /stems route** — rejected by user. Wants inline UI element on practice page.
- **Promote `<audio>` element approach for stems (4 parallel `<audio>` tags)** — rejected. Drifts 200–500ms / 4 min on iPad Safari per learnings §1.
- **Pre-mix the 8 stem combinations server-side and swap audio.src** (the sandbox approach) — rejected. Plan §"R5" line 149 + learnings §13 explicitly call this out as mockup-only; it does not scale (combinatorial cost per song) and doesn't compose with future per-stem features (volume, pitch, etc.).
- **Add SoundTouchJS phase vocoder for client-side pitch-preserving tempo when stems are on** — deferred to v2. No prior art in the codebase (learnings §2); adds new dependency + DSP complexity to a v1 already at 6–7 days.
- **Pre-render tempo variants per stem (4 stems × N tempos = 4N files)** — deferred. Adds storage and ffmpeg work for a feature (tempo + stems compose) that grading didn't even test (stems mode wasn't on grading songs at non-default tempo).
- **Re-use `usePitchShifter` for tempo by extending it** — rejected. Tempo and pitch are different concepts; better to keep them as sibling hooks (`useTempoEngine` + `usePitchShifter`) and possibly extract a shared `useServerRenderedVariant` helper in v2.
- **Single-PR merge** — surfaced as Option A in §"Implementation Phases" but my recommendation is the 3-PR sequence (Option B) for review isolation. User to decide.
- **Use the dev server for ngrok grading after merge** — rejected per user requirement and per learnings §"iPad Safari gotchas" (Webpack HMR WebSocket loop is incompatible with the cookie + ngrok flow). Production build only.

## System-Wide Impact

### Interaction Graph

Pipeline (background) — song upload triggers:
```
POST /api/uploads
  ↓
processAudio (background, no await)
  ↓ Song.processingStatus = "processing"
ffmpeg normalize → AUDIO_DIR/<songId>.mp3
  ↓
SongFormer analyze.py → Song.bpm, musicalKey, beatTimestamps + Sections
  ↓ Song.processingStatus = "ready"
  ↓ Song.stemsStatus = "processing"
separate_stems.py → AUDIO_DIR/<songId>_stem_{vocals,drums,bass,other}.mp3
  ↓ Song.stemsStatus = "ready" | "error"
```

Practice page (foreground) — user opens a song:
```
GET /api/songs/[id] → Song + Sections + ImportJob
  ↓
useSongPlayer(song) → HtmlAudioEngine (stemsEnabled=false initial)
  ↓
audio.currentTime → useSourceTime(audio, tempoMultiplier) → sourceTime
  ↓
useABLoop(sourceTime) — loop boundary checks
useMetronome(sourceTime) — beat sync
section overlap detection — uses sourceTime
  ↓ User taps "Stems" → setStemsEnabled(true)
useSongPlayer.setStemsEnabled(true) async:
  - Fetch 4 stem mp3s via fetch('/api/media/<songId>_stem_<name>.mp3')
  - decodeAudioData on each → 4 AudioBuffer
  - Create 4 AudioBufferSourceNode → 4 GainNode → master → destination
  - Carry over currentTime from HtmlAudioEngine
  - HtmlAudioEngine.pause() + audio.src = ""
  - StemsEngine.play() if was playing
  ↓
StemMixer pills now control stemMutes — direct GainNode.gain.value writes
```

Tempo flow (R1):
```
User taps tempo 0.30 pill
  ↓
useTempoEngine.setTempo(0.30)
  ↓ tempo < 0.5 → server-rendered path
POST /api/songs/[id]/tempo with { multiplier: 0.30 }
  ↓ per-key render lock check
stretchTempo(source, AUDIO_DIR, songId, 0.30)
  ↓ access(outPath) — cache hit?
  ↓ if no: ffmpeg rubberband|atempo chain → AUDIO_DIR/<songId>_tempo_030.mp3
Response: { ok: true, filename: "<songId>_tempo_030.mp3" }
  ↓ client
audio.pause()
audio.src = "/api/media/<filename>"
audio.preservesPitch = true (after loadedmetadata fires)
audio.currentTime = savedPos * 0.30  // mapped to stretched file time
audio.play()
  ↓ useSourceTime
audio.currentTime / 0.30 → sourceTime  // mapped back for consumers
```

### Error & Failure Propagation

- **Song upload + SongFormer succeeds, Demucs fails:** Song is fully usable (processingStatus="ready"). Stems UI shows "Stems failed: <error>" with retry link. User can practice without stems. POST `/api/songs/[id]/stems/regenerate` retries.
- **Tempo render fails:** `useTempoEngine` catches, surfaces toast "Couldn't slow down audio" + falls back to last working tempo. AbortController prevents stale renders from clobbering.
- **AudioContext lock-screen suspend:** When iPad screen unlocks, both engines need a fresh user gesture per learnings §1. `StemsEngine` listens for `visibilitychange`; on resume, leaves `playing=false` until user taps play again. Document for user (small text in StemMixer when context is suspended).
- **Stem file 404 (race: stemsStatus=ready but file got deleted manually):** StemsEngine's `decodeAudioData` rejects; falls back to HtmlAudioEngine with toast "Stem files missing — using mixed audio."
- **Network error mid-decode:** Same fallback.
- **Two simultaneous tempo POSTs for same multiplier:** Per-key in-memory render lock serializes them; second caller awaits first's promise. No file mid-write race.

### State Lifecycle Risks

- **Stems mid-process + user navigates away:** Pipeline keeps running (fire-and-forget Promise). When user returns, status reflects current state. Safe.
- **Backfill script interrupted:** Songs in `stemsStatus = "processing"` are left in that state. The script is safe to re-run; modify it to also pick `"processing"` for songs whose stem files don't yet exist on disk (treating it as a soft-recoverable state). Alternative: user manually `UPDATE Song SET stemsStatus = 'pending' WHERE stemsStatus = 'processing'` before re-running.
- **Schema migration on existing DB with songs:** Migration is additive (`ADD COLUMN stemsStatus TEXT DEFAULT 'pending'`). Safe. Existing rows get "pending" automatically. Backfill script then processes them.
- **Stem mute state per song:** Persists to Song.lastStemMutes JSON field? **Open question** — see §"Outstanding Questions" R5.2.
- **Cached tempo files orphaned when song is deleted:** Pre-existing risk for pitch variants too. Out of scope for v1 — clean-up script for `apps/data/audio/<songId>_*.mp3` when Song is deleted is a v2 housekeeping task.

### API Surface Parity

- `POST /api/songs/[id]/tempo` — new, mirrors `pitch/route.ts` shape but with zod validation matching `songs/[id]/route.ts` shape. Includes per-key render lock the pitch route lacks.
- `POST /api/songs/[id]/stems/regenerate` — new, retries stems for the song. Just kicks off `separate_stems.py` again and updates `stemsStatus`.
- `GET /api/media/[filename]` — unchanged; serves all variants (pitch, tempo, stems) via the same route handler.
- `GET /api/songs/[id]` — unchanged response shape; `stemsStatus` field is automatic via Prisma include.

### Integration Test Scenarios

**Every scenario tested through the public ngrok URL on production builds per user requirement.**

1. **Ultra-slow tempo on iPad through ngrok:** Open existing song, tap 0.30× pill → audio plays at 0.30× speed, pitch preserved (no chipmunk effect). Section markers continue to highlight at the right moments. A-B loop bounds still match the music timeline.
2. **Tempo cache hit:** Pick 0.30× → render. Refresh page. Pick 0.30× again → response is `cached: true`, no ffmpeg spawn, instant playback.
3. **Concurrent tempo POSTs:** Open two tabs of the same song, tap 0.10× in both simultaneously → server runs ffmpeg exactly once (per-key render lock), both clients get the same filename. (Hard to test on iPad but verifiable from server logs.)
4. **Silent toggle while song is playing:** Enable silent → audio mutes, metronome stays clicking, section strip still highlights current section, cue prompt rotates every 8 bars.
5. **Distraction overlay layout:** Enable distraction → distractor character appears in fixed-height container. Watch surrounding mode/interval pickers — they DO NOT shift vertically when the distractor changes. 1s interval works.
6. **Rhythmic alternation on Metronome app:** Open metronome, set BPM 100, pattern straight → 100 clicks/min. Switch to dotted-forward → dotted feel audible. Triplet → 3 subdivisions per beat.
7. **Stems flow end-to-end (new song):** Upload a fresh full-band song. Open the practice page within seconds (SongFormer hasn't finished yet, but pitch processing is). Wait for `stemsStatus → "ready"` (UI updates without refresh thanks to existing polling). Tap Vocals pill → vocals mute, drums/bass/other continue.
8. **Stems flow end-to-end (existing song after backfill):** Run `bash apps/scripts/backfill_stems.sh`. After ~30 min, all songs have stemsStatus="ready". Practice page on existing songs shows 4 pills.
9. **Stems clock drift on iPad:** Enable stems, mute Vocals, play for 4+ minutes. No audible drift between drums, bass, other. (Per learnings §1, this is the failure mode of 4 parallel `<audio>` tags that we explicitly avoid.)
10. **Stems + tempo conflict UX:** With stems mode on, tap tempo 0.30 → tempo controls disabled with tooltip "Stems mode uses original tempo. Turn off stems to slow the song." (v1 simplification.)
11. **iPad screen lock during stem playback:** Lock screen for 30s, unlock → audio is paused. Tap play → audio resumes from where it suspended. No burst of overlapping clicks (visibility/statechange listeners working).
12. **Backfill resumability:** Start backfill, kill process after 5 songs, restart → resumes from song 6 without re-running 1–5.
13. **Production build sanity:** `npm run build:shreddy` exits 0, no TypeScript errors, no unused-import warnings. Same for metronome.
14. **End-to-end ngrok test (per quality gate):** Drive a real iPad through ngrok to the production-build URL. Run scenarios 1, 4, 5, 6, 7 (the user-facing flows). All pass before PR opens.
15. **iPad memory pressure (added per performance review):** Open Song A → mute vocals → wait 5 s → open Song B → mute drums → wait 5 s → open Song C → mute bass. No "decode failed" errors. Decoded buffer memory never exceeds ~250 MB total. Safari renderer does NOT crash.
16. **Rapid mute mashing (added per julik review):** Open a stems-ready song → tap Vocals pill 5× in 300 ms. Final audio state matches final pill state. No audible clicks (20 ms gain ramp). No buffer leak (verified via memory inspector).
17. **Engine swap interruption (added per julik review):** Play song with all stems on → tap Mute Vocals → immediately tap Un-mute Vocals before decode completes → final state is HtmlAudioEngine playing, no orphan StemsEngine running, no decoded buffers retained.
18. **Tempo + stems interaction (added per architecture review):** Set tempo to 0.30× → mute Vocals. Tempo pill visibly reverts to 1.0× with inline note "Slow tempo turns off when stems are muted." Audio actually plays at 1.0× on stems engine.
19. **rAF stall during 1.0× playback (added per julik review):** Open browser dev tools → trigger long task on main thread (`for (let i = 0; i < 1e9; i++);`) for 2 s during A-B loop playback → loop overshoot is bounded (clamp kicks in for `<audio>`; `source.stop(when)` schedule sample-accurate for stems).
20. **Backfill resumability (added per simplicity review):** `bash apps/scripts/backfill_stems.sh --dry-run` lists pending songs without spawning Demucs. Then `bash apps/scripts/backfill_stems.sh` for real → kill with Ctrl-C after 3 songs → SIGINT trap resets the in-flight row to `pending` → re-run resumes from song 4.
21. **First-run Demucs model download (added per research):** On a fresh `apps/.venv-sf` (or fresh machine), first invocation of `python -m demucs` blocks for 30-120 s downloading htdemucs weights. Backfill script prints a warning before invoking.

## Acceptance Criteria

### Functional Requirements

#### R1 Ultra-slow tempo
- [ ] `TEMPO_VALUES` at `apps/shreddy/src/app/songs/[id]/page.tsx:89` extended with `[0.1, 0.2, 0.3, 0.4]`.
- [ ] New route `POST /api/songs/[id]/tempo` validates with zod (`stubId` allowlist + multiplier 0.1–0.5), returns `{ ok, filename }`.
- [ ] New route uses per-key in-memory render lock; concurrent POSTs for the same key share one ffmpeg run.
- [ ] `useTempoEngine` hook handles both live (≥0.5) and server-rendered (<0.5) paths. Monotonic requestId pattern + AbortController.
- [ ] `useSourceTime` utility translates between source-time and stretched-file-time. Section markers, A-B loop, position pill all use source-time.
- [ ] Cached file lands at `AUDIO_DIR/<songId>_tempo_<NNN>.mp3` (NNN zero-padded).

#### R3 Mental rehearsal (Silent toggle)
- [ ] Silent toggle pill in practice page header (between session-clock and re-analyze).
- [ ] When enabled: `audio.volume = 0`, metronome forced on, CueOverlay shows rotating prompts every 8 bars.
- [ ] When disabled: audio.volume restored, metronome respects user's enabled state.
- [ ] Section progress + A-B loop continue to function while silent.

#### R4 Rhythmic alternation (Metronome app)
- [ ] `apps/metronome/src/hooks/useMetronome.ts` accepts `pattern` prop (`"straight" | "dotted-forward" | "dotted-reverse" | "triplet"`).
- [ ] `RhythmPicker` component renders 4-button row with Unicode music glyphs.
- [ ] LocalStorage settings include `pattern` field.
- [ ] Switching patterns mid-play audibly changes the click subdivision.

#### R5 Vocal integration (stems)
- [ ] Prisma schema adds `stemsStatus String @default("pending")` to Song. Migration applied.
- [ ] `separate_stems.py` runs `htdemucs --mp3 -d cpu -j 4`, outputs `<AUDIO_DIR>/<songId>_stem_{vocals,drums,bass,other}.mp3`.
- [ ] `processAudio` kicks off stems after SongFormer; updates `stemsStatus` along the way.
- [ ] `useSongPlayer` hook provides unified interface; `HtmlAudioEngine` and `StemsEngine` implement it identically.
- [ ] `StemsEngine` uses single AudioContext + 4 `AudioBufferSourceNode`s + per-stem `GainNode`s.
- [ ] `StemsEngine` listens for `visibilitychange` + `ctx.onstatechange`; resumes cleanly after screen lock.
- [ ] `useMetronome` + `useABLoop` consume `sourceTime: number` prop instead of reading audio directly.
- [ ] `useMetronome` gains the visibility/statechange listeners; switches `ctx.close()` to `ctx.suspend()` on unmount.
- [ ] StemMixer component renders 4 mute pills; status-aware (ready / processing / pending / error).
- [ ] When stems mode is on, tempo + pitch controls visibly disable with tooltip.
- [ ] ~~`POST /api/songs/[id]/stems/regenerate`~~ **CUT during deepening.** Single-song retry is `bash apps/scripts/backfill_stems.sh --song <id>` from CLI. No new HTTP endpoint surface.
- [ ] `apps/scripts/backfill_stems.sh` iterates pending songs, processes them, updates DB. Resumable.

#### R6 Distraction overlay
- [ ] DistractionOverlay component ports the sandbox body. Williamon & Valentine 2002 warning preserved.
- [ ] Interval picker includes 1s (in addition to 3s/5s/10s).
- [ ] Fixed-height container for the distractor; surrounding UI does NOT shift when distractor changes.
- [ ] Toggleable via DistractionToggle in the practice page header.

#### Sandbox cleanup
- [ ] `apps/shreddy/src/app/sandbox/tone-variation/` removed (R7 cut).
- [ ] Sandbox index removes R7 tile.
- [ ] R2 backward chaining stays in sandbox (deferred, not cut).

### Non-Functional Requirements

- [ ] iPad portrait + landscape layouts work for all new UI elements.
- [ ] Touch targets meet `size-9 md:size-11` (36/44px) convention.
- [ ] All audio interactions follow synchronous-in-gesture unlock pattern.
- [ ] No `NEXT_PUBLIC_` env vars added.
- [ ] All API routes use zod validation matching `songs/[id]/route.ts` pattern (NOT pitch route's shortcut).
- [ ] All audio src swaps use monotonic requestId pattern.
- [ ] All AudioContext consumers handle `visibilitychange` + `ctx.onstatechange`.
- [ ] All AudioContext consumers unmount via `ctx.suspend()` not `ctx.close()`.
- [ ] `audio.src = ""` on unmount across the practice page lifecycle (per learnings §1).
- [ ] Generated audio writes go to `apps/data/audio/` (gitignored), never `public/`.

### Quality Gates

- [ ] `npm run build:shreddy` exits 0 with no warnings.
- [ ] `npm run build:metronome` exits 0 with no warnings.
- [ ] Production builds + proxy + existing ngrok tunnel (`PROXY_OPEN=1`) accessible from iPad Safari.
- [ ] Every scenario in §"Integration Test Scenarios" tested end-to-end through the public ngrok URL on production build.
- [ ] At least one full backfill run on the existing library (~118 songs) completes successfully.
- [ ] PR description includes ngrok-tested evidence (screenshots of working features on the public URL).

## Success Metrics

- All 5 surviving techniques in production within 6–7 days of focused work.
- iPad-Safari grading session converges: user can grade the v1-integrated versions against the sandbox versions and confirm the production UX matches the mockup's intent.
- Backfill completes on the existing library overnight (~1–2 hours wall-clock).
- No regressions to existing tempo (0.5–1.2×), pitch (±6 semitones), A-B loop, section loop, or metronome functionality.

## Dependencies & Prerequisites

### Code dependencies (already exist)
- `packages/shared/src/ffmpeg-stretch.ts` (from sandbox; promotes unchanged)
- `apps/shreddy/src/hooks/useMetronomePattern.ts` (from sandbox; logic ports to metronome app)
- `apps/shreddy/src/app/sandbox/distraction/page.tsx` (body lifts into DistractionOverlay component)
- `apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx` (cue array lifts into CueOverlay)
- Existing pitch shifter and `<audio>` lifecycle in practice page (pattern reference for tempo + HtmlAudioEngine).
- Existing `processAudio` pipeline (extension point for Demucs).

### Runtime dependencies
- ffmpeg + Python venv `apps/.venv-sf` (already required by SongFormer; will also run Demucs).
- Demucs 4.0.1 already installed (per session 2026-06-15 prep).
- ngrok tunnel + proxy `PROXY_OPEN=1` mode (already committed; the user's existing tunnel `riot-negligent-lasso.ngrok-free.dev` is sufficient).
- iPad on the same Apple ID for Safari testing.

### No new package.json deps required
- `soundtouchjs` was declared but unused (per repo research). v1 doesn't change this.
- `@base-ui/react`, `lucide-react`, all existing UI primitives suffice.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **iPad Safari tab killed by decoded-buffer memory pressure** | **Medium** | **High** | **Module-singleton 32 kHz AudioContext (~27% smaller PCM). Synchronous buffer release + ctx.suspend on song-change. `pagehide` listener releases on bfcache freeze. `AbortSignal.timeout(3000)` on stem fetches. No eager decode — stems only decode on first mute. Test scenario "3 songs back-to-back, no memory pressure" required.** |
| Engine swap interruption mid-async (user toggles mute on/off rapidly during decode) | Medium | High | State machine on `useSongPlayer.mode` with `SWAPPING_TO_STEMS` and `SWAPPING_TO_HTML` states. Monotonic `swapToken` for cancel. Pending intent capture for play/pause/seek/tempo during swap. Test scenario "mash mute 5×, final state matches final pill" required. |
| rAF stall during 1.0× playback causes A-B loop overshoot | Low | Medium | For stems: schedule loop boundary via `source.stop(seekCtxTime)` + `onended` callback — sample-accurate. For `<audio>`: hard clamp — if overshoot > 1.5 / multiplier seconds, force seek anyway. |
| StemsEngine clicks/pops at seek boundary or mute toggle | Medium | Medium | Shared `seekCtxTime = ctx.currentTime + 0.02` for both `stop()` and `start()` — sample-locked. 20 ms `linearRampToValueAtTime` on every mute toggle (not direct `.value = 0/1`). |
| Tempo + stems composition feels broken when both are on | High | Low | Tempo + pitch controls visually disable when StemsEngine is active. Inline note (not hover tooltip — iPad doesn't render): "Slow tempo turns off when stems are muted." v2 unlocks via pre-rendered per-stem tempo variants. |
| R5 engine swap regresses existing tempo/pitch/A-B behavior | Medium | High | useSongPlayer's `mode: "html"` branch mirrors current page logic exactly. Integration test scenarios #4–6 explicitly cover this. Commit 5b is independently revertable. |
| iPad Safari audio context unlock fails on stems first-tap | Low | Medium | `getAudioContext()` shared util uses `webkitAudioContext` fallback. StemsEngine's `play()` is synchronous in the gesture handler. Test scenario #11 covers. |
| Demucs runtime on M1/M2 exceeds the 5-min subprocess timeout for very long songs | Low | Medium | 600s timeout in `processAudio`. For a 10-min song at ~30s/3min = 100s expected. Edge case 30+min songs (unlikely in this library). |
| Demucs first-run model download surprises user (300-500 MB, 30-120 s) | High | Low | Backfill script prints "First run: downloading htdemucs model (~400 MB, 30-120 s on home internet)" before invoking Demucs. |
| Demucs silent overwrite on retry leaves orphan partial files | Medium | Low | Pipeline uses temp-dir + atomic rename. Failed Demucs runs leave `apps/data/sandbox/_temp_<id>/` for debugging, not partial files in `audio/`. |
| Backfill + processAudio contention causes thrashing during user practice | Medium | Medium | File lock at `apps/data/.stems-pipeline.lock`. Acquire-or-wait pattern. Only one Demucs subprocess at a time across all entry points. |
| Backfill script crashes mid-library, partial state | Low | Low | SIGINT trap resets `processing` rows to `pending`. Re-runnable. UUID-format guard against ID surprises. `--dry-run` flag for safety. |
| Schema migration to existing dev.db loses data | Very low | Critical | Additive migration only. Backup `dev.db` before applying. Defaults to `pending` for all existing rows. |
| Existing 401 / Basic-Auth confusion through ngrok | Low | Low | `PROXY_OPEN=1` already committed. Production build + ngrok verified working 2026-06-16. |
| Time-mapping bug causes section markers to drift at sub-0.5× | Medium | Medium | `useSourceTime` uses `useSyncExternalStore` — tearing-free across consumers. Symmetric epsilon tolerance with `lastBounceTime` hysteresis to prevent double-fire. Test scenario #1 covers section + A-B at 0.30×. |
| Tempo variant files accumulate to multi-GB over months | Medium | Low | LRU eviction script in v1 (not v2). Trigger at 20 GB; prune `_tempo_*` and `_pitch_*` by atime > 30 days. Never prune base or `_stem_` files. |
| React 19 StrictMode double-mount masks AudioContext leak in dev | Medium | Medium | `getAudioContext()` is module-singleton, not effect-scoped. Survives StrictMode safely. All event listeners attached via cleanup-aware pattern. |

## Resource Requirements

- **Developer time:** 6–7 days of focused work for the engineering. Split into 1–3 PRs depending on Option A vs Option B choice.
- **Mac CPU time post-merge:** ~1–2 hours for backfill on existing library (~118 songs × ~30–60s each).
- **No additional storage budget needed:** generated audio lives in already-gitignored `apps/data/audio/`. ~3–4 MB per song × 4 stems = ~15 MB/song additional. 118 × 15 MB = ~1.7 GB. Within Mac storage budget.
- **No external service costs:** all processing local.

## Future Considerations

- **v2: Pitch-preserving tempo when stems are on.** Either rubberband-wasm in the browser or pre-rendered tempo variants per stem.
- **v2: Per-stem volume / pan controls.** Once StemsEngine exists, exposing `gainNodes[stem].gain.value` as a fader is trivial.
- **v2: Selective stem regeneration.** UI for "regenerate just vocals" (different Demucs model, e.g. `htdemucs_ft`).
- **v2: Stem-aware practice stats.** Track which stem(s) were muted per session.
- **v2: R2 backward chaining revisit.** Code is on the sandbox branch; the engine refactor here makes integration easier (`useBackwardChain` consumes `sourceTime` instead of audio directly).
- **v2: ffmpeg-cache.ts shared helper.** Once tempo + pitch (+ stem variants if v2) all use the same cache-on-disk pattern, extract `renderCached(filterChain, entityId, variantKey)` per sandbox plan §"Module split".
- **v2: Cleanup script for orphaned variant files** when a Song is deleted.
- **v2: Per-stage import progress percent** (currently UI only shows a string message).
- **v3: Coach mode** — Shreddy detects when to suggest a technique (the framing the user deferred at brainstorm time).

## Documentation Plan

- [ ] `apps/shreddy/CLAUDE.md` — paragraph on stems pipeline + how to invoke the backfill script.
- [ ] `apps/metronome/README.md` — note the new rhythm pattern feature.
- [ ] `OPEN.md` — update R5/R7 sections to reflect v1 ship + R2/R7 status (deferred / cut).
- [ ] `docs/solutions/ipad-safari-audio-gotchas.md` (NEW; deferred from sandbox plan) — write at the end of Phase 5, capturing the cumulative knowledge from sandbox + v1 integration. Including:
  - AudioContext unlock pattern
  - `playbackRate` clamp at 0.5
  - `preservesPitch` reset on src swap
  - `webkitAudioContext` fallback
  - Decoded buffer leak on iPad
  - 4-parallel-audio drift
  - `visibilitychange` + `ctx.onstatechange` reset
  - `ctx.suspend()` vs `ctx.close()` on unmount
- [ ] `docs/solutions/ffmpeg-render-cache-pattern.md` (NEW; deferred from sandbox plan) — document the `<id>_<variant>_<param>.mp3` pattern, the `access(outPath)` cache check, the per-key render lock, the rubberband-vs-atempo fallback choice.

## Outstanding Questions

### Resolved during deepening (2026-06-17)

- ~~**R5.1** tempo + stems composition~~ → Resolved per simplicity review's reframe: **mute pills always visible; engine swap when first mute toggles; tempo + pitch controls disable when StemsEngine is active.** No "stems mode" toggle as user-facing concept. v2 unlocks via pre-rendered per-stem tempo variants.
- ~~**CC.1** PR strategy~~ → Resolved: **one PR with five revertable commits in order R3 → R4 → R6 → R1 → R5 (5a/5b/5c).** Option B (3-PR sequence) was dropped — simplicity, architecture, and user preference converge.
- ~~**R5.2** Persist stem mute state per song?~~ → Resolved: **session-only for v1.** No `Song.lastStemMutes` field. Reload starts fresh.
- ~~**R5.4** Stems-not-ready UI~~ → Resolved: pills row collapsed with status message; never a button. "Separating stems (~30s)…" + spinner during `processing`. Status message + run-backfill hint during `pending`. Error message inline during `error` (no retry button — re-run backfill from CLI).
- ~~**R5.3** Backfill resumability for `processing` rows without files~~ → Resolved: SIGINT trap in backfill script resets `processing` rows to `pending` on interrupt. Atomic temp-dir + rename for crash safety.

### Resolve before planning is complete
_(none — all blocking product decisions are settled from the user's grading feedback + deepening review)_

### Deferred to implementation

**R1**
- **[R1.1][Technical]** Time-mapping precision: source-time = audio.currentTime / multiplier rounding behavior matters for A-B loop boundary detection. Use `Math.round(x * 1000) / 1000` (millisecond precision) for safety.

**R3**
- **[R3.1][Product]** Does Silent mode also disable A-B loop seek-back behavior, or stay active? Default: stay active — A-B loop continues, just muted. Toggle this if grading reveals it's wrong.
- **[R3.2][Product]** Cue overlay copy — keep sandbox's 6 prompts ("Hear the chord, not your fingers." etc.) or curate a new list? Default: keep sandbox's; revisit after grading.

**R4**
- **[R4.1][Technical]** Pattern + time-signature interaction: should "triplet" override the 4/4 vs 3/4 vs 6/8 selection, or compose? Default: compose. Triplet in 3/4 = 9 subdivisions per bar. Triplet in 4/4 = 12.

**R5**
- **[R5.1][Product DEFERRED FROM PLAN BODY]** When stems mode is on, do we (a) disable tempo + pitch controls, (b) silently use playbackRate without pitch preservation (vinyl sound), or (c) pre-render per-stem tempo+pitch variants? **My recommendation: (a) for v1.** Tooltip explains. v2 picks (c) once the engine pattern is proven. Surface this question to the user before opening Phase 3 PR.
- **[R5.2][Product]** Persist stem mute state per song (Song.lastStemMutes JSON)? Or session-only? Default: session-only for v1; persist in v2 if grading reveals user wants this.
- **[R5.3][Technical]** Backfill resumability when a song is in `stemsStatus = "processing"` but no stem files exist on disk (interrupted mid-run): script should treat this as recoverable and re-process. Add this to the script's loop predicate.
- **[R5.4][Product]** What does "Enable stems" look like when stemsStatus !== "ready"? Default: pill row collapsed with a small indicator ("Stems separating ~30s…" or "Stems pending — run backfill"). Not a button.

**R6**
- **[R6.1][Product]** Default interval value when distraction is first enabled — 1s or 5s? Default: 5s. 1s is for advanced users.

**Cross-cutting**
- **[CC.1][Process]** Option A (single PR) vs Option B (3 PRs)? User to confirm before Phase 1 begins. **My recommendation: Option B** for review isolation. User originally said one PR, so I want explicit confirmation.

## Sources & References

### Origin

- **Origin brainstorm:** [`docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md`](../brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md)
  - Key decisions carried forward:
    1. All 7 techniques mocked + graded (now 5 promote, 1 deferred, 1 cut)
    2. Tools, not coach
    3. Stems pipeline deferred to v1 — THIS plan delivers it
- **Sandbox plan:** [`docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md`](2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md)
  - Modules promoting unchanged: `ffmpeg-stretch.ts`, distraction component body, cue prompts list
  - Patterns adopted verbatim: monotonic requestId, per-key render lock, visibilitychange + ctx.onstatechange
- **Grading:** [`docs/brainstorms/2026-06-15-shreddy-deep-practice-grading.md`](../brainstorms/2026-06-15-shreddy-deep-practice-grading.md)
  - Awaiting user fill (or directly drove this plan's scope via session feedback)

### Internal references — current production code to extend

- **Practice page:** `apps/shreddy/src/app/songs/[id]/page.tsx` (1397 lines). TEMPO_VALUES at line 89; audio lifecycle 435-486; rAF loop 526-559; transport bar 1022-1179; header 886-979.
- **Pitch route + hook:** `apps/shreddy/src/app/api/songs/[id]/pitch/route.ts` (33 lines), `apps/shreddy/src/hooks/usePitchShifter.ts` (98 lines).
- **Pitch shared module:** `packages/shared/src/ffmpeg-pitch.ts` (64 lines) — pattern reference for ffmpeg-stretch.
- **Audio dir paths:** `apps/shreddy/src/lib/paths.ts` — AUDIO_DIR, SANDBOX_DIR, STUBS_DIR constants.
- **Song import pipeline:** `apps/shreddy/src/lib/process-audio.ts` (370 lines). `processAudio` orchestrator at line 159; ImportJob status flow at 168-307; reanalyzeAudio at 309.
- **Uploads route:** `apps/shreddy/src/app/api/uploads/route.ts` (78 lines). Fire-and-forget pattern at line 68.
- **Prisma schema:** `apps/shreddy/prisma/schema.prisma`. Song model 10-41; Section 66-80; ImportJob 82-92.
- **Library page:** `apps/shreddy/src/app/page.tsx` — `processingStatus` consumer.
- **A-B loop:** `apps/shreddy/src/hooks/useABLoop.ts` (38 lines). Pure state — no audio coupling.
- **Metronome (Shreddy's):** `apps/shreddy/src/hooks/useMetronome.ts` (327 lines). Beat sync at line 129; ctx.close() at 276 (TO CHANGE).
- **Metronome app:** `apps/metronome/src/app/page.tsx` (318 lines); `apps/metronome/src/hooks/useMetronome.ts` (327 lines, separate copy).

### Internal references — sandbox code to promote

- **ffmpeg-stretch (UNCHANGED):** `packages/shared/src/ffmpeg-stretch.ts` (127 lines).
- **useMetronomePattern (logic to merge into Metronome app):** `apps/shreddy/src/hooks/useMetronomePattern.ts` (162 lines).
- **Distraction page body (port to component):** `apps/shreddy/src/app/sandbox/distraction/page.tsx` (248 lines).
- **Mental rehearsal cue array:** `apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx:13-23`.
- **Sandbox tempo route (pattern reference for production tempo route):** `apps/shreddy/src/app/api/sandbox/tempo/route.ts` (146 lines).
- **useStubPlayer (pattern reference for HtmlAudioEngine):** `apps/shreddy/src/hooks/useStubPlayer.ts` (117 lines).
- **prep-sandbox-variants.sh (pattern reference for separate_stems.py):** `apps/scripts/prep-sandbox-variants.sh`.
- **basePath shim:** `packages/shared/src/basepath-shim.ts` (86 lines) — must keep working for all new routes.

### External references

- [Demucs (Meta AI)](https://github.com/facebookresearch/demucs) — htdemucs model, CPU-only on M-series.
- [ffmpeg atempo filter](https://ffmpeg.org/ffmpeg-filters.html#atempo) — chaining for ultra-slow.
- [ffmpeg rubberband filter](https://ffmpeg.org/ffmpeg-filters.html#rubberband) — preferred when compiled in.
- [Web Audio AudioContext lifecycle on iOS](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) — autoplay restrictions, suspended state.
- Next.js 16 app router conventions — `node_modules/next/dist/docs/` per `AGENTS.md`.

### Related work

- Sandbox branch: `feat/sandbox-deep-practice` — contains all the source code being promoted. 5 commits (`8655fd3 → 4644843`).
- Sandbox plan deferred items now landing here: the `docs/solutions/` write-ups, the time-mapping abstraction, the per-key render lock for production tempo, the cleanup of `useMetronome`'s missing visibility listeners.
