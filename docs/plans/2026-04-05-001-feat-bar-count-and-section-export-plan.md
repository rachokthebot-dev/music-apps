---
title: "feat: Bar count per section + section structure export"
type: feat
status: active
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-bar-count-and-export-requirements.md
---

# feat: Bar count per section + section structure export

## Overview

Add bar count display to each section card, a per-song time signature field, and an export function that generates both copyable plain text and a lead-sheet style PNG image of the song structure for sharing with band members.

## Problem Statement / Motivation

Guitarists think in bars, not seconds. "The solo is 8 bars" is immediately actionable; "the solo is 15.3 seconds" is not. Shreddy has all the data needed (BPM, beat timestamps, section boundaries) but never surfaces bar counts. Additionally, there's no way to share song structure with band members — you'd have to screenshot and annotate manually.

## Proposed Solution

Three additions, buildable incrementally:

1. **Bar count computation** — count `beatTimestamps` within each section's time range, divide by time signature
2. **Time signature field** — new column on Song model, editable in the metadata area
3. **Section export** — button in section header row, generates plain text + lead-sheet style PNG

## Technical Approach

### Phase 1: Time Signature Field (schema + API + UI)

**Schema change** — Add `timeSignature` to Song model:

```prisma
// prisma/schema.prisma — Song model
timeSignature  Int  @default(4)  // beats per bar: 3, 4, or 6
```

Run `npx prisma db push` (SQLite, no migration needed for dev).

**API change** — Update `songPatchSchema` in `src/app/api/songs/[id]/route.ts`:

```typescript
timeSignature: z.number().int().refine(v => [3, 4, 6].includes(v)).optional(),
```

Add to the PATCH handler's data spread.

**UI** — Add a clickable pill next to BPM in the metadata row at `src/app/songs/[id]/page.tsx:867-869`. Tapping cycles through 3 → 4 → 6 → 3. Display as "4/4", "3/4", or "6/8".

**Files:**
- `prisma/schema.prisma` — add field
- `src/app/api/songs/[id]/route.ts` — update schema + PATCH handler
- `src/app/songs/[id]/page.tsx` — add pill to metadata row, add PATCH call on click

### Phase 2: Bar Count Display on Section Cards

**Computation** — Pure client-side function, no storage needed:

```typescript
function getBarCount(
  section: { startSec: number; endSec: number },
  beatTimestamps: number[],
  timeSignature: number
): number | null {
  if (!beatTimestamps.length) return null;
  const beats = beatTimestamps.filter(
    t => t >= section.startSec && t < section.endSec
  );
  return Math.round(beats.length / timeSignature);
}
```

This syncs with the metronome's existing beat indexing from song start — `beatTimestamps` array index 0 is beat 1 of the song, and the metronome already uses `i % 4 === 0` for downbeats (see `src/hooks/useMetronome.ts:156`).

**UI** — Add "~N bars" to each section card in `SectionStrip.tsx`, below the time range:

```
┌─────────────────┐
│ ● Intro         │
│ 0:00 – 0:09     │
│ ~2 bars          │  ← new line
│           ✏️ 🗑  │
└─────────────────┘
```

Show nothing if `beatTimestamps` is empty (graceful degradation for unanalyzed songs).

**Props change** — `SectionStrip` needs `beatTimestamps: number[]` and `timeSignature: number` as new props. Compute bar counts inside the component.

**Files:**
- `src/components/SectionStrip.tsx` — add props, compute bar count, render "~N bars"
- `src/app/songs/[id]/page.tsx` — pass `beatTimestamps` and `timeSignature` to SectionStrip

### Phase 3: Section Export (Plain Text + Lead-Sheet PNG)

**Export button** — Add to the section header row in `SectionStrip.tsx`, alongside Edit and + Add buttons. Use `Share2` icon from lucide.

**Plain text export** — Generate a formatted string and copy to clipboard:

```
Tears For Fears - Everybody Wants To Rule The World
Key: F major | BPM: 112 | Time: 4/4
Duration: 4:10 | 56 bars total

Intro          0:00 – 0:09    ~2 bars
Verse 1        0:09 – 0:47    ~8 bars
Pre-Chorus 1   0:47 – 1:05    ~5 bars
Chorus 1       1:05 – 1:34    ~8 bars
Verse 2        1:34 – 2:04    ~8 bars
Pre-Chorus 2   2:04 – 2:24    ~5 bars
Chorus 2       2:24 – 2:49    ~7 bars
Bridge         2:49 – 3:22    ~9 bars
Chorus 3       3:22 – 4:10    ~13 bars
```

