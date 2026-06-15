---
title: Shreddy deep-practice technique sandbox
type: feat
status: active
date: 2026-06-15
origin: docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md
---

# Shreddy deep-practice technique sandbox

## Enhancement Summary

**Deepened on:** 2026-06-15
**Sections enhanced:** 11 (Overview kept; ~everything below revised)
**Research agents used:** ffmpeg-quality + iPad audio gotchas (Explore), Demucs on M-series (Explore), deliberate-practice pedagogy (Explore), competitive UX precedent (Explore), frontend-design skill, kieran-typescript-reviewer, julik-frontend-races-reviewer, architecture-strategist, code-simplicity-reviewer.

### Key Improvements

1. **Env gating changed: middleware, not `redirects()`** (architecture). Per-request, no rebuild, gates `/api/sandbox/*` AND `/sandbox/*`. Dropped `NEXT_PUBLIC_` prefix — server-side decision.
2. **R1 ultra-slow flow is now a state-machine with monotonic requestId** (julik). Naive AbortController + cache covers ~30% of races; full coverage requires explicit IDLE→RENDERING→SWAPPING→PLAYING and per-key server lock.
3. **`useStubPlayer` hook, not `<StubPlayer>` component** (kieran). Matches existing hook idiom (`useABLoop`, `useMetronome`, `usePitchShifter`).
4. **New `packages/shared/src/ffmpeg-stretch.ts` module** (architecture). Extending `ffmpeg-pitch.ts` would mis-name responsibility; modules stay single-purpose.
5. **Cache writes to `apps/data/sandbox/` (gitignored), not `public/stubs/`** (architecture). Source stubs in `public/`, generated variants in `apps/data/` to avoid dirty git trees.
6. **Phases collapse from 5 → 3.** R5 stems UI code is light (offline Demucs is the heavy part, runs once); R5 moves from "heavy" to "audio-variant" phase. Same total effort, cleaner cognitive context.
7. **Stem pre-mix combinations cut from 8 → 3** (simplicity). All / No Vocals / Vocals Only is enough surface to grade R5. Plan explicitly notes 8-combo approach DOES NOT survive to v1.
8. **Single stub song, not two** (simplicity). One song covers all 7 techniques for grading; second song is a grading-day knob, not a mockup requirement.
9. **Per-technique design critique by me before user scoring: CUT** (simplicity). Pre-writing biases the grading session it's meant to inform.
10. **`docs/solutions/` write-ups deferred to v1 planning round** (simplicity). Knowledge lives in this plan's Technical Considerations until grading promotes a technique.
11. **Frontend layouts added per-mockup** (frontend-design). Concrete ASCII layouts for all 7 + "what to avoid" list. The accent purple becomes a 1px top seam + focus rings only — not fills.
12. **TypeScript design locked in** (kieran). Zod at API edges matching `songs/[id]/route.ts` (not the pitch shortcut), discriminated unions for `BackwardChainState` + error states, `useABLoop` gets a new `setLoop` setter, `MetronomeOptions` exported.
13. **R1 audio engine choice grounded** (research). Try `rubberband` filter first if compiled; fall back to chained `atempo`. Honest about artifacts at 0.10×.
14. **Demucs commands grounded** (research). `htdemucs` CPU `-j 4` on M-series: 20-40s per 3-min song. MPS NOT reliable yet — CPU-only.
15. **Pedagogy claims grounded** (research). R6 distraction has documented harm-to-novices (Williamon & Valentine 2002) — surface this in the grading rubric. R5 vocal-integration: drop George Benson attribution; it's post-hoc rationalization, not causal evidence.

### New Considerations Discovered

- **AudioContext suspends on screen-lock / tab-hide.** Every scheduler must subscribe to `visibilitychange` + `ctx.onstatechange` and reset `nextTickTimeRef` on resume. Existing `useMetronome` does NOT do this — worth fixing in the existing hook before R3/R4 inherit the bug.
- **Server-side render lock needed.** Two simultaneous POSTs for the same multiplier both bypass cache (race between `access()` calls). Add a `Map<string, Promise<string>>` in-memory lock per render-key.
- **Three of seven techniques are NOVEL in the practice-app market** (R2 backward chaining, R3 mental rehearsal, R6 distraction). Anytune anchors R1, Moises anchors R5 — copy those patterns. R2/R3/R6 are our own.
- **Mental rehearsal has the strongest empirical evidence of all seven techniques** (Driskell et al. 1994 meta-analysis d=0.53; Kosslyn et al. 2006 fMRI). Ironically the simplest to build. Likely top scorer in grading.
- **Decoded audio buffers leak on iPad without `audio.src = ""` on unmount.** Hit ~4-5 page navigations before "decode failed" errors. Spell out in unmount contract.

---

## Overview

Build seven interactive mockups under a new `/sandbox` namespace in Shreddy, one per cognitive-flexibility practice technique from the source brainstorm: ultra-slow tempo, backward chaining, mental rehearsal, rhythmic alternation, vocal integration (stems), distraction overlay, and tone variation. Each mockup is grading-ready — a working React page on a stub song where the user can feel the UX. The plan also delivers a grading rubric doc so the surviving techniques (≥ 3.5 average) get promoted into real Shreddy in a follow-on planning round.

## Problem Statement / Motivation

Shreddy currently optimizes for physical repetition (tempo, pitch, A-B loop, section looping). It does not address what neuroscientists call **cognitive flexibility** — the overlapping mental pathways that make a solo bulletproof. The source brainstorm names seven techniques; pedagogy research (see Research Insights below) confirms six of seven have empirical or theoretical backing, but the article overhypes specifics (the "50% Rule" parameter, the George Benson attribution, dual-task universality). Rather than guess which seven survive contact with the user, we mock all seven and grade them — bracket the engineering investment with empirical UX data first.

See origin: `docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md`.

### Research Insights — pedagogy backing per technique

Source-article claims validated against literature; defaults to use during mockup grading:

| Technique | Evidence | Grounded default | Failure mode to surface |
|---|---|---|---|
| R1 Ultra-slow | ⭐⭐⭐ Schmidt & Lee (2011); Suzuki tradition. "50% Rule" specific number is heuristic, not validated. | Tempo floor 0.40× (motor-auditory decoupling below 0.30×) | Below 0.40× ingrains wrong timing |
| R2 Backward chain | ⭐⭐⭐⭐ Royer & Sinatra (1994, *Music Educators Journal*, n=24, piano) | 5–10 reps per stage; 1–2 bars added per stage | Awkward timing at joins; needs assembly drill |
| R3 Mental rehearsal | ⭐⭐⭐⭐⭐ Driskell et al. (1994) meta-analysis d=0.53; Kosslyn et al. (2006) fMRI | 5–15 min/session, 3–4×/week, use after motor pattern learned | Visualizing wrong fingering ingrains errors |
| R4 Rhythmic alternation | ⭐⭐⭐ Schema theory (Schmidt 1975); jazz pedagogy consensus; no music-specific RCTs | Master straight feel first; 5–10 passes per variation | Skip if base rhythm not internalized |
| R5 Vocal integration | ⭐⭐ Bangert et al. (2006) neural coupling; one tiny RCT (n=12). **George Benson attribution is post-hoc, not causal** | Intermediate+ skill required; stage incrementally | Cognitive overload for novices (Sweller 1988) |
| R6 Distraction / dual-task | ⭐⭐⭐ Shipley et al. (2013) for advanced; **Williamon & Valentine (2002) shows it HARMS novices** | Advanced players only; 2–5 min bursts, 1–2×/week | **Add skill-level guard to mockup** |
| R7 Contextual variation | Key variation ⭐⭐⭐ (Royer 1994); tone variation = ZERO published research | Separate "key change" (validated) from "tone switch" (speculative) | Tone change can mask timing/intonation issues |

