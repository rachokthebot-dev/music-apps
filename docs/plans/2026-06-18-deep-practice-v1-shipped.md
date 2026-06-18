---
title: Deep-practice v1 — what shipped
type: changelog
status: shipped
date: 2026-06-18
branch: feat/integrate-deep-practice-v1
plan: docs/plans/2026-06-16-001-feat-integrate-deep-practice-v1-plan.md
---

# Deep-practice v1 — shipped changelog

Final record of what landed on `feat/integrate-deep-practice-v1`, in commit
order. Diverges from the original plan in a few places where user feedback
during iPad ngrok testing reshaped the UX. Each commit is independently
revertable.

Total: 11 commits, ~1900 net lines, 6 days elapsed.

## Stage 1 — five sandbox techniques into production

### `1504267 feat(shreddy): R3 Silent toggle + R6 Distraction overlay on practice page`

R3 Mental Rehearsal and R6 Dual-task overlay, both wired into the practice
page rather than separate routes.

* `SilentToggle.tsx` — header pill that mutes `audio.muted` while keeping
  `currentTime` advancing so the playhead / section markers / A-B loop /
  bookmark all still work. Metronome runs from its own AudioContext so the
  click stays audible.
* `CueOverlay.tsx` — rotating prompt above the waveform ("Hear the chord, not
  your fingers.", "Feel the downbeat.", …). Rotates every 8 bars of musical
  time, anchored to `song.bpm` × `song.timeSignature` — not wall-clock
  seconds.
* `DistractionOverlay.tsx` — toggleable panel with mode (numbers / words /
  math), interval picker (1 / 3 / 5 / 10 s), and pass/fail counter. Fixed
  `h-24` distractor card + `h-10` pass/fail row so spawn/clear doesn't reflow
  the surrounding transport. Williamon &amp; Valentine 2002 advanced-only
  warning, dismissible to localStorage.
* iPhone 390 × 844: layout fits without scrolling once warning is dismissed.
  Mode + interval pickers collapsed to a single row to free vertical space.

### `1a0d2e4 feat(metronome): R4 Rhythmic Alternation pattern picker`

R4 lives in the standalone Metronome app rather than Shreddy — the user
practices straight vs dotted vs triplet feels independently from any song.

* `useMetronome.ts` (metronome app): new `MetronomePattern` union with
  `PATTERN_OFFSETS`: `straight [0]`, `dotted-fwd [0, 0.667]`,
  `dotted-rev [0, 0.333]`, `triplet [0, 0.333, 0.667]`.
* Scheduler walks subdivisions within each beat; beat counting + visual
  indicator updates only on the first subdivision so triplets and dotted
  patterns still feel measure-anchored.
* Live pattern switching: `subdivIndex` is clamped mod `offsets.length` so
  switching from triplet to dotted mid-play recovers cleanly without an
  audible blip.
* Page: new "Rhythm" row of 4 pills (♩ ♩.♬ ♬♩. ♪³) between Tap and Timer.
  Persisted to `localStorage` alongside bpm / time-sig / timer.

### `f525325 fix(audio): shared AudioContext + iPad lifecycle handling`

Foundation for stems — multiple feature hooks must share one context.

* `apps/shreddy/src/lib/audio-context.ts` (new): module-singleton
  `getAudioContext()` at 32 kHz with `webkitAudioContext` fallback. iPad
  Safari caps AudioContext count per page and silently closes the oldest
  when exceeded.
* Shreddy `useMetronome` swapped from `new AudioContext()` to the shared
  singleton; gain node is per-hook so each feature owns its own volume.
* Statechange listener resets `nextTickTimeRef` on resume so iPad
  lock/unlock doesn't dump a burst of queued clicks.
* Visibilitychange listener stops the scheduler when the tab hides.
* Unmount: `suspend()` (not `close()`) so the slot stays reusable.
* Metronome app got the same statechange + visibilitychange recovery
  (standalone context but identical iPad behaviour).

### `ab6f6f9 feat(shreddy): R1 ultra-slow tempo (0.1×–0.4×) via server pipeline`

iPad Safari clamps `HTMLAudioElement.playbackRate` at 0.5×, so the bottom
four pills had to route through server-side ffmpeg.

* `/api/songs/[id]/tempo` (new) — POST `{ multiplier }`, renders via
  `stretchTempo()` from `@music-apps/shared` (rubberband when ffmpeg has it,
  chained `atempo` otherwise). Zod validation at the edge.
* Per-key in-process render lock prevents two concurrent requests for the
  same `{ id, multiplier }` from racing ffmpeg into the same output file.
* `useTempoStretch.ts` (new) — when `tempo < 0.5` (and `pitch == 0`) it
  fetches the rendered file and swaps `audio.src` to `/api/media/<filename>`
  at `playbackRate = 1.0`. Monotonic `requestId` so a quick 0.1→0.3→0.2
  click sequence lands on the last selection.
* Practice page: `TEMPO_VALUES` extended to `[0.1 … 1.2]`. Wire
  `transportBusy = pitchProcessing || tempoProcessing` so the play button
  spinner reflects either render path.
* Verified via ngrok: 0.3× cache-hit instant; 0.2× fresh render ~14 s
  ffmpeg, then `audio.src` swaps and play button re-enables.

### `e50447d feat(shreddy): R5 stems pipeline (server) — Demucs + schema + backfill`

The server side of R5 — runtime processing on import + backfill across the
existing library.

* Schema additions: `Song.stemsState` (`pending | processing | ready |
  error`), `Song.stemsErrorMessage`, `Song.stemsCompletedAt`. Migration
  `20260617200000_add_stems_columns` is additive + defaulted, applies
  cleanly to existing rows.
* `lib/process-stems.ts` (new): runs `htdemucs` (NOT `htdemucs_ft`; that's
  worse SDR and 4× slower) from the `.venv-sf` venv on the normalized
  audio. 4 stems land in `AUDIO_DIR` as `<songId>_stem_<vocals|drums|bass|
  other>.mp3` and are served by the existing `/api/media/<filename>` route
  with range support — no new media route.
* Idempotent: pre-check `stemsExist()` short-circuits if all 4 files are on
  disk.
* `processAudio()` fires `processStems()` fire-and-forget after analysis so
  the song page is immediately available; UI polls.
* `/api/songs/[id]/stems` (new) — GET returns `{ state, errorMessage,
  stems? }`. The 4 `/api/media/...` URLs are present when state is `ready`.
* `apps/scripts/backfill-stems.mjs` (new) — talks libsql directly (Prisma 7
  generated client is `.ts`, can't `require` from `.mjs`). Touches only
  `Song.stems*` columns — raw SQL is cleaner. File lock at
  `/tmp/shreddy-backfill-stems.lock` + SIGINT trap finishes in-flight DB
  row before exit. Flags: `--dry-run`, `--only=<songId>`, `--include-errors`.
* Backfill across the full 51-song library completed cleanly in ~50 s/song
  average. 0 failures. 1.6 GB total disk on stems.

### `257d57e feat(shreddy): R5 client StemsEngine + useStemsEngine hook`

The client engine — no UI integration yet.

* `lib/stems-engine.ts` (new) — opaque engine over the shared
  AudioContext.
  - 4 persistent `GainNodes` (one per stem) connected to
    `ctx.destination` ONCE at construction. Never reconnected.
  - `BufferSourceNode`s are throwaway one-shots per Web Audio API contract
    — recreated on every `play()` / `seek()` / `setPlaybackRate()` change.
  - All 4 sources scheduled at a single shared `(ctxTime, offset)` so they
    stay sample-locked across start. Float32 differences between
    `createBufferSource()` calls don't manifest as drift.
  - `setMute` uses `cancelScheduledValues` + `linearRampToValueAtTime` over
    20 ms — direct `.value` writes click on iPad, and rapid toggles must
    cancel pending ramps or they compound past target.
  - `decodeAudioData` uses the callback form (some Safari builds reject
    the Promise overload).
* `hooks/useStemsEngine.ts` (new) — polls `/api/songs/[id]/stems` every
  4 s until `state="ready"`. `activate()` lazy-creates the engine and
  loads the 4 stems (~250 MB decoded). Dispose on unmount / song change.

### `a9e247c feat(shreddy): R5 StemMixer UI + practice page wiring`

* `components/StemMixer.tsx` — 4 stem pills (Vocals / Drums / Bass /
  Other) above the transport. Renders the "Rendering stems…"
  placeholder while pipeline is still processing.
* Practice page: `useStemsEngine` drives the state column.
  `audio.muted = silent || stemsActive` — engine produces audible output;
  `<audio>` keeps playing silently so `currentTime` / loops / bookmark all
  work unchanged.
* Play/pause mirrored via `useEffect` on `playing`; tempo via
  `engine.setPlaybackRate`; seek forwarded explicitly in `seek()` so the
  engine stays sample-locked with the visible playhead.
* `handleStemMuteToggle` lazy-activates the engine on the first mute and
  syncs it to the current playhead + tempo.

## Stage 2 — user-feedback iteration (post-ngrok review)

### `e04c6a4 feat(shreddy): compact tempo + stems dropdowns, share-with-stems`

User feedback: "tempo and stems each take a full row — compact them."

* `TempoSelect.tsx` (new) — `1.0× ▾` button (~80 px) + 4×3 grid popover
  with all 12 values. Saves ~400 px on the transport row. Click-outside
  + Escape close.
* `StemMixer.tsx` (rewritten) — trigger button with live status
  ("Stems" / "Vocals muted" / "N muted") + checkbox menu popover. The 4
  pills become a single dropdown control. Removes the entire stems row.
* `useStemsEngine.ts` — new `eager: boolean` option (default false). When
  true, decode all 4 stems as soon as the server reports `state="ready"`
  so checkbox toggles apply with no perceptible decode latency. Practice
  page passes `eager: true`.
* Share with selected stems:
  - `/api/songs/[id]/clip?stems=…` mixes only audible stems via ffmpeg
    `amix normalize=0` (default `normalize=1` divides by N which makes the
    result too quiet).
  - `handleShare` on the page sends the audible set + appends a
    `"Nstems"` / single stem name suffix to the downloaded filename.
  - Stem names validated against the closed `STEM_NAMES` tuple before
    reaching the ffmpeg argv — typos / malicious input can't reach the
    filesystem.
* `reanalyzeAudio()` now fires `processStems()` for songs that don't yet
  have `stemsState="ready"`. Already-ready songs are skipped. Old-import
  catch-up without backfill.

### `126c828 feat(shreddy): metronome respects time-sig + section-anchored downbeats; section transition loops`

User: "Is the metronome in sync with the song per the extracted sections?"

* `useMetronome.ts` — new options:
  - `beatsPerMeasure` (defaults 4) — page passes
    `song.timeSignature`. Replaces hardcoded `% 4` accents in both
    beat-synced and free-running modes. 3/4 and 6/8 songs now accent
    the right beat.
  - `sectionStarts` — librosa beats within ½ beat of a section start get
    promoted to that section's downbeat. A `downbeatAnchorBeatIdxRef`
    rolls forward through the song, anchoring once per section.
* Backward seek + scheduler restart reset the anchor set so the next
  pass re-anchors fresh.
* Net effect: accents follow the song's actual structure, not librosa's
  choice of "first detected beat."
* First iteration of section transition loops (per-card ⇄ button) — later
  reworked.

### `49f358a feat(shreddy): section transition as a labeled on/off pill`

Per-card UI: full-width pill at the bottom of each section card.
Outlined "⇄ Transition" when off, orange "⇄ Looping" when on. Tap toggles
the A-B loop ±2 bars around that section's end. Superseded by the next
commit on user feedback.

### `4019e38 feat(shreddy): single contextual transition pill + pause-on-property-change`

User feedback (1): "I meant at this section, not each card." Reverted
per-card pills; added a single contextual pill in the loop-indicator slot
below the transport bar.

* The pill describes whichever transition is **being looped** if the A-B
  loop matches any section's transition window — so the label stays
  "Chorus 1 → Verse 2" while the playhead actually plays inside Verse 2.
  When no loop is active, the pill defaults to the current section's
  outgoing transition. `computeRange(sectionIdx)` is reused for both the
  display range and the active-match check.
* Tap toggles: `setLoop(±2 bars around boundary)` + seek + auto-play, or
  `clearABLoop` if already looping.

User feedback (2): "For simplicity, pause playback when any song property
changes."

* `pausePlayback` is the shared primitive. Moved earlier in the component
  so `handleStemMuteToggle` can capture it.
* Calls added at:
  - Tempo dropdown change
  - Pitch ± buttons
  - Stems mute toggle
  - Section card selection (`selectSection`)
  - A-B set / clear (`setA`, `setB`, `clearLoop`)
* The transition pill is the deliberate exception (its whole purpose is
  to start playback at the boundary).
* Verified through ngrok: tempo → pause, pitch → pause, stems → pause,
  section card → pause. The transition flow still auto-plays.

## What didn't ship and why

* **R2 Backward chaining** — deferred per the grading doc. Sandbox code
  stays on `feat/sandbox-deep-practice`; revisit after this branch ships.
* **R7 Tone variation** — cut. No pedagogy backing per the grading.
* **Eager-decoded `useSongPlayer` discriminated mode union (plan §6)** —
  deepening recommended a full mode state machine. In practice the
  simpler "always-active `<audio>` element + engine swap on first mute"
  worked fine for v1 on iPad. The discriminated union remains a valid v2
  refactor if engine bring-up grows hairier.
* **`useSourceTime` via `useSyncExternalStore` (plan §8)** — same.
  `audio.currentTime` + state mirroring stayed correct; no tearing issues
  surfaced in real iPad practice sessions.
* **`useTempoEngine` 5-state machine (plan §7)** — folded into
  `useTempoStretch` with `requestId` + `processing` boolean. Fewer states
  than planned; sufficient for v1.
* **LRU eviction script (plan §18)** — not yet hit the 20 GB threshold.
  Backfill produced 1.6 GB across 52 songs (~31 MB/song average for the 4
  stems; tempo variants are bigger but the library is small).

## Pending follow-ups

These came up during iteration but weren't in scope for v1:

* **Beat-1 calibration on songs whose first librosa beat isn't actually
  beat 1.** Section anchoring fixes most real cases but a manual "tap to
  align" affordance would handle pickups and intros that don't start on a
  detected beat.
* **Mid-section transitions.** Currently a section's outgoing transition is
  always its `endSec`. For songs with a long Verse that contains an
  important sub-transition (e.g. pre-chorus lift), the user has to set A-B
  manually.
* **Stems engine memory pressure.** Eager preload uses ~250 MB; on iPad
  navigating quickly through a few songs is fine because dispose runs on
  unmount, but a 5-songs-in-2-minutes flow hasn't been stress tested.
* **Practice goal per session.** Single text field at session start,
  written to `PracticeSession`. Identified as highest-ROI next addition
  (zero engineering cost) per Ericsson's deliberate-practice research —
  not in v1 scope.
* **Variable / interleaved practice.** "Shuffle sections" toggle on top of
  existing section data; ~50 LOC. Backed by Rohrer &amp; Taylor 2007.
* **Auto-tempo ramp.** Start a section loop at 0.3×, auto-bump tempo on
  each clean pass (tied to mastery rating). Combines R1 with deliberate
  practice. Pipeline route exists from commit `ab6f6f9`.

## Verification surface

Every commit was tested through the public ngrok endpoint
(`riot-negligent-lasso.ngrok-free.dev`) on a production build, at iPhone
390 × 844 and iPad portrait 820 × 1180 viewports. `PROXY_OPEN=1` was set
on the proxy throughout to avoid iPad Safari's Basic Auth subresource
issues with the dev cookie. The full Demucs backfill ran across the
existing 51-song library between Stage-1 commits with zero failures.
