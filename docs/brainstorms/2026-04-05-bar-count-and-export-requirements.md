---
date: 2026-04-05
topic: bar-count-and-export
---

# Bar Count Per Section + Section Export

## Problem Frame

Guitarists think in bars, not seconds. Shreddy shows section durations as timestamps (e.g., "0:47 - 1:05") but never tells you "that's ~5 bars." When preparing for band rehearsal, there's no way to share the song structure with other members — you'd have to screenshot and annotate manually.

## Requirements

- R1. **Bar count display on section cards.** Each section card shows "~N bars" derived from the beat timestamps within that section's time range, divided by the song's time signature. Use `~` prefix to indicate approximation. Sync beat counting from the start of the song (beat index 0 = bar 1), consistent with the metronome's existing downbeat logic (`i % 4 === 0`).

- R2. **Time signature field on Song.** Add a per-song time signature (default 4, options: 3, 4, 6). Displayed and editable in the song metadata area on the practice page, near BPM and key. Changing it recalculates all bar counts immediately (client-side, no reanalysis needed).

- R3. **Plain text export.** An export action generates a copyable plain text summary:
  - Header: song title, artist, BPM, key, time signature
  - Totals: total duration, total bar count
  - Section table: name, duration (M:SS), bar count
  - Optimized for pasting into group chats (WhatsApp, iMessage, Telegram)

- R4. **Image export (lead-sheet style).** The same export action also generates a shareable image:
  - Sheet-music inspired layout — section blocks arranged like a structure/lead sheet chart
  - Shows song title, artist, BPM, key, time signature, total duration, total bars
  - Each section block shows name, duration, bar count
  - Dark background matching Shreddy's UI aesthetic
  - Downloadable as PNG

- R5. **Export button placement.** Export button sits in the sections header row alongside "Edit" and "+ Add". Uses a share/export icon (e.g., `Share2` or `Download` from lucide).

## Success Criteria

- Bar counts match what a musician would count by ear for standard 4/4 songs (within +/- 1 bar tolerance)
- Exported text is clean and readable when pasted into a chat app
- Exported image is legible on a phone screen and looks professional enough to share
- Time signature change instantly updates all bar counts without page reload

## Scope Boundaries

- No beat-snapping of section boundaries (deferred)
- No automatic time signature detection (manual override only)
- No PDF export (PNG image + text is sufficient)
- No server-side export rendering — all client-side
- Bar count is computed, not stored in the database

## Key Decisions

- **Round + approximate indicator ("~7 bars")**: Honest about imprecision without being noisy
- **Time signature on practice page**: Near BPM/key, always visible when it matters
- **Both text + image export**: Text for quick chat sharing, image for visual reference
- **Lead-sheet inspired image style**: Matches how musicians already think about song structure
- **Client-side image generation**: No server dependency, works offline on iPad

## Dependencies / Assumptions

- `Song.beatTimestamps` is reliably populated for analyzed songs
- Songs without BPM/beat data won't show bar counts (graceful degradation)

## Outstanding Questions

### Deferred to Planning
- [Affects R4][Needs research] Best approach for client-side PNG generation (canvas API vs html2canvas vs svg-to-png)
- [Affects R2][Technical] Where to place the time signature control in the existing metadata UI layout

## Next Steps

-> `/ce:plan` for structured implementation planning
