import * as Tone from "tone";
import { ensureAudioContext } from "./audio-engine";

export interface Interval {
  name: string;
  shortName: string;
  semitones: number;
}

export const ALL_INTERVALS: Interval[] = [
  { name: "Minor 2nd", shortName: "m2", semitones: 1 },
  { name: "Major 2nd", shortName: "M2", semitones: 2 },
  { name: "Minor 3rd", shortName: "m3", semitones: 3 },
  { name: "Major 3rd", shortName: "M3", semitones: 4 },
  { name: "Perfect 4th", shortName: "P4", semitones: 5 },
  { name: "Tritone", shortName: "TT", semitones: 6 },
  { name: "Perfect 5th", shortName: "P5", semitones: 7 },
  { name: "Minor 6th", shortName: "m6", semitones: 8 },
  { name: "Major 6th", shortName: "M6", semitones: 9 },
  { name: "Minor 7th", shortName: "m7", semitones: 10 },
  { name: "Major 7th", shortName: "M7", semitones: 11 },
  { name: "Octave", shortName: "P8", semitones: 12 },
];

export type IntervalDifficulty = "easy" | "medium" | "hard";

const EASY_SEMITONES = new Set([3, 4, 5, 7, 12]); // m3, M3, P4, P5, P8
const MEDIUM_SEMITONES = new Set([1, 2, 3, 4, 5, 7, 10, 11, 12]); // add m2, M2, m7, M7

export function getIntervalsForDifficulty(difficulty: IntervalDifficulty): Interval[] {
  switch (difficulty) {
    case "easy":
      return ALL_INTERVALS.filter((i) => EASY_SEMITONES.has(i.semitones));
    case "medium":
      return ALL_INTERVALS.filter((i) => MEDIUM_SEMITONES.has(i.semitones));
    case "hard":
      return [...ALL_INTERVALS];
  }
}

export function getRandomInterval(difficulty: IntervalDifficulty): Interval {
  const pool = getIntervalsForDifficulty(difficulty);
  return pool[Math.floor(Math.random() * pool.length)];
}

const ROOT_NOTES = ["C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3"];

export function getRandomRootNote(): string {
  return ROOT_NOTES[Math.floor(Math.random() * ROOT_NOTES.length)];
}

function semitonesToNote(rootNote: string, semitones: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const match = rootNote.match(/^([A-G]#?)(\d)$/);
  if (!match) return rootNote;
  const [, name, octStr] = match;
  const octave = parseInt(octStr, 10);
  const rootIdx = noteNames.indexOf(name);
  const targetIdx = rootIdx + semitones;
  const newNote = noteNames[targetIdx % 12];
  const newOctave = octave + Math.floor(targetIdx / 12);
  return `${newNote}${newOctave}`;
}

let intervalSynth: Tone.Synth | null = null;

function getIntervalSynth(): Tone.Synth {
  if (!intervalSynth) {
    intervalSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.02,
        decay: 0.3,
        sustain: 0.5,
        release: 0.8,
      },
    }).toDestination();
    intervalSynth.volume.value = -6;
  }
  return intervalSynth;
}

export async function playInterval(rootNote: string, semitones: number): Promise<void> {
  await ensureAudioContext();
  const synth = getIntervalSynth();
  const secondNote = semitonesToNote(rootNote, semitones);

  const now = Tone.now();
  synth.triggerAttackRelease(rootNote, "4n", now);
  synth.triggerAttackRelease(secondNote, "4n", now + 0.6);
}

export function generateIntervalOptions(
  correct: Interval,
  difficulty: IntervalDifficulty,
  count: number = 4
): Interval[] {
  const pool = getIntervalsForDifficulty(difficulty).filter(
    (i) => i.semitones !== correct.semitones
  );

  // Shuffle and pick distractors
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const distractors = shuffled.slice(0, count - 1);

  // Combine with correct and shuffle
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return options;
}