Use `navigator.clipboard.writeText()`. Show a toast/brief "Copied!" feedback.

**Lead-sheet style PNG** — Render using Canvas API directly (no external dependency). Draw section blocks arranged in rows like a structure chart:

```
┌──────────────────────────────────────────────────┐
│  Everybody Wants To Rule The World               │
│  Tears For Fears                                  │
│  Key: F major | BPM: 112 | 4/4 | 4:10 | 56 bars │
│                                                   │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐ │
│  │ Intro   │ │ Verse 1 │ │Pre-Ch. 1 │ │Chorus 1│ │
│  │ ~2 bars │ │ ~8 bars │ │ ~5 bars  │ │ ~8 bars│ │
│  │  0:09   │ │  0:38   │ │  0:18    │ │  0:29  │ │
│  └─────────┘ └─────────┘ └──────────┘ └────────┘ │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐  │
│  │ Verse 2 │ │Pre-Ch. 2 │ │Chorus 2│ │ Bridge │  │
│  │ ~8 bars │ │ ~5 bars  │ │ ~7 bars│ │ ~9 bars│  │
│  │  0:30   │ │  0:20    │ │  0:25  │ │  0:33  │  │
│  └─────────┘ └──────────┘ └────────┘ └────────┘  │
│  ┌─────────┐                                      │
│  │Chorus 3 │                                      │
│  │ ~13 bars│                                      │
│  │  0:48   │                                      │
│  └─────────┘                                      │
│                                                   │
│  Generated by Shreddy                             │
└──────────────────────────────────────────────────┘
```

- Dark background (#1a1a1a) matching Shreddy's UI
- Section blocks with colored left borders (reuse SECTION_DOT_COLORS)
- Each block shows: section name, bar count, duration
- Blocks arranged in rows of 4, wrapping to next row
- Canvas width ~800px for phone readability
- Trigger download as `{title}-structure.png`

**Export flow** — Tapping the export button shows a small popover or action sheet with two options:
1. "Copy as text" → clipboard
2. "Save as image" → PNG download

**Files:**
- `src/components/SectionStrip.tsx` — add export button to header row
- `src/lib/export-structure.ts` — new file with `copyStructureText()` and `generateStructureImage()` functions
- `src/app/songs/[id]/page.tsx` — pass song metadata to SectionStrip for export

## Acceptance Criteria

- [ ] `timeSignature` field on Song model (default 4, accepts 3/4/6)
- [ ] Time signature pill in metadata row, cycles on tap, persists via PATCH
- [ ] Section cards show "~N bars" below time range (only when beatTimestamps available)
- [ ] Changing time signature instantly recalculates bar counts (no reload)
- [ ] Export button in section header row next to Edit and + Add
- [ ] "Copy as text" copies formatted structure to clipboard
- [ ] "Save as image" downloads a lead-sheet style PNG
- [ ] Export includes: title, artist, BPM, key, time sig, total duration, total bars
- [ ] Each section in export shows: name, duration, bar count
- [ ] Songs without BPM/beat data gracefully omit bar counts
- [ ] Test with "Tears For Fears - Everybody Wants To Rule The World"

## Dependencies & Risks

- **Beat tracking accuracy** — bar counts are only as good as librosa's beat detection. Rounding with `~` indicator mitigates this.
- **Canvas API on iPad Safari** — should work fine for static rendering; no WebGL needed.
- **No external dependencies** — Canvas API is built-in, no html2canvas needed.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-05-bar-count-and-export-requirements.md](docs/brainstorms/2026-04-05-bar-count-and-export-requirements.md) — Key decisions: ~N bar display, time sig on practice page, both text+image export, lead-sheet style, client-side only
- Metronome beat sync: `src/hooks/useMetronome.ts:142-161`
- Section strip component: `src/components/SectionStrip.tsx`
- Song metadata display: `src/app/songs/[id]/page.tsx:862-871`
- Song PATCH API: `src/app/api/songs/[id]/route.ts:8-17`
- Prisma schema: `prisma/schema.prisma:10-41`
