export interface ExtractedNote {
  id: string;
  bar: number;
  beat: number;      // 16th slot within the bar, 0..15
  dur: number;       // duration in 16th slots
  string: number;    // 1 = high e … 6 = low E
  fret: number;
  midi: number;
  startSec: number;  // absolute position in the song
  endSec: number;
  detectConf: number; // is this note really there
  fretConf: number;   // is this string/fret the right way to play it
  alts: { string: number; fret: number; extra: number }[];
}
