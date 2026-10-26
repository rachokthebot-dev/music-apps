// ASCII tab rendering.
//
// Guitar Scribble (guitarscribble.com) imports plain-text ASCII tab and can
// convert the technique letters h p / \ ~ b into its own symbols. Plain ASCII
// is also what every forum, text file and other tab editor accepts, so this
// doubles as the universal escape hatch from Shreddy.

export interface AsciiNote {
  bar: number;
  beat: number;    // 16th slot within the bar, 0..15
  string: number;  // 1 = high e … 6 = low E
  fret: number;
}

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const SLOTS_PER_BAR = 16;
const CHARS_PER_SLOT = 2;   // room for two-digit frets without collisions
const BAR_CHARS = SLOTS_PER_BAR * CHARS_PER_SLOT;

export interface AsciiTabOptions {
  barsPerSystem?: number;
  header?: string;
}

export function toAsciiTab(notes: AsciiNote[], options: AsciiTabOptions = {}): string {
  const barsPerSystem = options.barsPerSystem ?? 4;
  if (notes.length === 0) return options.header ? `${options.header}\n` : "";

  const lastBar = Math.max(...notes.map(n => n.bar));
  const out: string[] = [];
  if (options.header) out.push(options.header, "");

  for (let start = 1; start <= lastBar; start += barsPerSystem) {
    const end = Math.min(start + barsPerSystem - 1, lastBar);
    const barCount = end - start + 1;

    // one row of dashes per string, split into bars
    const rows = STRING_LABELS.map(() =>
      Array.from({ length: barCount }, () => new Array<string>(BAR_CHARS).fill("-"))
    );

    for (const n of notes) {
      if (n.bar < start || n.bar > end) continue;
      const bar = rows[n.string - 1][n.bar - start];
      const text = String(n.fret);
      const col = Math.min(n.beat, SLOTS_PER_BAR - 1) * CHARS_PER_SLOT;
      for (let i = 0; i < text.length && col + i < BAR_CHARS; i++) {
        bar[col + i] = text[i];
      }
    }

    rows.forEach((bars, i) => {
      out.push(`${STRING_LABELS[i]}|${bars.map(b => b.join("")).join("|")}|`);
    });
    if (end < lastBar) out.push("");
  }

  return out.join("\n") + "\n";
}
