---
date: 2026-06-15
topic: shreddy-deep-practice-techniques
---

# Shreddy Deep Practice Techniques

## Problem Frame

Shreddy currently optimizes for *playing a section repeatedly with control* — tempo (0.5–1.2×), pitch shift, A-B loop, section looping, metronome. That covers physical drilling but it does not address what neuroscientists call **cognitive flexibility** — the multiple overlapping pathways to the same musical information that distinguish bulletproof performances from brittle muscle-memory ones.

A practice-technique source article names **seven techniques** that build cognitive flexibility on top of physical repetition. Some map cleanly to software, others don't. Before committing engineering effort, we want all seven prototyped as working UI in a sandbox, graded against a rubric, then promote only the survivors into real Shreddy.

The user is a guitar player practicing on iPad. This is a "better tools" play — Shreddy stays neutral, offers the techniques as opt-in modes; it does *not* (yet) become a coach that detects practice patterns and prescribes techniques. That's a deferred v2.

## Requirements

### Techniques to mock

- **R1. Ultra-Slow Tempo (50% Rule)** — Extend playback rate below the current 0.5× floor down to at least 0.10× (10% speed) without pitch distortion. Mockup must show: tempo picker UI that goes ultra-slow, the trade-off cue ("this becomes time-warped, not musical"), and how a section looping at 0.10× is presented.

- **R2. Backward Chaining (End-to-Start Drill)** — Auto-generate a progressive drill schedule for a chosen section: start by looping the last bar N times, then the last two bars N times, etc., expanding backward until the full section. Mockup must show: schedule generator UI, current "stage" indicator, transition between stages, completion screen.

- **R3. Mental Rehearsal (Silent Visualization)** — A "no audio" mode that shows the section's bar structure scrolling at tempo with a soft click, while the user mentally plays. Mockup must show: silent timeline visualization, optional chord-name overlay, optional "now visualize the bend at bar 3" guided cues.

- **R4. Rhythmic Alternation (Dotted-Note Drill)** — Metronome mode that subdivides each beat into long-short or short-long dotted feel so the user re-rhythms an even passage. Mockup must show: rhythm picker (straight / dotted forward / dotted reverse / triplet), how it composes with section looping, and what playback does (audio stays at normal feel OR drops out and only the click plays — both worth comparing).

- **R5. Vocal Integration (Sing-While-Playing)** — Mute lead vocal/instrument so the user can sing the line over the backing while playing. Requires stem separation infrastructure. Mockup must show: per-stem mute/solo controls (vocals / drums / bass / other), a "Sing the lead" preset that mutes the right stem, processing-state UI for stems-not-yet-extracted. Stems pipeline is mocked at this stage — UI behaves as if stems exist; real Demucs integration is a planning question.

- **R6. Distraction Test (Cognitive Load Overlay)** — Overlay random numbers, words, or simple arithmetic on top of the practice player so the user must read/respond while playing. Mockup must show: overlay style, frequency settings (interval between distractors), pass/fail self-report.

- **R7. Contextual Variation (Tone Switch)** — Toggle that re-EQs the playback to simulate "different context" — clean tone over a distorted track, or dry over a wet one. Mockup must show: tone presets (clean / dirty / dry / wet / bass-only via stem mute), how it composes with R5's stem mutes.

### Sandbox infrastructure

- **R8. Sandbox route.** All seven mockups live at `apps/shreddy/src/app/sandbox/<technique-slug>/page.tsx` plus a `/sandbox` index page that links to each one. Sandbox is excluded from production builds via env flag (`NEXT_PUBLIC_SHREDDY_SANDBOX=1`) so it doesn't ship to anyone outside of grading sessions.

- **R9. Stubbed audio.** Each mockup uses one of two sample songs (one fast/dense, one slow/melodic, both ~3 min) checked into the sandbox so behavior is reproducible. Real Shreddy hooks are reused where they exist; new behavior is mocked client-side.

- **R10. iPad-first layout.** Mockups must render usefully at iPad portrait (768 × 1024) and landscape (1024 × 768) since Shreddy's primary surface is iPad Safari. Desktop is fine but not the priority.

### Grading

