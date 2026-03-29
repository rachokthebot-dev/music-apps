export interface ChordVoicing {
  name: string;
  frets: (number | -1)[]; // 6 values, low E to high E. -1 = muted, 0 = open
  fingers: number[];       // which finger on each string (0 = none/open)
  barres?: number[];       // barre fret positions
  baseFret: number;        // 1 for open position, higher for barre
  positionLabel?: string;  // e.g. "Open", "5th fret barre"
}

// Database of chord voicings keyed by chord name
// Each chord has an array of voicings (at least 1, common chords have 2-3)
export const chordVoicings: Record<string, ChordVoicing[]> = {
  // ============ MAJOR CHORDS ============
  "C": [
    {
      name: "C",
      frets: [-1, 3, 2, 0, 1, 0],
      fingers: [0, 3, 2, 0, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "C",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret barre",
    },
    {
      name: "C",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 8,
      positionLabel: "8th fret barre",
    },
  ],
  "D": [
    {
      name: "D",
      frets: [-1, -1, 0, 2, 3, 2],
      fingers: [0, 0, 0, 1, 3, 2],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "D",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 5,
      positionLabel: "5th fret barre",
    },
    {
      name: "D",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 10,
      positionLabel: "10th fret barre",
    },
  ],
  "E": [
    {
      name: "E",
      frets: [0, 2, 2, 1, 0, 0],
      fingers: [0, 2, 3, 1, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "E",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 7,
      positionLabel: "7th fret barre",
    },
  ],
  "F": [
    {
      name: "F",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
    {
      name: "F",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 8,
      positionLabel: "8th fret barre",
    },
  ],
  "G": [
    {
      name: "G",
      frets: [3, 2, 0, 0, 0, 3],
      fingers: [2, 1, 0, 0, 0, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "G",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret barre",
    },
    {
      name: "G",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 10,
      positionLabel: "10th fret barre",
    },
  ],
  "A": [
    {
      name: "A",
      frets: [-1, 0, 2, 2, 2, 0],
      fingers: [0, 0, 1, 2, 3, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "A",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 5,
      positionLabel: "5th fret barre",
    },
  ],
  "B": [
    {
      name: "B",
      frets: [-1, 1, 3, 3, 3, 1],
      fingers: [0, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret barre",
    },
    {
      name: "B",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 7,
      positionLabel: "7th fret barre",
    },
  ],
  "Bb": [
    {
      name: "Bb",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
    {
      name: "Bb",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 6,
      positionLabel: "6th fret barre",
    },
  ],
  "Eb": [
    {
      name: "Eb",
      frets: [-1, 1, 1, 3, 4, 3],
      fingers: [0, 1, 1, 3, 4, 2],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret",
    },
    {
      name: "Eb",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 6,
      positionLabel: "6th fret barre",
    },
  ],
  "Ab": [
    {
      name: "Ab",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
    {
      name: "Ab",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 11,
      positionLabel: "11th fret barre",
    },
  ],
  "Db": [
    {
      name: "Db",
      frets: [-1, 1, 3, 3, 3, 1],
      fingers: [0, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
    {
      name: "Db",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 9,
      positionLabel: "9th fret barre",
    },
  ],
  "F#": [
    {
      name: "F#",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret barre",
    },
    {
      name: "F#",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 9,
      positionLabel: "9th fret barre",
    },
  ],
  "C#": [
    {
      name: "C#",
      frets: [-1, 1, 3, 3, 3, 1],
      fingers: [0, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
    {
      name: "C#",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 9,
      positionLabel: "9th fret barre",
    },
  ],
  "G#": [
    {
      name: "G#",
      frets: [1, 3, 3, 2, 1, 1],
      fingers: [1, 3, 4, 2, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],
  "D#": [
    {
      name: "D#",
      frets: [-1, 1, 1, 3, 4, 3],
      fingers: [0, 1, 1, 3, 4, 2],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret",
    },
  ],
  "A#": [
    {
      name: "A#",
      frets: [1, 1, 3, 3, 3, 1],
      fingers: [1, 1, 2, 3, 4, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],

  // ============ MINOR CHORDS ============
  "Cm": [
    {
      name: "Cm",
      frets: [-1, 3, 1, 0, 1, 3],
      fingers: [0, 3, 1, 0, 2, 4],
      baseFret: 1,
      positionLabel: "Open position",
    },
    {
      name: "Cm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret barre",
    },
  ],
  "Dm": [
    {
      name: "Dm",
      frets: [-1, -1, 0, 2, 3, 1],
      fingers: [0, 0, 0, 2, 3, 1],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "Dm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 5,
      positionLabel: "5th fret barre",
    },
  ],
  "Em": [
    {
      name: "Em",
      frets: [0, 2, 2, 0, 0, 0],
      fingers: [0, 2, 3, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "Em",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 7,
      positionLabel: "7th fret barre",
    },
  ],
  "Fm": [
    {
      name: "Fm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
    {
      name: "Fm",
      frets: [1, 1, 3, 3, 2, 1],
      fingers: [1, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 8,
      positionLabel: "8th fret barre",
    },
  ],
  "Gm": [
    {
      name: "Gm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret barre",
    },
    {
      name: "Gm",
      frets: [1, 1, 3, 3, 2, 1],
      fingers: [1, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 10,
      positionLabel: "10th fret barre",
    },
  ],
  "Am": [
    {
      name: "Am",
      frets: [-1, 0, 2, 2, 1, 0],
      fingers: [0, 0, 2, 3, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
    {
      name: "Am",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 5,
      positionLabel: "5th fret barre",
    },
  ],
  "Bm": [
    {
      name: "Bm",
      frets: [-1, 1, 3, 3, 2, 1],
      fingers: [0, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret barre",
    },
    {
      name: "Bm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 7,
      positionLabel: "7th fret barre",
    },
  ],
  "Bbm": [
    {
      name: "Bbm",
      frets: [1, 1, 3, 3, 2, 1],
      fingers: [1, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
    {
      name: "Bbm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 6,
      positionLabel: "6th fret barre",
    },
  ],
  "Ebm": [
    {
      name: "Ebm",
      frets: [-1, 1, 1, 3, 4, 2],
      fingers: [0, 1, 1, 3, 4, 2],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret",
    },
    {
      name: "Ebm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 6,
      positionLabel: "6th fret barre",
    },
  ],
  "Abm": [
    {
      name: "Abm",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],
  "C#m": [
    {
      name: "C#m",
      frets: [-1, 1, 3, 3, 2, 1],
      fingers: [0, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
    {
      name: "C#m",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 9,
      positionLabel: "9th fret barre",
    },
  ],
  "F#m": [
    {
      name: "F#m",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret barre",
    },
    {
      name: "F#m",
      frets: [1, 1, 3, 3, 2, 1],
      fingers: [1, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 9,
      positionLabel: "9th fret barre",
    },
  ],
  "G#m": [
    {
      name: "G#m",
      frets: [1, 3, 3, 1, 1, 1],
      fingers: [1, 3, 4, 1, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],
  "D#m": [
    {
      name: "D#m",
      frets: [-1, 1, 1, 3, 4, 2],
      fingers: [0, 1, 1, 3, 4, 2],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret",
    },
  ],
  "A#m": [
    {
      name: "A#m",
      frets: [1, 1, 3, 3, 2, 1],
      fingers: [1, 1, 3, 4, 2, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],

  // ============ DIMINISHED CHORDS ============
  "Bdim": [
    {
      name: "Bdim",
      frets: [-1, 2, 3, 4, 3, -1],
      fingers: [0, 1, 2, 4, 3, 0],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "C#dim": [
    {
      name: "C#dim",
      frets: [-1, 4, 5, 3, -1, -1],
      fingers: [0, 2, 3, 1, 0, 0],
      baseFret: 1,
      positionLabel: "4th fret",
    },
  ],
  "D#dim": [
    {
      name: "D#dim",
      frets: [-1, -1, 1, 2, 1, 2],
      fingers: [0, 0, 1, 3, 2, 4],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "Dbdim": [
    {
      name: "Dbdim",
      frets: [-1, 4, 5, 3, -1, -1],
      fingers: [0, 2, 3, 1, 0, 0],
      baseFret: 1,
      positionLabel: "4th fret",
    },
  ],
  "F#dim": [
    {
      name: "F#dim",
      frets: [2, -1, 4, 2, 1, -1],
      fingers: [2, 0, 4, 3, 1, 0],
      baseFret: 1,
      positionLabel: "2nd fret",
    },
  ],
  "Gbdim": [
    {
      name: "Gbdim",
      frets: [2, -1, 4, 2, 1, -1],
      fingers: [2, 0, 4, 3, 1, 0],
      baseFret: 1,
      positionLabel: "2nd fret",
    },
  ],
  "G#dim": [
    {
      name: "G#dim",
      frets: [4, -1, 6, 4, 3, -1],
      fingers: [2, 0, 4, 3, 1, 0],
      baseFret: 1,
      positionLabel: "4th fret",
    },
  ],
  "Abdim": [
    {
      name: "Abdim",
      frets: [4, -1, 6, 4, 3, -1],
      fingers: [2, 0, 4, 3, 1, 0],
      baseFret: 1,
      positionLabel: "4th fret",
    },
  ],
  "Edim": [
    {
      name: "Edim",
      frets: [0, 1, 2, 0, -1, -1],
      fingers: [0, 1, 2, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Adim": [
    {
      name: "Adim",
      frets: [-1, 0, 1, 2, 1, -1],
      fingers: [0, 0, 1, 3, 2, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Ddim": [
    {
      name: "Ddim",
      frets: [-1, -1, 0, 1, 0, 1],
      fingers: [0, 0, 0, 1, 0, 2],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Gdim": [
    {
      name: "Gdim",
      frets: [3, -1, 5, 3, 2, -1],
      fingers: [2, 0, 4, 3, 1, 0],
      baseFret: 1,
      positionLabel: "3rd fret",
    },
  ],
  "Fdim": [
    {
      name: "Fdim",
      frets: [1, -1, 3, 1, 0, -1],
      fingers: [1, 0, 3, 2, 0, 0],
      baseFret: 1,
      positionLabel: "1st fret",
    },
  ],
  "Cdim": [
    {
      name: "Cdim",
      frets: [-1, 3, 4, 2, -1, -1],
      fingers: [0, 2, 3, 1, 0, 0],
      baseFret: 1,
      positionLabel: "3rd fret",
    },
  ],
  "Bbdim": [
    {
      name: "Bbdim",
      frets: [-1, 1, 2, 3, 2, -1],
      fingers: [0, 1, 2, 4, 3, 0],
      baseFret: 1,
      positionLabel: "1st fret",
    },
  ],

  // ============ 7TH CHORDS ============
  // Major 7ths
  "Cmaj7": [
    {
      name: "Cmaj7",
      frets: [-1, 3, 2, 0, 0, 0],
      fingers: [0, 3, 2, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Dmaj7": [
    {
      name: "Dmaj7",
      frets: [-1, -1, 0, 2, 2, 2],
      fingers: [0, 0, 0, 1, 2, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Emaj7": [
    {
      name: "Emaj7",
      frets: [0, 2, 1, 1, 0, 0],
      fingers: [0, 3, 1, 2, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Fmaj7": [
    {
      name: "Fmaj7",
      frets: [1, -1, 2, 2, 1, 0],
      fingers: [1, 0, 3, 4, 2, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Gmaj7": [
    {
      name: "Gmaj7",
      frets: [3, 2, 0, 0, 0, 2],
      fingers: [2, 1, 0, 0, 0, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Amaj7": [
    {
      name: "Amaj7",
      frets: [-1, 0, 2, 1, 2, 0],
      fingers: [0, 0, 2, 1, 3, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Bmaj7": [
    {
      name: "Bmaj7",
      frets: [-1, 2, 4, 3, 4, 2],
      fingers: [0, 1, 3, 2, 4, 1],
      barres: [2],
      baseFret: 1,
      positionLabel: "2nd fret",
    },
  ],
  "Bbmaj7": [
    {
      name: "Bbmaj7",
      frets: [-1, 1, 3, 2, 3, 1],
      fingers: [0, 1, 3, 2, 4, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret",
    },
  ],
  "Ebmaj7": [
    {
      name: "Ebmaj7",
      frets: [-1, 1, 1, 3, 3, 3],
      fingers: [0, 1, 1, 2, 3, 4],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret",
    },
  ],
  "Abmaj7": [
    {
      name: "Abmaj7",
      frets: [1, 3, 2, 2, 1, 1],
      fingers: [1, 4, 2, 3, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret",
    },
  ],
  "Dbmaj7": [
    {
      name: "Dbmaj7",
      frets: [-1, 4, 3, 1, 1, 1],
      fingers: [0, 4, 3, 1, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "F#maj7": [
    {
      name: "F#maj7",
      frets: [1, 3, 2, 2, 1, 1],
      fingers: [1, 4, 2, 3, 1, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret",
    },
  ],
  "C#maj7": [
    {
      name: "C#maj7",
      frets: [-1, 4, 3, 1, 1, 1],
      fingers: [0, 4, 3, 1, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],

  // Minor 7ths
  "Cm7": [
    {
      name: "Cm7",
      frets: [-1, 3, 1, 3, 1, 3],
      fingers: [0, 2, 1, 3, 1, 4],
      barres: [1],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "Dm7": [
    {
      name: "Dm7",
      frets: [-1, -1, 0, 2, 1, 1],
      fingers: [0, 0, 0, 3, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Em7": [
    {
      name: "Em7",
      frets: [0, 2, 0, 0, 0, 0],
      fingers: [0, 1, 0, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Fm7": [
    {
      name: "Fm7",
      frets: [1, 3, 1, 1, 1, 1],
      fingers: [1, 3, 1, 1, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],
  "Gm7": [
    {
      name: "Gm7",
      frets: [1, 3, 1, 1, 1, 1],
      fingers: [1, 3, 1, 1, 1, 1],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret barre",
    },
  ],
  "Am7": [
    {
      name: "Am7",
      frets: [-1, 0, 2, 0, 1, 0],
      fingers: [0, 0, 2, 0, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Bm7": [
    {
      name: "Bm7",
      frets: [-1, 2, 0, 2, 0, 2],
      fingers: [0, 1, 0, 2, 0, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Bbm7": [
    {
      name: "Bbm7",
      frets: [1, 1, 3, 1, 2, 1],
      fingers: [1, 1, 3, 1, 2, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],
  "Ebm7": [
    {
      name: "Ebm7",
      frets: [-1, 1, 1, 3, 2, 2],
      fingers: [0, 1, 1, 4, 2, 3],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret",
    },
  ],
  "Abm7": [
    {
      name: "Abm7",
      frets: [1, 3, 1, 1, 1, 1],
      fingers: [1, 3, 1, 1, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],
  "C#m7": [
    {
      name: "C#m7",
      frets: [-1, 1, 3, 1, 2, 1],
      fingers: [0, 1, 3, 1, 2, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret",
    },
  ],
  "F#m7": [
    {
      name: "F#m7",
      frets: [2, 0, 2, 2, 2, 0],
      fingers: [1, 0, 2, 3, 4, 0],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],

  // Dominant 7ths
  "C7": [
    {
      name: "C7",
      frets: [-1, 3, 2, 3, 1, 0],
      fingers: [0, 3, 2, 4, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "D7": [
    {
      name: "D7",
      frets: [-1, -1, 0, 2, 1, 2],
      fingers: [0, 0, 0, 2, 1, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "E7": [
    {
      name: "E7",
      frets: [0, 2, 0, 1, 0, 0],
      fingers: [0, 2, 0, 1, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "F7": [
    {
      name: "F7",
      frets: [1, 3, 1, 2, 1, 1],
      fingers: [1, 3, 1, 2, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],
  "G7": [
    {
      name: "G7",
      frets: [3, 2, 0, 0, 0, 1],
      fingers: [3, 2, 0, 0, 0, 1],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "A7": [
    {
      name: "A7",
      frets: [-1, 0, 2, 0, 2, 0],
      fingers: [0, 0, 1, 0, 2, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "B7": [
    {
      name: "B7",
      frets: [-1, 2, 1, 2, 0, 2],
      fingers: [0, 2, 1, 3, 0, 4],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Bb7": [
    {
      name: "Bb7",
      frets: [1, 1, 3, 1, 3, 1],
      fingers: [1, 1, 2, 1, 3, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],
  "Eb7": [
    {
      name: "Eb7",
      frets: [-1, 1, 1, 3, 2, 3],
      fingers: [0, 1, 1, 3, 2, 4],
      barres: [1],
      baseFret: 3,
      positionLabel: "3rd fret",
    },
  ],
  "Ab7": [
    {
      name: "Ab7",
      frets: [1, 3, 1, 2, 1, 1],
      fingers: [1, 3, 1, 2, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],
  "Db7": [
    {
      name: "Db7",
      frets: [-1, 4, 3, 4, 2, -1],
      fingers: [0, 3, 2, 4, 1, 0],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "F#7": [
    {
      name: "F#7",
      frets: [1, 3, 1, 2, 1, 1],
      fingers: [1, 3, 1, 2, 1, 1],
      barres: [1],
      baseFret: 2,
      positionLabel: "2nd fret barre",
    },
  ],
  "C#7": [
    {
      name: "C#7",
      frets: [-1, 4, 3, 4, 2, -1],
      fingers: [0, 3, 2, 4, 1, 0],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "G#7": [
    {
      name: "G#7",
      frets: [1, 3, 1, 2, 1, 1],
      fingers: [1, 3, 1, 2, 1, 1],
      barres: [1],
      baseFret: 4,
      positionLabel: "4th fret barre",
    },
  ],

  // ============ EXTENDED / SUS CHORDS ============
  // sus4 chords
  "Csus4": [
    {
      name: "Csus4",
      frets: [-1, 3, 3, 0, 1, 1],
      fingers: [0, 3, 4, 0, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Dsus4": [
    {
      name: "Dsus4",
      frets: [-1, -1, 0, 2, 3, 3],
      fingers: [0, 0, 0, 1, 2, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Esus4": [
    {
      name: "Esus4",
      frets: [0, 2, 2, 2, 0, 0],
      fingers: [0, 1, 2, 3, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Fsus4": [
    {
      name: "Fsus4",
      frets: [1, 1, 3, 3, 1, 1],
      fingers: [1, 1, 3, 4, 1, 1],
      barres: [1],
      baseFret: 1,
      positionLabel: "1st fret barre",
    },
  ],
  "Gsus4": [
    {
      name: "Gsus4",
      frets: [3, -1, 0, 0, 1, 3],
      fingers: [2, 0, 0, 0, 1, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Asus4": [
    {
      name: "Asus4",
      frets: [-1, 0, 2, 2, 3, 0],
      fingers: [0, 0, 1, 2, 3, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],

  // add9 chords
  "Cadd9": [
    {
      name: "Cadd9",
      frets: [-1, 3, 2, 0, 3, 0],
      fingers: [0, 2, 1, 0, 3, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Dadd9": [
    {
      name: "Dadd9",
      frets: [-1, -1, 0, 2, 3, 0],
      fingers: [0, 0, 0, 1, 2, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Eadd9": [
    {
      name: "Eadd9",
      frets: [0, 2, 2, 1, 0, 2],
      fingers: [0, 2, 3, 1, 0, 4],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Gadd9": [
    {
      name: "Gadd9",
      frets: [3, 0, 0, 0, 0, 3],
      fingers: [2, 0, 0, 0, 0, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Aadd9": [
    {
      name: "Aadd9",
      frets: [-1, 0, 2, 2, 2, 2],
      fingers: [0, 0, 1, 2, 3, 4],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],

  // 9th chords (dominant 9th - for advanced level)
  "C9": [
    {
      name: "C9",
      frets: [-1, 3, 2, 3, 3, 3],
      fingers: [0, 2, 1, 3, 3, 3],
      barres: [3],
      baseFret: 1,
      positionLabel: "Open position",
    },
  ],
  "D9": [
    {
      name: "D9",
      frets: [-1, -1, 0, 2, 1, 0],
      fingers: [0, 0, 0, 2, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "G9": [
    {
      name: "G9",
      frets: [3, 0, 0, 0, 0, 1],
      fingers: [3, 0, 0, 0, 0, 1],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "A9": [
    {
      name: "A9",
      frets: [-1, 0, 2, 4, 2, 3],
      fingers: [0, 0, 1, 3, 1, 2],
      barres: [2],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],

  // maj9 chords
  "Cmaj9": [
    {
      name: "Cmaj9",
      frets: [-1, 3, 2, 0, 0, 0],
      fingers: [0, 3, 2, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Dmaj9": [
    {
      name: "Dmaj9",
      frets: [-1, -1, 0, 2, 2, 0],
      fingers: [0, 0, 0, 1, 2, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Fmaj9": [
    {
      name: "Fmaj9",
      frets: [1, 0, 2, 0, 1, 0],
      fingers: [2, 0, 3, 0, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Gmaj9": [
    {
      name: "Gmaj9",
      frets: [3, 0, 0, 0, 0, 2],
      fingers: [2, 0, 0, 0, 0, 1],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Amaj9": [
    {
      name: "Amaj9",
      frets: [-1, 0, 2, 1, 2, 0],
      fingers: [0, 0, 2, 1, 3, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],

  // min9 chords
  "Am9": [
    {
      name: "Am9",
      frets: [-1, 0, 2, 0, 1, 0],
      fingers: [0, 0, 2, 0, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Dm9": [
    {
      name: "Dm9",
      frets: [-1, -1, 0, 2, 1, 0],
      fingers: [0, 0, 0, 2, 1, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "Em9": [
    {
      name: "Em9",
      frets: [0, 2, 0, 0, 0, 2],
      fingers: [0, 1, 0, 0, 0, 2],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],

  // 13th chords (simplified voicings)
  "G13": [
    {
      name: "G13",
      frets: [3, 2, 0, 0, 0, 0],
      fingers: [2, 1, 0, 0, 0, 0],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
  "C13": [
    {
      name: "C13",
      frets: [-1, 3, 2, 3, 3, 5],
      fingers: [0, 2, 1, 3, 3, 4],
      baseFret: 1,
      positionLabel: "3rd fret",
    },
  ],
  "A13": [
    {
      name: "A13",
      frets: [-1, 0, 2, 0, 2, 2],
      fingers: [0, 0, 1, 0, 2, 3],
      baseFret: 1,
      positionLabel: "Open",
    },
  ],
};

/**
 * Look up voicings for a chord name.
 * Tries exact match first, then falls back to enharmonic equivalents.
 */
export function getVoicings(chordName: string): ChordVoicing[] {
  if (chordVoicings[chordName]) {
    return chordVoicings[chordName];
  }

  // Enharmonic mappings for lookup fallback
  const enharmonics: Record<string, string> = {
    "Gb": "F#", "F#": "Gb",
    "Db": "C#", "C#": "Db",
    "Ab": "G#", "G#": "Ab",
    "Eb": "D#", "D#": "Eb",
    "Bb": "A#", "A#": "Bb",
    "Gbm": "F#m", "F#m": "Gbm",
    "Dbm": "C#m", "C#m": "Dbm",
    "Abm": "G#m", "G#m": "Abm",
    "Ebm": "D#m", "D#m": "Ebm",
    "Bbm": "A#m", "A#m": "Bbm",
  };

  // Try enharmonic equivalent
  const alt = enharmonics[chordName];
  if (alt && chordVoicings[alt]) {
    return chordVoicings[alt];
  }

  // Try extracting root + quality and looking up enharmonic root
  const rootMatch = chordName.match(/^([A-G][b#]?)(.*)/);
  if (rootMatch) {
    const [, root, suffix] = rootMatch;
    const altRoot = enharmonics[root];
    if (altRoot) {
      const altName = `${altRoot}${suffix}`;
      if (chordVoicings[altName]) {
        return chordVoicings[altName];
      }
    }
  }

  return [];
}
