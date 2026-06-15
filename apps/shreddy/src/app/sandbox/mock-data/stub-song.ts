/**
 * Stub song registry for the deep-practice sandbox.
 *
 * Fresh hand-rolled types instead of importing from @prisma/client — the
 * mockups don't care about DB-only fields (timestamps, pinned, folderIds,
 * etc.). Following the `/drafts/mock-data.ts` precedent: duplication over
 * coupling to schema.
 *
 * Generated `song-a.json` (BPM, key, sections, beats) is loaded at runtime
 * from `/shreddy/stubs/song-a.json` so the analyze.py output can be
 * regenerated without touching this file.
 */

export type StubId = "song-a";

export interface StubSection {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
}

export interface StubSong {
  id: StubId;
  title: string;
  artist: string;
  bpm: number;
  beatsPerBar: 3 | 4 | 6;
  key: string;
  durationSec: number;
  audioUrl: string;
  jsonUrl: string;
  /** Analyzed beat timestamps in seconds (loaded from jsonUrl at runtime). */
  beatTimestamps?: number[];
  sections?: StubSection[];
}

/**
 * Hardcoded registry. One song is enough for grading all 7 techniques;
 * second song was cut during plan-deepening (origin §"Outstanding Questions").
 */
export const stubSongs = [
  {
    id: "song-a" as const,
    title: "Stub song A",
    artist: "(sandbox stub)",
    bpm: 117,
    beatsPerBar: 4 as const,
    key: "A Major",
    durationSec: 70,
    audioUrl: "/shreddy/stubs/song-a.mp3",
    jsonUrl: "/shreddy/stubs/song-a.json",
  },
] as const satisfies readonly StubSong[];

export const defaultStub: StubSong = stubSongs[0];
