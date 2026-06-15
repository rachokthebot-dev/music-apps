---
date: 2026-06-15
topic: shreddy-deep-practice-grading
status: pending-user-scoring
origin: docs/brainstorms/2026-06-15-shreddy-deep-practice-techniques-requirements.md
plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md
---

# Shreddy deep-practice technique grading

## How to grade

1. Boot the sandbox: `SHREDDY_SANDBOX=1 npm run dev:shreddy` from the monorepo root.
2. Open `http://<mac-ip>:3000/shreddy/sandbox` on iPad Safari (real device — desktop Chrome misses iPad-specific quirks).
3. For each technique below, spend 5–10 minutes inside the mockup interacting with the controls. Tap, swap, listen, drift through a couple stages. Don't optimize for completeness — optimize for "do I want this in real Shreddy?"
4. Score each dimension 1 (terrible) to 5 (excellent). Average ≥ 3.5 → ship to v1. 2.5–3.5 → v2 backlog. < 2.5 → cut.
5. Write the one-line note after scoring, not before — pre-written critique biases the score (cut from the original plan).

## Rubric dimensions

| Dim | What it asks |
|---|---|
| **Clarity** | Did you understand what the mockup does in 10 seconds without reading the footer? |
| **Fit** | Did it feel like Shreddy, or bolted-on? Same tactile feel as the practice page? |
| **Differentiation** | Does it give value beyond slowing tempo + looping a section? |
| **Carrying cost** | Inverse: how much ongoing UX + engineering surface area would v1 add? Low cost = 5, high cost = 1. |
| **Pedagogical value** | How strong is the empirical / theoretical claim from the research notes? |

## Scores

> _Fill the score columns (1–5) and the decision after grading. Empty `· · · · ·` placeholder to fill._

| # | Technique | Clarity | Fit | Diff | Cost (inv) | Pedagogy | Avg | Decision (v1 / v2 / cut) |
|---|---|---|---|---|---|---|---|---|
| R1 | Ultra-Slow Tempo | · | · | · | · | · | — | |
| R2 | Backward Chaining | · | · | · | · | · | — | |
| R3 | Mental Rehearsal | · | · | · | · | · | — | |
| R4 | Rhythmic Alternation | · | · | · | · | · | — | |
| R5 | Vocal Integration | · | · | · | · | · | — | |
| R6 | Distraction Overlay | · | · | · | · | · | — | |
| R7 | Tone Variation | · | · | · | · | · | — | |

## Per-technique notes (write AFTER scoring)

### R1 Ultra-Slow Tempo
- One-line take:
- Surprises (good or bad):
- For v1 (if ≥ 3.5): what would v1 add that the mockup didn't? Real-time waveform position? Per-section ultra-slow? Better engine (rubberband shipped vs atempo)?

### R2 Backward Chaining
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): default reps validation (5 vs Royer's full 5-10 range)? Forward-chain mode for comparison? Mastery rating per stage?

### R3 Mental Rehearsal
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): real chord overlay from analyze.py output? Configurable cue prompts? Aphantasia mode (kinesthetic-first cues)?

### R4 Rhythmic Alternation
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): time-warp the audio to match the dotted feel as an option? Beyond 4 patterns? Custom subdivisions?

### R5 Vocal Integration
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): **must decide** — real Demucs runtime pipeline (like SongFormer), or batch job? AudioBufferSourceNode for true per-stem control, not pre-mixed combinations?

### R6 Distraction Overlay
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): skill-level gate ("are you fluent on this passage?" yes/no) before allowing? Difficulty curve in distractors (harder math, longer words)?

### R7 Tone Variation
- One-line take:
- Surprises:
- For v1 (if ≥ 3.5): real-time Web Audio filter graph instead of pre-render? More presets? Key variation as a separate technique to ship instead?

## Decisions log

> _Filled in after the session. Each ≥ 3.5 technique gets a follow-on `/ce:plan` round for its real Shreddy integration._

## Outstanding deferred-to-grading questions

- **R2**: reps-per-stage default — 5 vs 10? Validate by feel.
- **R4**: audio time-warps to match feel, or audio stays straight + click changes? Both implemented; pick during grading.
- **R5**: does stem mute alone provide the same UX win as full mixer? If yes, v1 can skip per-stem solo controls.
- **R6**: are random numbers, words, math equally cognitive-loading? If one is clearly dominant, ship just that.
- **R7**: do the four EQ presets feel like different "contexts" or just "different audio"? If the latter, this technique probably grades < 2.5.

## Iteration notes

Note any UX bugs / friction caught during grading. These feed the v1 planning round, not necessarily blockers for the grade itself.

- R1:
- R2:
- R3:
- R4:
- R5:
- R6:
- R7:
