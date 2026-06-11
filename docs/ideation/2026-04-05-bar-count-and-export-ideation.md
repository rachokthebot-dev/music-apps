---
date: 2026-04-05
topic: bar-count-and-export
focus: Bar count per section + section export for band sharing
---

# Ideation: Bar Count Per Section + Section Export

## Codebase Context

- Shreddy is a guitar practice companion (Next.js 16, React 19, Prisma/SQLite)
- Sections have `startSec`/`endSec` (float seconds), `name`, `orderIndex`, `autoDetected`
- `Song.beatTimestamps` stores librosa-detected beat times as JSON array
- `Song.bpm` stores detected tempo as Float
- No bar count, measure, or time signature fields exist anywhere
- The metronome hook (`useMetronome.ts`) already syncs to `beatTimestamps` and treats every 4th beat as downbeat (`i % 4 === 0`)
- No export or sharing functionality exists

## Ranked Ideas

### 1. Bar Count from Beat Timestamps
**Description:** Count beat timestamps within each section's `startSec`/`endSec` window, divide by time signature (default 4). Display "~8 bars" on section cards. Use the same beat-sync logic as the metronome — index into `beatTimestamps` from the song start so beat 0 aligns with bar 1.
**Rationale:** All data exists. Pure arithmetic on stored JSON. Directly solves the feature request. Guitarists think in bars, not seconds.
**Downsides:** Accuracy depends on beat tracking quality. Sections not aligned to bar boundaries produce fractional bar counts (round to nearest).
**Confidence:** 95%
**Complexity:** Low
**Status:** Selected for implementation

### 2. Time Signature Override Field
**Description:** Add a `timeSignature` field on Song (Int, default 4, editable in settings/UI). Feeds into bar count division. Simple dropdown: 3, 4, 6.
**Rationale:** Without this, bar counts are wrong for waltzes, 6/8 feels, etc. Manual override is more reliable than algorithmic inference.
**Downsides:** Extra field, most users won't need it.
**Confidence:** 90%
**Complexity:** Low
**Status:** Selected for implementation

### 3. Section Structure Export (Share with Band)
**Description:** Export button on the song page that generates a shareable summary: song title, artist, BPM, key, time signature, then a table of sections with name, duration, and bar count. Output as copyable plain text (for pasting into group chats) and optionally as a downloadable PDF or image.
**Rationale:** Band members need song structure at a glance. "Intro (4 bars) -> Verse (16 bars) -> Chorus (8 bars)" is the universal language of rehearsal.
**Downsides:** Needs a clean format. PDF generation adds dependency weight.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Selected for implementation

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Beat grid overlay on Claude Vision PNG | User excluded complex visualizations |
| 2 | Claude confidence scores per section | Deferred — section detection improvements later |
| 3 | Correction delta logging | Deferred — need more manually processed songs first |
| 4 | Adaptive novelty thresholds | Deferred — depends on correction logging |
| 5 | Correction-driven prompt improvement | Deferred — needs correction corpus |
| 6 | Tempo-relative minimum section gap | Good idea but deferred with section detection work |
| 7 | Beat-snap section boundaries | Nice-to-have but user wants rough bar count, not precision alignment |

## Session Log
- 2026-04-05: Initial ideation — 22 unique candidates generated from 38 raw ideas, 3 selected for implementation (bar count, time sig override, section export)