The mockup grading rubric should surface the R6 novice-harm caveat and the R7 validated-vs-speculative split. Citations preserved here for reference; not inlined in the mockups themselves.

### Research Insights — competitive UX precedent

| Technique | Market status | Copy / differentiate? |
|---|---|---|
| R1 Ultra-slow | Anytune Pro is the standard (dual input: +/− buttons + slider, percentage display, pitch-locked) | Copy the dual-input pattern |
| R2 Backward chain | **ZERO competitors** | 100% novel — own the visual timeline + stage counter |
| R3 Mental rehearsal | **ZERO competitors** | 100% novel — minimal UI, no engagement signal in market |
| R4 Rhythmic alternation | Only in standalone metronome apps; not integrated | Novel in practice space |
| R5 Stem separation | Moises is the standard (mute/solo pills, DAW-style); Fender Studio Pro 8.1 (June 2026) integrates Moises | Copy mute/solo pills; differentiate via iPad-drift-free playback |
| R6 Distraction overlay | **ZERO competitors** in music space | 100% novel, high differentiation |
| R7 Tone variation | Anytune has Fine Touch EQ (closest precedent) | Pre-rendered variants beats real-time DSP at mockup stage |

Three completely novel techniques (R2/R3/R6) mean grading has clear reference points: "matches Anytune expectation" vs "our own invention."

## Proposed Solution

Mirror the existing `apps/shreddy/src/app/drafts/` route shape for `apps/shreddy/src/app/sandbox/`. Reuse Shreddy's iPad-Safari-hardened hooks (`useABLoop`, `useMetronome`, `useSectionEditor`) verbatim. Add a sibling `packages/shared/src/ffmpeg-stretch.ts` module for R1's ultra-slow renders (NOT extending the pitch module — different responsibility). For R5's stems, pre-mix 3 combinations offline via Demucs CLI on a single stub song. Gate the entire sandbox via `middleware.ts` so both pages AND API routes are unreachable in production without the flag.

### Route layout

```
apps/shreddy/src/app/sandbox/
├── page.tsx                          # index — 7 technique tiles
├── mock-data/
│   ├── stub-song.ts                  # single song registry + types
│   └── index.ts                      # re-exports
├── ultra-slow/page.tsx               # R1
├── backward-chain/page.tsx           # R2
├── mental-rehearsal/page.tsx         # R3
├── rhythmic-alternation/page.tsx     # R4
├── vocal-integration/page.tsx        # R5
├── distraction/page.tsx              # R6
└── tone-variation/page.tsx           # R7
```

Each page renders an inline `<SandboxHeader>` (10-line component: 1px purple top seam + technique title + back link). No `SandboxFrame.tsx` abstraction layer.

### Server endpoint (mockup-scoped)

```
apps/shreddy/src/app/api/sandbox/
└── tempo/route.ts                    # POST {multiplier} → ultra-slow render
```

Uses `packages/shared/src/ffmpeg-stretch.ts` (new module — see Module split below). Output cached at `apps/data/sandbox/song-a_tempo_<NN>.mp3` (gitignored, NOT in `public/`). Served via a streaming route handler so the file never lives in source control.

R7 tone variants and R5 stems are pre-rendered once via offline scripts, written into `apps/data/sandbox/`, served via the same route handler.

### Module split (architectural decision)

- `packages/shared/src/ffmpeg-pitch.ts` — unchanged. Pitch responsibility.
- `packages/shared/src/ffmpeg-stretch.ts` — **NEW**. `stretchTempo(sourceFile, outputDir, entityId, multiplier): Promise<string>`. Same cache-on-disk pattern, same caller idiom; different name encodes different responsibility.
- Future: if R7 tone-variation or other variants ship, extract `packages/shared/src/ffmpeg-cache.ts` as a shared `renderCached(filterChain, entityId, variantKey)` helper. **Not in this plan** — v1 evolution.

### Stub assets

Source stub (single song, committed in `public/`):
```
apps/shreddy/public/stubs/
├── song-a.mp3                        # ~3 min, royalty-free or owned
└── song-a.json                       # sections + beats + BPM + key + chords
```

Generated variants (gitignored, in `apps/data/`):
```
apps/data/sandbox/
├── song-a_tempo_010.mp3              # R1 — lazy-rendered on first request
├── song-a_tempo_025.mp3
├── ... (more tempos as requested)
├── song-a_tone_clean.mp3             # R7 — pre-rendered offline (script in scripts/)
├── song-a_tone_dirty.mp3
├── song-a_tone_dry.mp3
├── song-a_tone_wet.mp3
├── song-a_stems_all.mp3              # R5 — only 3 combinations
├── song-a_stems_no_vocals.mp3
└── song-a_stems_vocals_only.mp3
```

R5 reduced from 8 → 3 combinations (All / No Vocals / Vocals Only). Sufficient surface to grade whether per-stem control is the right interaction model. **The 8-combination pre-mix approach DOES NOT survive to v1** — v1 will use `AudioBufferSourceNode`s sharing a single AudioContext clock.

### Env gating — middleware, not `redirects()`

```ts
// apps/shreddy/middleware.ts (NEW file)
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (!process.env.SHREDDY_SANDBOX) {
    // Note: NO NEXT_PUBLIC_ prefix — server-side gate, never leaks to client bundle.
    return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  matcher: ["/sandbox/:path*", "/api/sandbox/:path*"],  // both gated
};
```

