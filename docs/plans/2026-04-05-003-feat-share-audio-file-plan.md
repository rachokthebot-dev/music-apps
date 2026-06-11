---
title: "feat: Share audio file via native share sheet"
type: feat
status: completed
date: 2026-04-05
---

# feat: Share audio file via native share sheet

## Overview

Add a "Share" button on the practice page that lets users share the song's MP3 file with band members. On iPad Safari, this opens the native iOS share sheet (AirDrop, iMessage, Mail, etc.). On browsers without file sharing support, falls back to a direct download.

## Problem Statement / Motivation

When preparing for band rehearsal, musicians need to share reference tracks with bandmates. Currently Shreddy has no way to export the audio file — users would have to find the original file or screen-record the playback. A share button that opens the native share sheet makes this a one-tap action.

## Proposed Solution

### User Flow

1. User taps "Share" button (share icon) on the practice page
2. App fetches the MP3 file from the existing `/api/media/{filename}` endpoint
3. If Web Share API with file support is available (iPad Safari 15.4+):
   - Opens native iOS share sheet with the MP3 file
   - User can AirDrop, iMessage, Mail, save to Files, etc.
4. If Web Share API file sharing is NOT available (fallback):
   - Triggers a direct download of the MP3 file

### File Details

Audio files are already stored as MP3 (192kbps, 44.1kHz stereo) in `AUDIO_DIR`. No conversion needed. The file is named using the song ID (`{songId}.mp3`), but the shared file should use a human-readable name: `{Artist} - {Title}.mp3` (or just `{Title}.mp3` if no artist).

## Technical Approach

### API Endpoint

**No new API endpoint needed.** The existing `/api/media/[filename]/route.ts` already serves audio files with proper MIME types and streaming support. The client-side code fetches the blob directly.

However, for the share filename to be human-readable, the client needs to construct the `File` object with a nice name. This is done entirely client-side:

```typescript
// Client-side share logic
async function handleShare(song: Song) {
  const audioUrl = `/api/media/${song.normalizedAudioPath}`;
  const response = await fetch(audioUrl);
  const blob = await response.blob();

  const safeName = [song.artist, song.title]
    .filter(Boolean)
    .join(" - ")
    .replace(/[^a-zA-Z0-9-_ ]/g, "") + ".mp3";

  const file = new File([blob], safeName, { type: "audio/mpeg" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    // Fallback: direct download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### UI Placement

Add a share button in the practice page header area, near existing action buttons (settings, etc.). Use the `Share2` icon from lucide-react (already imported in SectionStrip). Show a loading spinner while fetching the file.

### Files to Modify

1. **`src/app/songs/[id]/page.tsx`** — Add share button to the practice page header and the `handleShare` function

That's it. One file change. No new API endpoints, no new dependencies.

## Technical Considerations

- **File size**: Audio files can be large (5-50MB for typical songs). The fetch + blob creation happens in memory. This is fine for iPad (typically 4-8GB RAM) but should show a loading indicator.
- **Web Share API support**: Safari 15.4+ (iPadOS 15.4+), Chrome 89+, Firefox (no file support). The `canShare` check handles this gracefully.
- **Pitch-shifted files**: If the user has pitch-shifted the song, we should share the original (non-shifted) file, since pitch-shifted files are temporary and the recipient won't have Shreddy.
- **Songs without normalized audio**: If `normalizedAudioPath` is null (processing not complete), hide or disable the share button.

## Edge Cases

| Case | Behavior |
|------|----------|
| Song still processing (no normalizedAudioPath) | Share button disabled/hidden |
| Large file (>30MB) | Show progress indicator during fetch |
| User cancels share sheet | No action needed (promise resolves) |
| Share API not supported | Falls back to direct download |
| No network (offline) | File is served from local server, should work |

## Acceptance Criteria

- [ ] Share button visible on practice page for songs with audio
- [ ] Tapping share on iPad Safari opens native share sheet with MP3 file
- [ ] Shared file has human-readable name (`Artist - Title.mp3`)
- [ ] Loading state shown while file is being prepared
- [ ] Fallback download works on browsers without Web Share API
- [ ] Share button hidden/disabled when song has no normalized audio
- [ ] Shared file is the original (not pitch-shifted) audio

## Scope Boundaries

- No section-specific export (sharing full song only)
- No format conversion (MP3 only, which is already the stored format)
- No server-side changes needed
- No sharing of metadata/structure alongside audio (that's the existing text/CSV/image export)

## Implementation Unit

### Unit 1: Share Audio Button

**Goal:** Add share button to practice page that opens native share sheet on iPad.

**Files:** `src/app/songs/[id]/page.tsx`

**Approach:**
1. Add `Share2` icon import from lucide-react
2. Add `handleShare` async function that fetches blob, creates File, calls `navigator.share` or falls back to download
3. Add share button in header area, with loading state
4. Disable when `!song.normalizedAudioPath`

**Patterns to follow:** Existing button patterns in the practice page header (settings icon, back link). Export button pattern in `SectionStrip.tsx`.

**Verification:** On iPad Safari, tap share button → native share sheet opens with MP3 file → can AirDrop to another device.

## Sources

- **Existing media endpoint:** `src/app/api/media/[filename]/route.ts` — serves MP3 with streaming and range requests
- **Audio processing:** `src/lib/process-audio.ts` — converts to 192kbps MP3
- **Practice page:** `src/app/songs/[id]/page.tsx` — where share button will be added
- **Web Share API:** Supported in Safari 15.4+, uses `navigator.share({ files })` and `navigator.canShare()`
