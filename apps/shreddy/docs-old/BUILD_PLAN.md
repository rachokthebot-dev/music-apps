# PracticePad — Build Plan

## Completed (M1–M15)
Core app: upload, audio processing, AI section detection, practice player with tempo/pitch control, multi-section loop, A-B loop, search, folders, bookmarks, notes, dark mode, song metadata, BPM display, two-column iPad layout. M15: practice settings persistence, tap-to-toggle multi-section selection for touch.

## Completed: M16 — Progress Tracking
**Goal:** Persist practice state so returning to a song feels seamless; fix touch selection.

- [ ] Remember last practice settings per song (tempo, pitch, selected sections)
- [ ] Multi-section selection on touch — tap-to-toggle (shift+click doesn't work on iPad)

**Schema changes:**
```
Song {
  + lastTempo      Float?    // last used tempo multiplier (e.g. 0.8)
  + lastPitch      Float?    // last used pitch shift
  + lastSelectedSections String?  // JSON array of section IDs
}
```

**API changes:**
- Extend `PATCH /api/songs/[id]` with `lastTempo`, `lastPitch`, `lastSelectedSections`

---

## M16 — Progress Tracking
**Goal:** Track practice effort and mastery to guide focused practice.

- [ ] Loop counter — display how many times each section has been looped this session
- [ ] Practice timer — track total time spent per song and per section
- [ ] Practice log — daily/weekly stats, streak tracking
- [ ] Section mastery rating — 1-5 stars per section, filter by "needs work"
- [ ] History — when was this song last practiced, at what tempo

**Schema changes:**
```
PracticeSession {
  id            String   @id @default(uuid())
  songId        String
  startedAt     DateTime @default(now())
  endedAt       DateTime?
  durationSec   Float?
  tempo         Float?   // tempo used during session
  pitch         Float?   // pitch used during session
  song          Song     @relation(...)
  sectionLogs   SectionPracticeLog[]
}

SectionPracticeLog {
  id              String   @id @default(uuid())
  sessionId       String
  sectionId       String
  loopCount       Int      @default(0)
  durationSec     Float    @default(0)
  session         PracticeSession @relation(...)
  section         Section @relation(...)
}

Section {
  + masteryRating  Int?    // 1-5 stars
}
```

**API changes:**
- `POST /api/practice-sessions` — start a session
- `PATCH /api/practice-sessions/[id]` — end session, update duration
- `POST /api/practice-sessions/[id]/logs` — record section loop/time
- `PATCH /api/sections/[id]` — extend with `masteryRating`
- `GET /api/stats` — aggregated practice stats (daily/weekly/streaks)
- `GET /api/songs/[id]/history` — practice history for a song

---

## M17 — Import & Advanced
**Goal:** More ways to get songs into the app.

- [ ] YouTube URL import — paste URL, download via yt-dlp, process as usual
- [ ] Duplicate song — copy song + sections for alternate practice versions

**Dependencies:** yt-dlp must be installed (or bundled in Docker)

**API changes:**
- `POST /api/import/youtube` — accepts URL, downloads audio, creates Song + ImportJob
- `POST /api/songs/[id]/duplicate` — clone song and its sections

---

## M18 — AI Practice Coach
**Goal:** Intelligent per-section practice recommendations powered by Claude.

- [ ] Analyze song structure + section difficulty via Claude API
- [ ] Per-section practice recommendations (e.g. "loop solo at 60% speed, 10 reps")
- [ ] Suggestions informed by mastery ratings and practice history from M16

**Schema changes:**
```
Section {
  + coachAdvice    String?   // AI-generated practice recommendation
  + difficulty     Int?      // 1-5 estimated difficulty
}
```

**API changes:**
- `POST /api/songs/[id]/coach` — generate practice plan for all sections
- Uses practice history + mastery ratings as context for Claude

**Depends on:** M16 (practice history data makes recommendations smarter)

---

## M19 — Metronome
**Goal:** Built-in metronome synced to song BPM and tempo slider.

### Phase 1: Core
- [ ] Audio click synced to BPM, respects tempo slider
- [ ] Volume control (independent of track volume)
- [ ] On/off toggle

### Phase 2: Practice Features
- [ ] Count-in (4 beats before playback/loop restart)
- [ ] Subdivisions (quarter, eighth, triplet)
- [ ] Time signature (4/4, 3/4, 6/8)
- [ ] Tap tempo (manual BPM correction)

### Phase 3: Visual
- [ ] Visual beat indicator (pulsing dot, beat counter)
- [ ] Metronome-only mode (click without track)

**No schema changes.** Metronome state is ephemeral (UI-only), BPM already stored on Song.

---

## M20 — Settings, API & Distribution
**Goal:** Make the app self-hostable by anyone with Docker.

- [ ] API key management in settings UI (not hardcoded env var)
- [ ] OpenAI API support as alternative for section analysis
- [ ] Dockerfile + docker-compose.yml
- [ ] README with self-hosting instructions

**Schema changes:**
```
Settings file (settings.json):
  + anthropicApiKey  String?
  + openaiApiKey     String?
  + aiProvider       "claude" | "openai"
```

**Code changes:**
- `analyze.py` — add OpenAI Vision path alongside Claude
- `process-audio.ts` — read API key from settings.json instead of env var
- Settings UI — API key input fields, provider selector

---

## Backlog (Low Priority)
- Speed ramp — auto-increase tempo by X% after N successful loops
- Section playlist — queue sections in custom order
- Random section pick — "surprise me"
- Slow-down workflow — start at 50%, auto-bump 5% each pass
- Per-section notes — "watch the hammer-on here"
- Section difficulty tags — easy/medium/hard
- Chord/key display per section