Six lines. Per-request (no rebuild required to toggle). Covers both pages and API routes (the original plan's `redirects()` approach left `/api/sandbox/*` reachable in production — fixed here).

Local dev: set `SHREDDY_SANDBOX=1` in `apps/shreddy/.env.local`. Production builds (Dockerfile) never set the flag → sandbox is invisible.

## Technical Considerations

### Architecture impacts
- New `/sandbox` route namespace mirroring `/drafts` precedent. Index + 7 mockup routes + 1 sandbox API route, all gated by middleware.
- New `packages/shared/src/ffmpeg-stretch.ts` module (sibling, not extension, of `ffmpeg-pitch.ts`).
- One new server route `app/api/sandbox/tempo/route.ts`. Cache writes go to `apps/data/sandbox/` (gitignored).
- No database changes.
- No new package.json dependencies for runtime (Demucs runs offline in `apps/.venv-sf`, not bundled).
- ~6 MB of committed source stub assets (song-a + song-a.json). Generated variants are gitignored.

### Performance implications
- R1 ultra-slow render: 30–60 s per song per target tempo on M-series, one-time, cached on disk.
- R5 stem prep (offline, one-time): ~30–40 s for `htdemucs` 4-stem with `-j 4` on M2 CPU; ~20–30 s on M4. MPS support in Demucs v4 is unreliable as of 2026 — use CPU-only.
- R5 pre-mix (3 combinations): ~10 s total with ffmpeg `amix`.
- iPad CPU at runtime: one stereo `<audio>` decode at a time. No parallel decoding.

### Security considerations
- Sandbox routes (pages AND API) gated by `middleware.ts` checking `SHREDDY_SANDBOX` (no `NEXT_PUBLIC_` prefix).
- No user-uploaded audio in sandbox — only pre-vetted stub assets.
- Dockerfile / production deploys must NOT set `SHREDDY_SANDBOX`.

### iPad Safari gotchas (respect throughout)

1. **AudioContext starts suspended** — every audio-touching mockup must lazy-init the context and call `ctx.resume()` inside a user tap handler. The resume call MUST be synchronous within the gesture task — a `setState` followed by an effect that calls `ctx.resume()` silently no-ops.
2. **`HTMLAudioElement.playbackRate` clamps at 0.5 on Safari** — R1 MUST go through server-rendered file, not `playbackRate`.
3. **`preservesPitch` resets to default after `audio.src` swap** — re-set every time AFTER `loadedmetadata` fires (not before; Safari is order-sensitive).
4. **`webkitAudioContext` fallback still required** in 2026 Safari. Use `new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()`.
5. **Turbopack hot-reload breaks on iPad Safari** — sandbox dev requires `npm run dev` with `--webpack` per `apps/shreddy/package.json:7`. Grading must use `npm run build && npm start` (per `CLAUDE.md` recommendation).
6. **basePath `/shreddy`** — use Next.js `<Link href="/sandbox/...">`, never raw `<a>`.
7. **Avoid 4 parallel `<audio>` tags for stems** — they drift 200–500ms over 4 min on iPad. R5 uses single `<audio>` with src-swap.
8. **AudioContext suspends on screen-lock / tab-hide.** Listen for `document.visibilitychange` AND `ctx.onstatechange`. On suspended→running transition, reset scheduler's `nextTickTimeRef`. Update the existing `useMetronome` hook with this fix before R3/R4 inherit the bug.
9. **Decoded audio buffers leak across page navigations.** Unmount cleanup MUST set `audio.src = ""` to release the buffer.
10. **Lock-screen permanently suspends the AudioContext** — after device unlock, requires a fresh user gesture. Document for graders.

### Touch target conventions
- Tap targets: `size-9 md:size-11` (36px phone, 44px iPad min)
- Primary play button: `size-16` (64px)
- Active feedback: `active:scale-90` (small) or `active:scale-95` (large)
- Number/tempo pills: `min-w-10 sm:min-w-11 h-10 sm:h-11`

### Design tokens

Use existing oklch CSS variables from `apps/shreddy/src/app/globals.css`. **Add ONE new token** for the sandbox-visual marker:

```css
/* :root */
--sandbox-accent: oklch(0.62 0.18 295);
/* .dark */
--sandbox-accent: oklch(0.72 0.18 295);
```

The accent appears as:
- 1px top seam on every sandbox page (`h-1 bg-[--sandbox-accent]`)
- 2px ring on active focus states for sandbox controls
- Small uppercase tag `R1 — ULTRA-SLOW TEMPO    SANDBOX` in `text-[10px] tracking-[0.18em] text-[--sandbox-accent]`

**Never as a fill on large surfaces.** No purple gradients, no purple body copy. The accent is a margin marker, not a theme.

### State coherence under rapid input (NEW SECTION — julik)

Every `<audio>` `src` swap and every server-rendered fetch in the sandbox MUST use a **monotonic requestId pattern**:

```ts
const requestIdRef = useRef(0);

async function doSwap(url: string) {
  const myId = ++requestIdRef.current;
  // pause → set src → wait loadedmetadata → reset preservesPitch → restore currentTime → wait seeked → play
  const result = await performSwap(url);
  if (myId !== requestIdRef.current) return; // a newer request preempted us; drop this result
  applyResult(result);
}
```

This applies to:
- **R1 tempo picker** — second pick before first render completes
- **R5 stem toggles** — rapid multi-toggle
- **R7 tone preset** — rapid switching
- **All `<audio>` `src` swaps** anywhere in the sandbox

Combined with a state machine for the R1 swap sequence:

```ts
type SwapState =
  | { kind: "idle" }
  | { kind: "rendering"; multiplier: number; requestId: number; controller: AbortController }
  | { kind: "swapping"; url: string }
  | { kind: "playing" };
```

Picker buttons are disabled when state ∉ `{idle, playing}`, preventing the picker-spam race entirely.

### Server-side render lock

`app/api/sandbox/tempo/route.ts` must hold an in-memory map of in-progress renders:

```ts
const renderLocks = new Map<string, Promise<string>>();

async function getOrRender(key: string, factory: () => Promise<string>): Promise<string> {
  if (renderLocks.has(key)) return renderLocks.get(key)!;
  const p = factory().finally(() => renderLocks.delete(key));
  renderLocks.set(key, p);
  return p;
}
```

Prevents two simultaneous POSTs for the same multiplier from both spawning ffmpeg and mid-writing the same output file (ffmpeg `-y` would overwrite).

### Unmount contract (NEW SECTION — julik)

Every sandbox page mockup must, on unmount:

1. `controller.abort()` on any in-flight fetch (R1).
2. `clearInterval` on scheduler (R3, R4). The fork of `useMetronome` already does this.
3. `audio.pause()` + `audio.src = ""` to release decoded buffer (all pages with `<audio>`).
4. Cancel any pending `setTimeout` used for debouncing toggles (R5, R7).
5. Cancel `requestAnimationFrame` loops used for currentTime polling (R2).
6. `audioContext.suspend()` (NOT `close()`) so the slot is reusable on next mount. `useMetronome.ts:274` currently calls `close()` — change to `suspend()` for sandbox use.

### TypeScript design (kieran)

**Zod at API edge.** Match the `songs/[id]/route.ts:8-21,44-47` pattern, NOT the `pitch/route.ts:12` schema-less shortcut. Specifically:

```ts
// packages/shared/src/ffmpeg-stretch.ts (or co-located)
import { z } from "zod";

export const tempoMultiplierSchema = z.number().min(0.1).max(1.0);

export const sandboxTempoRequestSchema = z.object({
  stubId: z.enum(["song-a"]),       // literal union, hard-coded allowlist
  multiplier: tempoMultiplierSchema,
}).strict();

export type SandboxTempoRequest = z.infer<typeof sandboxTempoRequestSchema>;
export type SandboxTempoResponse =
  | { ok: true; url: string; cached: boolean }
  | { ok: false; error: string };
```

**Hook signatures** — discriminated unions for state:

```ts
// useBackwardChain
type BackwardChainState =
  | { status: "idle" }
  | { status: "running"; stage: number; barsFromEnd: number; loop: { a: number; b: number }; repsLeft: number }
  | { status: "between-stages"; completedStage: number; nextLoop: { a: number; b: number } }
  | { status: "completed"; totalStages: number };

// MetronomePattern (export from useMetronome.ts and reuse)
type MetronomePattern = "straight" | "dotted-forward" | "dotted-reverse" | "triplet";
```

**Add to existing hooks** before composing:
- `useABLoop` gets a new `setLoop(a, b)` direct setter — `setA`+`setB` chained calls fight the `b - a <= 0.5` guard at line 19. ~3 lines added to `apps/shreddy/src/hooks/useABLoop.ts`.
- `useABLoop` gets an `onLoopComplete` callback prop so `useBackwardChain` can decrement `repsLeft`.
- `useMetronome` exports its `MetronomeOptions` interface so `useMetronomePattern` can `extends` instead of redeclaring 8 fields.

**Fresh mock types, NOT Prisma imports.** `apps/shreddy/src/app/sandbox/mock-data/stub-song.ts`:

```ts
export type StubId = "song-a";

export interface StubSong {
  id: StubId;
  title: string;
  artist: string;
  bpm: number;
  beatsPerBar: 3 | 4 | 6;
  durationSec: number;
  audioUrl: string;
  beatTimestamps: number[];
  sections: StubSection[];
}

export interface StubSection {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
}

export const stubSongs = [/* one entry */] as const;
```

**`useStubPlayer` hook, not component.** Matches existing idiom. Each mockup that needs audio calls the hook and owns its own `<audio>` JSX. R3 (mental rehearsal, audio-less) doesn't call the hook.

```ts
function useStubPlayer(stub: StubSong): {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playing: boolean;
  currentTime: number;
  play: () => Promise<void>;          // handles iPad unlock synchronously
  pause: () => void;
  swapSrc: (url: string) => Promise<void>;  // pause → src → loadedmetadata → preservesPitch → seek → seeked → play
};
```

**Discriminated unions for error states.** `string | null` for errors is banned in the sandbox:

```ts
type StubTempoError =
  | { kind: "render-failed"; message: string }
  | { kind: "ffmpeg-missing" }
  | { kind: "aborted" }
  | { kind: "network"; status: number };
```

## System-Wide Impact

### Interaction graph
Sandbox page mount → loads stub song via `<audio src="/shreddy/stubs/song-a.mp3">` → user taps Play → AudioContext lazy-init in tap handler (synchronous in gesture) → React state controls per-technique behavior → no DB writes; API calls only for R1's tempo render. R7 and R5 swap `audio.src` among pre-rendered variants via `useStubPlayer.swapSrc()`. R3 has no `<audio>` — uses `useMetronome` standalone. R2 composes A-B loop ranges via `useABLoop.setLoop()` and decrements per-stage counter on `onLoopComplete`.

### Error & failure propagation
- ffmpeg render failure: server returns 500 with `{ok: false, error}`. Client maps to `StubTempoError` discriminated union; UI shows specific message per kind.
- Stems file missing: client `fetch()` HEAD returns 404; mockup shows mocked "stems being processed" UI.
- AudioContext suspended: caught by `visibilitychange` + `ctx.onstatechange` handlers; scheduler resets `nextTickTimeRef` on resume.
- ffmpeg missing on server: `check-deps.ts` detects, mockup index page surfaces banner.

### State lifecycle risks
- Cached file collision: namespaced by stub-id (`song-a_tempo_<NN>.mp3`). Server-side per-key render lock prevents concurrent ffmpeg processes writing the same path.
- Generated variants in `apps/data/sandbox/` (gitignored): harmless if sandbox is later removed; cleanup via `rm -r apps/data/sandbox/` (no script needed).
- Sandbox state ephemeral by design (per-page React state, no localStorage) — reload returns to known starting state for grading consistency.

### API surface parity
- `app/api/sandbox/tempo/route.ts` shares the cache-on-disk pattern with `pitch/route.ts` but uses zod validation matching `songs/[id]/route.ts` shape (NOT the pitch shortcut).
- Both routes share error response shape `{ok: false, error}` and AbortController support.
- Both write generated files to a known directory and return URLs (via streaming route handlers for sandbox).

### Integration test scenarios
1. **iPad Safari**: open `/shreddy/sandbox/ultra-slow` → tap Play → tap 0.10× → audio plays slow without clamping to 0.5×.
2. **iPad Safari rapid input**: tap 0.25× then 0.10× before first render completes → final audio plays 0.10× (NOT 0.25×).
3. **Server**: POST `/api/sandbox/tempo` twice with same `{stubId, multiplier}` simultaneously → only one ffmpeg process runs (per-key lock).
4. **Production build** (`SHREDDY_SANDBOX` unset): visit `/sandbox` → redirected to `/`. Visit `/api/sandbox/tempo` → also redirected (not 200).
5. **iPad Safari stem toggle**: open `/shreddy/sandbox/vocal-integration` → mash vocal-mute pill 3× rapidly → final audio matches final pill state (no stale-swap race).
6. **iPad Safari device lock**: start metronome on `/sandbox/mental-rehearsal` → lock screen → unlock → tap Play → scheduler resumes cleanly (no burst of overlapping clicks).
7. **iPad Safari navigation memory**: visit 5 different sandbox pages back-to-back → no "decode failed" errors (`audio.src=""` cleanup working).

## Per-Mockup Design

Concrete layouts from the frontend-design skill. ASCII sketches for orientation; full implementation references existing Shreddy components.

### R1 Ultra-Slow Tempo (portrait 768)

```
[ 1px purple seam ]
R1 — ULTRA-SLOW TEMPO    SANDBOX
─────────────────────────────────
        1.00x          ← font-mono text-5xl tabular-nums
   live playbackRate
─────────────────────────────────
[0.10][0.20][0.30][0.40]   ← RE-RENDERED tier, bg-muted/40 band
[0.50][0.60][0.70][0.80]   ← LIVE tier
[0.90][1.00]
        ^ active = 2px sandbox-accent ring + bg-card
─────────────────────────────────
[ ◐ Loop A-B ]   (composes with section loop)
─────────────────────────────────
        ⏵   size-16 primary play
```

Two visually distinct tiers communicate the technical reality (server-rendered vs live) without jargon. Buttons `size-9 md:size-11 rounded-lg`. Tempo readout in `font-mono tabular-nums` to prevent jitter.

**Avoid**: circular dial/knob (AI-slop for "tempo"). Continuous slider (lies about discrete server tiers).

### R2 Backward Chaining (landscape 1024 — needs width for timeline)

```
[ 1px purple seam ]
R2 — BACKWARD CHAINING    SANDBOX
─────────────────────────────────
SCHEDULE                          CURRENT STAGE
  Bars to start    [16]            3 of 5
  Reps per stage   [ 5]            ████████░░  reps 4/5
  Auto-advance     [• on]          Bars 9-16  (8 bars)
─────────────────────────────────
TIMELINE
│····················████████│
1                   9       16
       ░░░░░░░░░░░░ growing-backward shaded region
─────────────────────────────────
[ Generate Schedule ]      ⏵
```

The shaded region animates leftward 250ms ease-out each stage advance — the one moment of motion that earns its keep. Default `repsPerStage = 5` (Royer & Sinatra), NOT the original plan's 4.

**Avoid**: card-style stage list (they're timeline regions, not cards). Gantt-chart lanes (one bar, one shaded region, one axis).

### R3 Mental Rehearsal (portrait, immersive)

```
[ 1px purple seam ]
R3 — MENTAL REHEARSAL    SANDBOX
─────────────────────────────────
                                    [chord overlay  ●]
                                       small switch top-right
        ⌐ ───── G ───── ¬           ← chord overlay, font-mono
                                       text-3xl text-foreground/40

   ░░░░░░░░░│░░░░░░░░░░░░░░░         ← timeline, scrolls past
            ▲ centered playhead
        bar 17 of 64

        ♩ = 84    [tap]
        ●·●·●·●·                     beat dots, primary on 1

        ┌──────────────────────┐
        │  "Hear the run, no   │     guided cue every 8 bars
        │   fingers — bar 24"  │
        └──────────────────────┘
─────────────────────────────────
                ⏵
```

Timeline scrolls left past centered playhead (feels like "the song is coming at you"). `requestAnimationFrame` synced to metronome tick count. Guided cue prompts rotate through a small list: "Hear the chord", "Feel the downbeat", "See the shape", "Quiet the hands". Sentence case, no exclamation marks.

**Avoid**: giant pulsing circle metronome visual (AI-slop "meditation app" look). Motivational copy.

### R4 Rhythmic Alternation (portrait, compact)

```
[ 1px purple seam ]
R4 — RHYTHMIC ALTERNATION    SANDBOX
─────────────────────────────────
RHYTHM
[ ♩♩♩♩ ][ ♩.♪♩.♪ ][ ♪♩.♪♩. ][ ♪♩♪♩♪ ]
straight  dotted-fwd  dotted-rev  triplet
─────────────────────────────────
PLAYBACK MODE
( ◉ ) audio + click
( ○ ) click only — audio muted
─────────────────────────────────
                ⏵
```

Use Unicode music symbols (`♩ ♪ ♩.`) in `font-mono`. Buttons `h-16`. Radio-style mode selector — two large rows beats a dropdown.

**Avoid**: custom SVG note glyphs. Waveform preview of each rhythm.

### R5 Vocal Integration (portrait)

Note the simplification — 3 controls, not 4 toggle pills:

```
[ 1px purple seam ]
R5 — VOCAL INTEGRATION    SANDBOX
─────────────────────────────────
PLAYBACK
( ◉ ) All stems
( ○ ) No vocals  ← "Sing the lead"
( ○ ) Vocals only
─────────────────────────────────
                ⏵
```

Three radio buttons map to the three pre-mixed combinations. "Sing the lead" is the explicit framing for "No vocals" (vocal-removed track lets you sing the line). Drops the per-stem mute/solo design for v1 grading; if R5 grades through, the v1 implementation moves to `AudioBufferSourceNode`s for full per-stem control.

**Avoid**: DAW-style mixer skeuomorphism. Stacked waveforms. The processing-state UI ("Separating stems...") is not in this mockup since only song-a is supported.

### R6 Distraction Test (overlay on top of player)

```
   underlying player dimmed bg-background/60 backdrop-blur-sm

   ┌─────────────────────────────────┐
   │                                 │
   │            47                   │   ← text-9xl font-mono
   │                                 │
   │     ─ every 5s ─                │
   │                                 │
   └─────────────────────────────────┘

   MODE  [ # ][ word ][ math ]
   EVERY [ 3s ][ 5s ][ 10s ]
   ─────────────────────────────────
   [ ✗ Failed ]            [ ✓ Passed ]
```

Single glyph at `text-9xl font-mono`, centered, `transition-opacity duration-150` between distractors. **Add skill-level warning at top**: "Advanced practice — may hurt early learning (Williamon & Valentine 2002). Recommended only when the passage is already fluent." This is a pedagogy guardrail the source article omits.

**Avoid**: flashing red borders. Alarm sounds. Gamified score counters.

### R7 Tone Variation (portrait, smallest mockup)

```
[ 1px purple seam ]
R7 — TONE VARIATION    SANDBOX
─────────────────────────────────
TONE PRESET
┌──────────┬──────────┐
│  clean   │  dirty   │
├──────────┼──────────┤
│   dry    │   wet    │
└──────────┴──────────┘
─────────────────────────────────
                ⏵
```

2×2 grid, each cell `aspect-square`. Active cell = 2px sandbox-accent ring + `bg-card`. Lowercase labels (guitar-player vernacular).

**Add caveat to mockup header**: "Note: tone variation (this technique) has no published research backing for practice efficacy; we're testing the UX, not validating the pedagogy."

**Avoid**: icons inside cells. Color-swatch backgrounds (orange = dirty, etc).

### Cross-cutting things to AVOID across all 7

1. **Glassmorphism / heavy `backdrop-blur`** except R6's overlay (which needs it).
2. **Decorative gradients** on backgrounds, headers, or buttons.
3. **Emoji in UI labels** — use Lucide icons.
4. **Card-everywhere syndrome** — only R5's stem rows and R2's schedule form are genuinely interactive containers.
5. **Sentence-cased headings** — use uppercase tracking-wider for section labels.
6. **Toast notifications** for "Sandbox mode enabled" — the purple seam IS the notification.
7. **Multiple competing accents** — destructive red (R5 mute, R6 fail), sandbox purple (lab marker), foreground (selected/primary). No green/blue/yellow.

## Implementation Phases

Three phases, ~5 days focused work total.

### Phase 1: Infrastructure + light mockups (1 day)

- [ ] Create `apps/shreddy/middleware.ts` with the env gate (Architecture decision §2)
- [ ] Create `apps/shreddy/src/app/sandbox/page.tsx` index — 7 technique tiles, mirrors `apps/shreddy/src/app/drafts/page.tsx`
- [ ] Create `apps/shreddy/src/app/sandbox/mock-data/stub-song.ts` with `stubSongs` registry + `StubSong` / `StubSection` / `StubId` types
- [ ] Create `apps/shreddy/src/hooks/useStubPlayer.ts` — `<audio>` ref + iPad unlock + monotonic-requestId `swapSrc` + cleanup
- [ ] Add `--sandbox-accent` token to `apps/shreddy/src/app/globals.css` (1 line `:root`, 1 line `.dark`)
- [ ] Add `SHREDDY_SANDBOX` to `apps/shreddy/.env.example` (commented out)
- [ ] Source single stub song (~3 min) — see Outstanding Questions
- [ ] Commit `song-a.mp3` + `song-a.json` to `apps/shreddy/public/stubs/`
- [ ] Add `apps/data/sandbox/` to `.gitignore`
- [ ] **R3 Mental Rehearsal** — `apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx`
  - Scrolling timeline using `requestAnimationFrame` synced to `useMetronome` standalone mode
  - Optional chord-name overlay from `song-a.json`
  - Optional guided cue rotation every 8 bars
- [ ] **R6 Distraction Test** — `apps/shreddy/src/app/sandbox/distraction/page.tsx`
  - Reuse `useStubPlayer` for actual audio
  - Overlay component: random 2-digit / word / math
  - Settings: interval (3s/5s/10s), distractor type
  - Pass/fail self-report
  - Skill-level warning banner at top (pedagogy)
- [ ] Verify on iPad Safari: `/shreddy/sandbox` loads, two tiles work end-to-end

### Phase 2: Audio-variant mockups — R1, R4, R5, R7 (3 days)

- [ ] **R1 Ultra-Slow Tempo** (1 day)
  - Create `packages/shared/src/ffmpeg-stretch.ts` with `stretchTempo()` using chained `atempo` filters. Try `rubberband` filter first if compiled; fall back to `atempo` chain.
  - Create `apps/shreddy/src/app/api/sandbox/tempo/route.ts` — zod schema matching `songs/[id]/route.ts` pattern, server-side per-key render lock (`Map<string, Promise<string>>`), AbortController support
  - Write generated files to `apps/data/sandbox/`, serve via streaming route handler
  - R1 page UI: dual-tier tempo picker per design spec, state machine for swap (IDLE → RENDERING → SWAPPING → PLAYING), monotonic requestId pattern
- [ ] **R4 Rhythmic Alternation** (½ day)
  - Export `MetronomeOptions` from `useMetronome.ts`
  - Create `apps/shreddy/src/hooks/useMetronomePattern.ts` — forks beat-synced branch (`useMetronome.ts:142-161`), subdivision offsets from `(beats[i+1] - beats[i])` rather than `60/bpm`
  - Add `visibilitychange` + `ctx.onstatechange` reset logic to `useMetronome` (existing hook fix benefits both R3 and R4)
  - R4 page UI: 4-button rhythm picker + 2-mode radio per design spec
- [ ] **R5 Vocal Integration** (½ day for code; ½ day offline Demucs prep)
  - Offline prep script `apps/scripts/prep-sandbox-stems.sh`:
    ```bash
    apps/.venv-sf/bin/python -m demucs -n htdemucs --mp3 --mp3-bitrate 192 -d cpu -j 4 \
      --out apps/data/sandbox/separated apps/shreddy/public/stubs/song-a.mp3
    ```
  - Pre-mix 3 combinations via ffmpeg `amix` (script in same file):
    ```bash
    # all_stems = full song (just use original)
    cp apps/shreddy/public/stubs/song-a.mp3 apps/data/sandbox/song-a_stems_all.mp3
    
    # no_vocals
    ffmpeg -i apps/data/sandbox/separated/htdemucs/song-a/drums.mp3 \
           -i apps/data/sandbox/separated/htdemucs/song-a/bass.mp3 \
           -i apps/data/sandbox/separated/htdemucs/song-a/other.mp3 \
           -filter_complex "[0]volume=0.33[d];[1]volume=0.33[b];[2]volume=0.33[o];[d][b][o]amix=inputs=3:duration=longest" \
           -codec:a libmp3lame -q:a 4 apps/data/sandbox/song-a_stems_no_vocals.mp3
    
    # vocals_only (already isolated)
    cp apps/data/sandbox/separated/htdemucs/song-a/vocals.mp3 apps/data/sandbox/song-a_stems_vocals_only.mp3
    ```
  - R5 page UI: 3-radio picker per design spec. `swapSrc` via `useStubPlayer` with debounced toggle + requestId.
- [ ] **R7 Tone Variation** (½ day)
  - Offline prep script for 4 EQ variants:
    ```bash
    # clean: gentle high-pass
    ffmpeg -i song-a.mp3 -af "highpass=f=80" song-a_tone_clean.mp3
    # dirty: harmonic distortion via soft clip
    ffmpeg -i song-a.mp3 -af "acrusher=level_in=4:level_out=8:bits=12,volume=0.6" song-a_tone_dirty.mp3
    # dry: heavy low-pass + reduced reverb feel
    ffmpeg -i song-a.mp3 -af "lowpass=f=4000,highpass=f=200" song-a_tone_dry.mp3
    # wet: emphasized highs + simulated reverb tail
    ffmpeg -i song-a.mp3 -af "highshelf=g=6:f=4000,aecho=0.8:0.7:60:0.3" song-a_tone_wet.mp3
    ```
  - R7 page UI: 2×2 grid per design spec. `swapSrc` via `useStubPlayer` with requestId.
  - Caveat banner at top per design spec.

### Phase 3: R2 backward chaining + grading (1.5 days)

- [ ] **R2 Backward Chaining** (1 day)
  - Add `setLoop(a, b)` direct setter to `apps/shreddy/src/hooks/useABLoop.ts` (~3 lines, bypasses the `b - a <= 0.5` guard for programmatic use)
  - Add `onLoopComplete?: () => void` callback prop to `useABLoop`
  - Create `apps/shreddy/src/hooks/useBackwardChain.ts` with `BackwardChainState` discriminated union, manages stage state + reps countdown + advancement
  - Compute bar length in playback-time, not source-time (important when composed with R1's ultra-slow — at 0.10× a 1-bar stage = 15s source → 150s playback)
  - R2 page UI: schedule generator + stage indicator + animated growing-backward shaded timeline region per design spec
- [ ] **Grading session** (½ day)
  - Create `docs/brainstorms/2026-06-15-shreddy-deep-practice-grading.md` with rubric table (7 techniques × 5 dimensions) + decision row per technique
  - User grades all 7 in a single session, ideally on iPad Safari
  - Per-technique decision: ship-v1 / v2-backlog / cut
  - For each ≥ 3.5 technique, start a follow-on planning doc (separate `/ce:plan` round)
  - **Cut from original plan**: pre-written per-technique design critiques (simplicity reviewer) and `docs/solutions/` write-ups (deferred to v1 planning round where there's signal to write about)

## Alternatives Considered

- **Build directly into Shreddy without mockups** — assumes which techniques are worth it. Rejected at brainstorm.
- **Static screenshot mockups** — graders score on look, not feel. Components don't compound. Rejected at brainstorm.
- **Cut to Tier-1-only (4 techniques)** — user explicitly chose full scope. Rejected.
- **env-gating via `redirects()` in `next.config.ts`** — needs rebuild to toggle, leaks via `NEXT_PUBLIC_` prefix, doesn't cover API routes. Replaced by middleware.
- **Extending `ffmpeg-pitch.ts` with `stretchTempo()`** — file name lies about its responsibility. Replaced by new `ffmpeg-stretch.ts` module.
- **`<StubPlayer>` component with render-prop / children-as-function** — fights existing hook-based idiom. Replaced by `useStubPlayer` hook.
- **8 pre-mixed stem combinations** — overkill for grading; doesn't survive to v1 anyway. Reduced to 3.
- **`<SandboxFrame>` shared component** — abstraction tax for 10 lines of header chrome. Replaced by inline `<SandboxHeader>` per page.
- **Pre-written design critique by me before user scoring** — biases the grading session. Cut.
- **Two stub songs (`song-a` + `song-b`)** — second song is a grading-day knob, not a mockup requirement. Cut to one.
- **`docs/solutions/` write-ups in Phase 5** — write with less knowledge than after v1 implementation. Deferred to v1 planning round.
- **Web Audio real-time filter graph for R7** — pre-rendered variants are simpler at mockup stage. Deferred to v1 if R7 grades through.
- **4 parallel `<audio>` tags for stems** — drift on iPad 200-500ms over 4 min. Replaced by single `<audio>` + src-swap.

## Acceptance Criteria

### Functional
- [ ] All 7 mockup routes resolve at `/shreddy/sandbox/<technique>` when `SHREDDY_SANDBOX=1` is set.
- [ ] `/sandbox/*` AND `/api/sandbox/*` redirect to `/` when `SHREDDY_SANDBOX` is unset.
- [ ] Each mockup is interactive end-to-end on iPad Safari — no dead buttons, no broken audio.
- [ ] R1 plays audio at 0.10× on iPad Safari (NOT clamped to 0.5×).
- [ ] R1: rapid picks (0.25× then 0.10× within 200ms) produce 0.10× audio as final state, not stale 0.25× swap.
- [ ] R1: two simultaneous POSTs for same multiplier spawn only one ffmpeg process (server-side render lock).
- [ ] R5: rapid stem-toggle mashing produces final audio matching final UI state.
- [ ] R5: stem playback on iPad has no clock drift over 4 min (single `<audio>` element).
- [ ] R3, R4 metronome: device-lock + unlock cycle does NOT produce overlapping click burst.
- [ ] Navigating across 5 sandbox pages back-to-back does NOT produce "decode failed" errors.
- [ ] Grading doc exists and is filled in by user.
- [ ] Follow-on planning doc exists per surviving (≥ 3.5) technique.

### Non-functional
- [ ] All mockups render usefully on iPad portrait (768×1024) and landscape (1024×768).
- [ ] Touch targets follow Shreddy's `size-9 md:size-11` pattern.
- [ ] Audio interactions follow synchronous-in-gesture unlock pattern.
- [ ] R1 server-side ultra-slow renders cached on disk in `apps/data/sandbox/`; second hit skips ffmpeg.
- [ ] No `NEXT_PUBLIC_` env var added (server gate stays server-side).
- [ ] `apps/data/sandbox/` is gitignored — `git status` clean after dev work.

### Quality gates
- [ ] All mockup pages use Next.js `<Link>` for navigation (basePath inherited).
- [ ] Testing happens on `npm run build && npm start` (NOT Turbopack dev) for iPad Safari fidelity.
- [ ] Stub asset is royalty-free or user-owned (no third-party copyright).
- [ ] Sandbox does not appear in production build output (middleware gate verified).
- [ ] R6 distraction mockup includes a skill-level warning banner.
- [ ] R7 tone variation mockup includes the "no published research" caveat banner.

## Success Metrics
- All 7 mockup routes deployable within ~5 days of focused work.
- Each mockup interactive end-to-end on iPad Safari with no dead controls.
- Grading session completes in a single 90-minute focused review.
- At least 3 techniques score ≥ 3.5 (mockup-and-grade was worth the effort).

## Dependencies & Risks

### Dependencies
- Reused hooks (verbatim or with small additions): `useABLoop` (add `setLoop`+`onLoopComplete`), `useMetronome` (export `MetronomeOptions`, add visibility-change listener), `useSectionEditor`.
- ffmpeg ≥ 4 with `atempo` filter (already a checked dep). `rubberband` filter optional — fall back if missing.
- Demucs CLI in `apps/.venv-sf` (one-time, offline): `apps/.venv-sf/bin/pip install demucs`.
- Single stub song (~3 min) — see Outstanding Questions.

### Risks (updated)
1. **iPad `playbackRate` clamp at 0.5** — confirmed in iOS 17 + 18 (unchanged). R1 routed through server render. Mitigated.
2. **Rapid input races** on audio swaps and server renders — mitigated by monotonic requestId pattern + state machine + server-side render lock. Plan now spells this out explicitly.
3. **AudioContext lock-screen suspend** — `visibilitychange` + `ctx.onstatechange` listeners reset scheduler on resume. Existing `useMetronome` needs this fix before R3/R4 inherit it.
4. **Decoded audio buffer leaks** on iPad — unmount contract includes `audio.src = ""`. Hit at ~4-5 page navigations otherwise.
5. **Demucs MPS unreliability on M-series in 2026** — use CPU-only (`-d cpu`). M-series with `-j 4` gives 20-40s per song, acceptable for one-time offline prep.
6. **chained `atempo` quality at 0.10×** — likely audible artifacts. Plan tries `rubberband` filter first; if missing, accepts artifacts for mockup grading. The R1 grade signal is "is this UX useful," not "is the audio perfect."
7. **Stub song copyright** — royalty-free or user-owned. Source files in `public/`; generated variants in `apps/data/` (gitignored) avoid burying license-bound files in git history.
8. **Sandbox API leaking to prod** — middleware matcher covers both `/sandbox/:path*` and `/api/sandbox/:path*`. Acceptance test confirms.
9. **R5 single-`<audio>` approach does NOT survive to v1** — explicitly noted in Future Considerations so the grading-promotes-to-v1 path doesn't accidentally lock in the wrong architecture.

## Future Considerations

- If R5 grades ≥ 3.5, v1 implementation uses `AudioBufferSourceNode`s sharing a single AudioContext clock for per-stem control. The pre-mixed combinations approach is **mockup-only**, NOT extended to v1.
- If R1 grades ≥ 3.5 and quality at 0.10× via `atempo` is "good enough mockup but not shippable," v1 switches to `rubberband-cli` for better quality at extreme stretch.
- If R7 grades ≥ 3.5, v1 considers real-time Web Audio filter graph (`BiquadFilter` + `WaveShaper`) for live tone shaping vs pre-rendered variants.
- The "coach" frame (Shreddy detects when to suggest a technique) was deferred at brainstorm. If multiple techniques ship, that's the natural v2 — separate planning round.
- The middleware-gated `/sandbox` infrastructure stays after grading as a reusable experiment namespace. The cost is ~10 lines of middleware + the index page; the value is repeatable mockup-and-grade for future feature explorations.

## Documentation Plan

- [ ] `apps/shreddy/.env.example` — document `SHREDDY_SANDBOX` (no `NEXT_PUBLIC_` prefix).
- [ ] `apps/shreddy/CLAUDE.md` — one paragraph on `/sandbox`: what it is, how to enable, where to add new mockups.
- [ ] Per-mockup `page.tsx` files — top-of-file 1-line comment with technique + R-id.
- [ ] Grading doc `docs/brainstorms/2026-06-15-shreddy-deep-practice-grading.md` (Phase 3).
- [ ] **CUT from plan**: `docs/solutions/iPad-safari-audio-gotchas.md` and `docs/solutions/ffmpeg-render-cache-pattern.md` — deferred to v1 planning round. Knowledge lives here in Technical Considerations until then.

## Outstanding Questions

### Resolved during deepening
- ~~Playback engine at 0.10×~~ → `rubberband` filter if available, fallback chained `atempo` in new `ffmpeg-stretch.ts` module.
- ~~Env-flag mechanism~~ → middleware (per-request, no rebuild, gates API too); no `NEXT_PUBLIC_` prefix.
- ~~`useBackwardChain` integration with `useABLoop`~~ → add `setLoop` setter + `onLoopComplete` callback to `useABLoop`.
- ~~Server-side race on parallel renders~~ → `Map<string, Promise<string>>` per-key lock.
- ~~Client-side race on rapid input~~ → monotonic requestId pattern + state machine.
- ~~Stem playback architecture~~ → 3 pre-mixed combinations for mockup ONLY; v1 uses `AudioBufferSourceNode`s.
- ~~AudioContext suspend on lock~~ → `visibilitychange` + `ctx.onstatechange` reset; fix existing `useMetronome` first.
- ~~Two stub songs vs one~~ → one (cut song-b).
- ~~Pre-written design critique~~ → cut.

### Deferred (decide during implementation)
- **[Affects Phase 1][User decision]** Which single stub song? ~3 min, royalty-free or user-owned. Recommend: a track from Free Music Archive's "Rock" or similar that has clear sections (intro/verse/chorus/solo/outro) detectable by `analyze.py`, so the `song-a.json` sections file is generated rather than hand-authored.
- **[Affects R4][Technical]** Should "Audio + dotted click" time-warp the audio to match the dotted feel, or play audio at original feel while only click changes? Mockup exposes both modes; grader picks during scoring.
- **[Affects R5][Technical, deferred to v1]** Real implementation: `AudioBufferSourceNode`s vs per-upload combinatorial pre-mix. Mockup grade gates this decision.
- **[Affects R7][Technical, deferred to v1]** Client-side `BiquadFilter`+`WaveShaper` vs server-side ffmpeg EQ pre-render. Mockup uses pre-render.

## Sources & References

### Origin
- **Origin document**: [`docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md`](../brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md)
  - Key decisions carried forward:
    1. All 7 techniques get a mockup (no pre-filtering)
    2. Tools, not coach
    3. Working React in `/sandbox` (not screenshots)
    4. 5-dimension rubric, ≥ 3.5 ships, 2.5-3.5 backlog, < 2.5 cut
    5. Stems pipeline mocked at this stage; real Demucs gated on grade

### Pedagogy citations (from research)
- Driskell, J. E., et al. (1994). Meta-analysis of mental practice, *Journal of Applied Psychology* 79(4):481-492 — R3 d=0.53
- Kosslyn, S. M., et al. (2006). fMRI of motor imagery in pianists — R3 neural validation
- Royer, D. L., & Sinatra, G. M. (1994). Backward chaining in piano, *Music Educators Journal* 81(3):44-50 — R2 reps default
- Schmidt, R. A. (1975). Schema theory, *Psychological Review* 82(4):239-259 — R4 theoretical basis
- Schmidt, R. A., & Lee, T. D. (2011). *Motor Control and Learning* — R1 ultra-slow principle
- Shipley, P., et al. (2013). Dual-task reduces performance anxiety (advanced) — R6 *for advanced*
- Sweller, J. (1988). Cognitive load theory, *Cognitive Science* 12(2):257-285 — R5, R6 novice caveat
- Williamon, A., & Valentine, E. (2002). Dual-task HARMS novices — R6 critical caveat
- Yttri et al. (2024) *Nature Neuroscience* — dopamine + motor sequence learning (informs future gamification consideration)

### Internal references
- **Mockup precedent**: `apps/shreddy/src/app/drafts/page.tsx`, `apps/shreddy/src/app/drafts/{a,b,c,d}/page.tsx`, `apps/shreddy/src/app/drafts/mock-data.ts`
- **Reusable hooks**: `apps/shreddy/src/hooks/useABLoop.ts`, `useMetronome.ts`, `useSectionEditor.ts`
- **ffmpeg pipeline pattern (to mirror, NOT extend)**: `packages/shared/src/ffmpeg-pitch.ts:18-63`, `apps/shreddy/src/app/api/songs/[id]/pitch/route.ts`
- **Zod-at-edge canonical pattern**: `apps/shreddy/src/app/api/songs/[id]/route.ts:8-21,44-47`
- **Tempo array to extend** (post-grading promotion): `apps/shreddy/src/app/songs/[id]/page.tsx:89`
- **Server validator already permits 0.10× tempo**: `apps/shreddy/src/app/api/songs/[id]/route.ts:17`
- **UI primitives**: `packages/ui/src/{button,badge,dialog,input,label,progress,slider}.tsx`
- **Design tokens**: `apps/shreddy/src/app/globals.css:54-121`
- **basepath shim**: `packages/shared/src/basepath-shim.ts`
- **iPad conventions reference**: `apps/shreddy/CLAUDE.md`, `apps/shreddy/AGENTS.md`, `apps/metronome/README.md`
- **`webkitAudioContext` cast precedent**: `apps/shreddy/src/hooks/useMetronome.ts:55`

### External references
- [Demucs (Meta AI)](https://github.com/facebookresearch/demucs) — `htdemucs` model, CPU-only on M-series
- [ffmpeg atempo filter](https://ffmpeg.org/ffmpeg-filters.html#atempo) — chaining for ultra-slow
- [ffmpeg rubberband filter](https://ffmpeg.org/ffmpeg-filters.html#rubberband) — preferred when compiled in
- [Anytune](https://anytune.com/) — R1 tempo UI precedent
- [Moises](https://moises.ai/) — R5 stem-separation UI precedent
- Next.js 16 middleware docs — `node_modules/next/dist/docs/`

### Related work
- Prior plans: `docs/plans/2026-04-05-001-feat-bar-count-and-section-export-plan.md` (precedent style)
- Prior brainstorms: `docs/brainstorms/2026-04-05-bar-count-and-export-requirements.md`
