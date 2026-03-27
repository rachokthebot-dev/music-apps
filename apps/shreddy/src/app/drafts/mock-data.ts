export const mockSong = {
  id: "1",
  title: "Vse Eto Rock N Roll",
  artist: "JaroDX59",
  album: "",
  genre: "Russian Rock",
  year: "",
  bpm: 86,
  durationSec: 269,
  notes: "",
};

export const mockSections = [
  { id: "s1", name: "Intro", startSec: 0, endSec: 14, orderIndex: 0, autoDetected: true, masteryRating: 3 },
  { id: "s2", name: "Verse 1", startSec: 14, endSec: 41, orderIndex: 1, autoDetected: true, masteryRating: 2 },
  { id: "s3", name: "Pre-Chorus 1", startSec: 41, endSec: 60, orderIndex: 2, autoDetected: true, masteryRating: null },
  { id: "s4", name: "Chorus 1", startSec: 60, endSec: 92, orderIndex: 3, autoDetected: true, masteryRating: 4 },
  { id: "s5", name: "Verse 2", startSec: 92, endSec: 123, orderIndex: 4, autoDetected: true, masteryRating: null },
  { id: "s6", name: "Pre-Chorus 2", startSec: 123, endSec: 141, orderIndex: 5, autoDetected: true, masteryRating: 1 },
  { id: "s7", name: "Chorus 2", startSec: 141, endSec: 172, orderIndex: 6, autoDetected: true, masteryRating: 3 },
  { id: "s8", name: "Bridge", startSec: 172, endSec: 200, orderIndex: 7, autoDetected: true, masteryRating: null },
  { id: "s9", name: "Solo", startSec: 200, endSec: 225, orderIndex: 8, autoDetected: true, masteryRating: 5 },
  { id: "s10", name: "Chorus 3", startSec: 225, endSec: 255, orderIndex: 9, autoDetected: true, masteryRating: 2 },
  { id: "s11", name: "Outro", startSec: 255, endSec: 269, orderIndex: 10, autoDetected: true, masteryRating: null },
];

export const sectionColors = [
  "bg-purple-400/40", "bg-blue-400/40", "bg-green-400/40", "bg-yellow-400/40",
  "bg-red-400/40", "bg-teal-400/40", "bg-orange-400/40", "bg-pink-400/40",
  "bg-lime-400/40", "bg-sky-400/40", "bg-violet-400/40",
];

export const sectionDotColors = [
  "bg-purple-400", "bg-blue-400", "bg-green-400", "bg-yellow-400",
  "bg-red-400", "bg-teal-400", "bg-orange-400", "bg-pink-400",
  "bg-lime-400", "bg-sky-400", "bg-violet-400",
];

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