- **R11. Rubric.** Each mockup is scored 1–5 on five dimensions: **clarity** (understood in 10 s without reading), **fit** (feels like Shreddy, not bolted on), **differentiation** (delivers value beyond existing tempo/loop), **carrying cost** (low cost = high score — inverted), **pedagogical value** (how strong is the article's compounding claim).

- **R12. Cutoff thresholds.**
  - ≥ 3.5 average → ships to Shreddy integration v1
  - 2.5 – 3.5 → moves to v2 backlog with rationale
  - < 2.5 → cut, with one-line "why not" note

- **R13. Design critique alongside scoring.** Before the user scores, I write a one-page critique per mockup: what works, what's weird, alternative versions worth considering. User scores after reading.

## Success Criteria

- All seven mockup routes deployed under `/sandbox/<technique>` and clickable from a `/sandbox` index.
- Each mockup is interactive end-to-end against the stub songs — no dead buttons.
- A `docs/brainstorms/2026-06-15-shreddy-deep-practice-grading.md` exists with rubric scores per technique + ship/v2/cut decision per row.
- For each surviving (≥ 3.5) technique, a follow-on planning doc exists for actual Shreddy integration.

## Scope Boundaries

- **Not in this phase**: integration into Shreddy's real practice page (`apps/shreddy/src/app/songs/[id]/page.tsx`), real Demucs pipeline, real per-song persistence of technique state, mobile phone layout, settings UI for techniques.
- **No production telemetry**: no usage tracking, no nudges, no "you haven't used backward chaining in 7 days" prompts. That's the "coach" frame the user explicitly deferred.
- **No new infrastructure investments beyond the sandbox route** until grading is done.

## Key Decisions

- **Mockup format: working React in `/sandbox`** (not screenshots). Rationale: components survive into real Shreddy; UX is feelable, not theoretical.
- **All seven techniques get a mockup** even though some look weak on paper (R6 distraction, R7 contextual variation). Rationale: grading is cheap when mockups exist; convictions made without mockups are guessing.
- **Tools, not coach.** Shreddy presents techniques as opt-in modes; it does not detect when to suggest one. Coach behavior deferred to a possible v2.
- **Stems UI mocked, pipeline deferred.** R5 mockup shows controls as if stems exist; whether we actually ship Demucs is a follow-on planning question gated on R5's grade.

## Dependencies / Assumptions

- Shreddy's existing playback hooks (`useABLoop`, `useMetronome`, `usePitchShifter`, `useSectionEditor`) can be reused for the mockups without modification.
- iPad Safari can handle the sandbox routes — no native plugins required.
- Sample songs the sandbox uses are either public-domain or already in the user's library and won't trigger copyright issues when committed to the repo.

## Outstanding Questions

### Resolve Before Planning

_(none — all blocking product decisions are settled.)_

### Deferred to Planning

- [Affects R1][Technical] What playback engine handles ultra-slow tempo without pitch distortion at 0.10×? Web Audio's `playbackRate` may artifact. Possible: server-side ffmpeg + libsoxr pre-renders. Existing pitch-shift pipeline may extend.
- [Affects R2][Needs research] What's the right N (repetitions per stage) for backward-chain default? Music-pedagogy literature has answers; worth checking against existing practice apps (Soundslice, Yousician).
- [Affects R4][Technical] Should the audio stay at original feel while the click goes dotted, or should the audio time-warp too? Both make musical sense; needs user testing during grading.
- [Affects R5][Technical] Demucs model size, processing time, and where it runs (local Python like SongFormer, or a job queue?) gate v1 inclusion. The mockup grade tells us whether to invest.
- [Affects R7][Technical] Tone variation via Web Audio filter graph vs. server-side ffmpeg pre-render of EQ'd variants. Mockup can stub.
- [Affects R9][Product] Which two stub songs to use? Suggestion: one Smells Like Teen Spirit-style loud/dense, one Never Tear Us Apart-style sparse/dynamic. Needs sourcing.

## Alternatives Considered

- **Coach mode in v1** — too much scope, no signal yet on which techniques work for this user. Deferred.
- **Static screenshot mockups via the frontend-design skill** — faster to produce but you grade on look not feel. Discarded.
- **Cut to Tier-1-only (4 techniques on existing engine)** — the safer scope, but the user explicitly chose "scope full feature set" so we mock all seven and let grading prune.
- **Build the full features into Shreddy directly without mockups** — fastest path to shipping but assumes which techniques are worth it. Rejected because the user named "do mockups and grading before integrating."

## Next Steps

→ `/ce:plan` for the sandbox + 7 mockups (this is the planning step the user will execute next). Integration into Shreddy proper is a separate planning round triggered by the grading outcome.
