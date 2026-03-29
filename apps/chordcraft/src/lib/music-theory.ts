export type ChordQuality =
  | "major"
  | "minor"
  | "diminished"
  | "maj7"
  | "min7"
  | "dom7"
  | "dim7"
  | "min7b5"
  | "sus4"
  | "sus2"
  | "add9"
  | "maj9"
  | "min9"
  | "dom9"
  | "dom13";

export interface Chord {
  name: string;
  root: string;
  quality: ChordQuality;
  numeral: string;
}

export type ComplexityLevel = "basic" | "intermediate" | "advanced";

// Chromatic scale using sharps
const CHROMATIC_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Display-friendly key names (use flats where conventional)
export const ALL_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Map display key names to chromatic index
function keyToIndex(key: string): number {
  const map: Record<string, number> = {
    "C": 0, "C#": 1, "Db": 1,
    "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "F": 5, "F#": 6, "Gb": 6,
    "G": 7, "G#": 8, "Ab": 8,
    "A": 9, "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
  };
  return map[key] ?? 0;
}

// Note name from chromatic index, preferring the key's convention
function noteName(index: number, preferFlats: boolean): string {
  const sharps = CHROMATIC_SHARPS;
  const flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const arr = preferFlats ? flats : sharps;
  return arr[((index % 12) + 12) % 12];
}

// Major scale intervals (semitones from root)
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

interface NumeralInfo {
  scaleDegree: number; // 0-based
  quality: "major" | "minor" | "diminished";
  chromaticOffset: number; // semitone offset from the key root
}

function parseNumeral(numeral: string): NumeralInfo {
  let work = numeral.trim();

  // Check for flat modifier
  let flat = false;
  if (work.startsWith("b") || work.startsWith("\u266d")) {
    flat = true;
    work = work.slice(1);
  }

  // Check for diminished symbol
  let forceDim = false;
  if (work.endsWith("\u00b0") || work.endsWith("dim")) {
    forceDim = true;
    work = work.replace(/[°]|dim$/, "");
  }

  // Determine quality from case
  const upper = work.toUpperCase();
  const isUpper = work === upper;

  const numeralMap: Record<string, number> = {
    "I": 0, "II": 1, "III": 2, "IV": 3, "V": 4, "VI": 5, "VII": 6,
  };

  const scaleDegree = numeralMap[upper] ?? 0;

  let quality: "major" | "minor" | "diminished";
  if (forceDim) {
    quality = "diminished";
  } else if (isUpper) {
    quality = "major";
  } else {
    quality = "minor";
  }

  // Chromatic offset: take from major scale, then apply flat if needed
  let chromaticOffset = MAJOR_SCALE_INTERVALS[scaleDegree];
  if (flat) {
    chromaticOffset -= 1;
  }

  return { scaleDegree, quality, chromaticOffset };
}

// Map basic quality to intermediate (7th) quality
function getIntermediateQuality(basicQuality: "major" | "minor" | "diminished", scaleDegree: number, isFlat: boolean): ChordQuality {
  // In a major key, diatonic 7ths are:
  // I=maj7, ii=min7, iii=min7, IV=maj7, V=dom7, vi=min7, vii=min7b5
  if (basicQuality === "diminished") return "min7b5";
  if (basicQuality === "minor") return "min7";
  // Major chords
  if (scaleDegree === 4 || isFlat) return "dom7"; // V and flat numerals are dominant
  return "maj7"; // I, IV
}

// Map basic quality to advanced (extended) quality
function getAdvancedQuality(basicQuality: "major" | "minor" | "diminished", scaleDegree: number, isFlat: boolean): ChordQuality {
  if (basicQuality === "diminished") return "min7b5";
  if (basicQuality === "minor") {
    return "min9";
  }
  // Major chords
  if (scaleDegree === 4 || isFlat) return "dom13"; // V = dom13
  if (scaleDegree === 3) return "sus4"; // IV can be sus4 for flavor
  return "maj9"; // I = maj9
}

// Quality to display suffix
function qualitySuffix(quality: ChordQuality): string {
  switch (quality) {
    case "major": return "";
    case "minor": return "m";
    case "diminished": return "dim";
    case "maj7": return "maj7";
    case "min7": return "m7";
    case "dom7": return "7";
    case "dim7": return "dim7";
    case "min7b5": return "m7b5";
    case "sus4": return "sus4";
    case "sus2": return "sus2";
    case "add9": return "add9";
    case "maj9": return "maj9";
    case "min9": return "m9";
    case "dom9": return "9";
    case "dom13": return "13";
  }
}

export function getChordForNumeral(
  key: string,
  numeral: string
): Chord {
  const keyIdx = keyToIndex(key);
  const preferFlats = key.includes("b") || ["F", "Bb", "Eb", "Ab", "Db"].includes(key);
  const info = parseNumeral(numeral);
  const rootIdx = (keyIdx + info.chromaticOffset + 12) % 12;
  const root = noteName(rootIdx, preferFlats);

  const suffix = qualitySuffix(info.quality);
  const name = `${root}${suffix}`;

  return { name, root, quality: info.quality, numeral };
}

export function getChordForNumeralAtLevel(
  key: string,
  numeral: string,
  level: ComplexityLevel
): Chord {
  if (level === "basic") {
    return getChordForNumeral(key, numeral);
  }

  const keyIdx = keyToIndex(key);
  const preferFlats = key.includes("b") || ["F", "Bb", "Eb", "Ab", "Db"].includes(key);
  const info = parseNumeral(numeral);
  const rootIdx = (keyIdx + info.chromaticOffset + 12) % 12;
  const root = noteName(rootIdx, preferFlats);

  const isFlat = numeral.startsWith("b") || numeral.startsWith("\u266d");

  let quality: ChordQuality;
  if (level === "intermediate") {
    quality = getIntermediateQuality(info.quality, info.scaleDegree, isFlat);
  } else {
    quality = getAdvancedQuality(info.quality, info.scaleDegree, isFlat);
  }

  const suffix = qualitySuffix(quality);
  const name = `${root}${suffix}`;

  return { name, root, quality, numeral };
}

export function getProgressionInKey(numerals: string[], key: string, level: ComplexityLevel = "basic"): Chord[] {
  return numerals.map((n) => getChordForNumeralAtLevel(key, n, level));
}

// Note arrays for Tone.js playback
const CHORD_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  min7b5: [0, 3, 6, 10],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  dom9: [0, 4, 7, 10, 14],
  dom13: [0, 4, 7, 10, 14, 21],
};

export function chordToNotes(root: string, quality: ChordQuality, octave: number = 3): string[] {
  const rootIdx = keyToIndex(root);
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS["major"];
  const preferFlats = root.includes("b");

  return intervals.map((interval) => {
    const noteIdx = (rootIdx + interval) % 12;
    const name = noteName(noteIdx, preferFlats);
    const noteOctave = octave + Math.floor((rootIdx + interval) / 12);
    return `${name}${noteOctave}`;
  });
}
