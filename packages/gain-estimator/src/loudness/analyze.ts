/**
 * Segmentation and measurement over decoded audio — no WAV, no Buffer.
 *
 * Split out of segment.ts so the browser can run the exact same code the
 * server does. Live capture already arrives as Float32Array channels from an
 * AudioWorklet; making it round-trip through a WAV encode just to be measured
 * would be a second implementation waiting to drift from this one.
 *
 * segment.ts keeps the Buffer-taking entry point for the upload path.
 */

import { integratedLufs, momentaryTrace, MOMENTARY_HOP_SEC } from "./bs1770";

export interface Segment {
  index: number;
  startSec: number;
  endSec: number;
  lufs: number;
  /** Sample peak in dBFS — at 0 the take clipped and the level is understated. */
  peakDbfs: number;
  clipped: boolean;
  /** peak − LUFS. A ringing chord is ~5–15 dB; a click or a stray is 20+. */
  crestDb: number;
}

export interface SegmentOptions {
  expected: number;
  /** Seconds measured from each chord's peak. Fixed, so decay can't bias one. */
  measureSec?: number;
}

const FRAME_SEC = 0.02;
/** How far below the peak still counts as the note's attack. */
const ONSET_GATE_DB = 12;
/** …and how far back in time, which is what excludes a separate transient. */
const MAX_ATTACK_SEC = 0.2;
/**
 * How much of the note's start to leave out of the measurement.
 *
 * The pick attack is the loudest thing in a take and it is not the patch — it
 * is how hard you happened to hit the strings. Across a realistic range of
 * picking, including it moves the reading 1.7 dB; starting here instead holds
 * it to 0.03 dB. 150 ms clears the transient on a hard pick while still
 * leaving the body of a short note to measure.
 */
const ATTACK_SKIP_SEC = 0.15;
/**
 * How much of the note to measure, once the attack is out of the way.
 *
 * Songs are strummed: the chord is struck again long before it dies, so the
 * fade is loudness nobody hears. Measuring it punishes patches for a tail that
 * never sounds — modelled against passages where each stroke resets the
 * string, six patches from fast-decaying clean to compressed lead sit within
 * about 1 dB of each other, while a 3 s window spreads them over 7 dB. Nearly
 * all of that spread is fade.
 *
 * Shorter is better at every strumming rate tested, down to the 400 ms BS.1770
 * needs. 600 ms is where that stops being free: it holds three overlapping
 * blocks where 450 ms holds one, and one block leaves the relative gate with
 * nothing to do and the reading at the mercy of a single 400 ms slice. It is
 * also about a quarter note at 100 bpm, which is the rate this is meant to
 * stand in for.
 */
const MAIN_SEC = 0.6;
/**
 * How far the note must fall below its own body before it counts as over.
 *
 * Only a guard now that the window is a fixed length: it stops a staccato or
 * muted chord — one that really has finished inside MAIN_SEC — from having
 * silence averaged into it. Relative to the body rather than the peak, so it
 * doesn't move when your picking does.
 */
const DECAY_DB = 20;
/** …and for how long, so one dip in a wobbling envelope isn't the end. */
const DECAY_HOLD_SEC = 0.15;
const GATES_DB = Array.from({ length: 31 }, (_, i) => 15 + i); // 15..45 below peak
const PAUSES_SEC = [0.8, 0.6, 0.45, 0.3, 0.2];
const MIN_SEG_SEC = 1.0;

function mono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (const c of channels) s += c[i];
    out[i] = s / channels.length;
  }
  return out;
}

/** Short-term RMS in dB, one value per FRAME_SEC. */
function envelope(m: Float32Array, hop: number): Float32Array {
  const frames = Math.floor(m.length / hop);
  const env = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    let s = 0;
    for (let i = k * hop; i < (k + 1) * hop; i++) s += m[i] * m[i];
    env[k] = 10 * Math.log10(s / hop + 1e-12);
  }
  return env;
}

function findRegions(
  env: Float32Array,
  gate: number,
  minSilFrames: number,
  minSegFrames: number
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = -1;
  let quiet = 0;
  for (let k = 0; k < env.length; k++) {
    if (env[k] >= gate) {
      if (start === -1) start = k;
      quiet = 0;
    } else if (start !== -1) {
      quiet++;
      if (quiet >= minSilFrames) {
        const end = k - quiet;
        if (end - start >= minSegFrames) spans.push([start, end]);
        start = -1;
        quiet = 0;
      }
    }
  }
  if (start !== -1 && env.length - start >= minSegFrames) spans.push([start, env.length]);
  return spans;
}

/**
 * Sample peak in dBFS over a time range, without the loudness.
 *
 * Cheap on purpose: it exists so clipping can be judged over the note
 * *including* its attack while loudness is measured over the body alone, and
 * that check runs on every drag of a region handle.
 */
export function peakDbfsOver(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number
): number {
  const total = channels[0]?.length ?? 0;
  const s0 = Math.max(0, Math.min(total, Math.round(startSec * sampleRate)));
  const s1 = Math.max(s0, Math.min(total, Math.round(endSec * sampleRate)));
  let pk = 0;
  for (const c of channels)
    for (let k = s0; k < s1; k++) if (Math.abs(c[k]) > pk) pk = Math.abs(c[k]);
  return Number((20 * Math.log10(pk + 1e-12)).toFixed(2));
}

/** Integrated LUFS plus peak/crest over one time range. */
export function measureRegion(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number
): Omit<Segment, "index"> {
  const total = channels[0]?.length ?? 0;
  const s0 = Math.max(0, Math.min(total, Math.round(startSec * sampleRate)));
  const s1 = Math.max(s0, Math.min(total, Math.round(endSec * sampleRate)));
  const slice = channels.map((c) => c.subarray(s0, s1));

  const { lufs } = integratedLufs(slice, sampleRate);
  let pk = 0;
  for (const c of slice)
    for (let k = 0; k < c.length; k++) if (Math.abs(c[k]) > pk) pk = Math.abs(c[k]);

  const peakDbfs = Number((20 * Math.log10(pk + 1e-12)).toFixed(2));
  const L = Number.isFinite(lufs) ? Number(lufs.toFixed(2)) : -120;
  return {
    startSec: Number((s0 / sampleRate).toFixed(3)),
    endSec: Number((s1 / sampleRate).toFixed(3)),
    lufs: L,
    peakDbfs,
    clipped: peakDbfs >= -0.1,
    crestDb: Number((peakDbfs - L).toFixed(2)),
  };
}

/**
 * Where the chord is, in a take that holds exactly one.
 *
 * splitAndMeasureChannels is the wrong tool for this. Its gate sweep stops at
 * the first depth that yields the expected count, and with one chord that's the
 * very shallowest — so it only ever sees the top of the peak and then takes a
 * blind `measureSec` window from there, whether or not the note is still
 * sounding. That's fine for a multi-chord take, where the sweep is doing real
 * work separating neighbours, and useless for a single one.
 *
 * The window is the *main* of the note: it opens once the attack is over and
 * runs for MAIN_SEC, stopping early only if the note itself has.
 *
 * Both edges are there to keep the reading about the patch rather than about
 * the performance. Leaving the attack out drops your right hand: swing from
 * fingers to a hard pick and an attack-inclusive window moves 1.7 dB, while
 * this one stays inside 0.03 dB. Stopping before the fade drops the tail,
 * which in a strummed song is never heard — the chord is struck again first.
 */
export function proposeChordRegion(
  channels: Float32Array[],
  sampleRate: number,
  measureSec = 3.0
): { startSec: number; endSec: number } {
  const total = channels[0]?.length ?? 0;
  const durationSec = total / sampleRate;
  if (total === 0) return { startSec: 0, endSec: 0 };

  const hop = Math.max(1, Math.round(FRAME_SEC * sampleRate));
  const env = envelope(mono(channels), hop);
  if (env.length === 0) return { startSec: 0, endSec: durationSec };

  // Anchor on the loudest 400 ms of loudness rather than the loudest 20 ms of
  // envelope. A knock, a footswitch or a cable is over in 30 ms and cannot win
  // a 400 ms window; a chord holds level for hundreds of ms and wins on its
  // own. Taking the loudest single frame meant one click 6 dB above the note
  // moved the whole region onto it, for a 7 dB error that looked plausible.
  const trace = momentaryTrace(channels, sampleRate);
  let anchor = 0;
  if (trace.length > 0) {
    let best = -Infinity;
    for (let i = 0; i < trace.length; i++)
      if (trace[i] > best) {
        best = trace[i];
        anchor = Math.round((i * MOMENTARY_HOP_SEC + 0.2) / FRAME_SEC);
      }
  }
  anchor = Math.min(env.length - 1, Math.max(0, anchor));

  // The envelope peak near that anchor — the attack, when the note has one.
  const near = Math.round(0.25 / FRAME_SEC);
  let peakFrame = anchor;
  let peak = -Infinity;
  for (let k = Math.max(0, anchor - near); k <= Math.min(env.length - 1, anchor + near); k++)
    if (env[k] > peak) {
      peak = env[k];
      peakFrame = k;
    }

  // Attack: back from the peak while still within ONSET_GATE_DB of it, but
  // never further than MAX_ATTACK_SEC. Both limits are needed. On a quiet take
  // a pick scrape or a hand on the strings a third of a second earlier sits
  // well within any sensible gate and never dips below it, so a gate alone
  // walks straight through the gap and starts the region on the noise. A
  // strummed chord reaches full level in well under 200 ms, so the clock is
  // the honest bound.
  const limit = Math.max(0, peakFrame - Math.round(MAX_ATTACK_SEC / FRAME_SEC));
  let onset = peakFrame;
  while (onset > limit && env[onset - 1] > peak - ONSET_GATE_DB) onset--;

  const startFrame = Math.min(env.length - 1, onset + Math.round(ATTACK_SKIP_SEC / FRAME_SEC));

  // The body: the median of the first 200 ms measured, not the maximum, so a
  // transient that ran slightly long can't climb back in through the reference.
  const head: number[] = [];
  for (let k = startFrame; k < Math.min(env.length, startFrame + Math.round(0.2 / FRAME_SEC)); k++)
    head.push(env[k]);
  head.sort((a, b) => a - b);
  const body = head.length > 0 ? head[Math.floor(head.length / 2)] : peak;

  // Where the note actually stops, if it stops inside the window. The hold is
  // what makes this survive a wobbling envelope — two strings beating against
  // each other dip below any single threshold while the chord is plainly still
  // sounding, and quitting on the first dip cut the window short and read
  // 1.7 dB hot.
  const hold = Math.round(DECAY_HOLD_SEC / FRAME_SEC);
  let tail = startFrame;
  let below = 0;
  for (let k = startFrame + 1; k < env.length; k++) {
    if (env[k] > body - DECAY_DB) {
      tail = k;
      below = 0;
    } else if (++below >= hold) break;
  }

  const startSec = (startFrame * hop) / sampleRate;
  // BS.1770 needs one full 400 ms block, so never propose less than that.
  const endSec = Math.min(
    durationSec,
    Math.max(
      startSec + 0.45,
      Math.min(startSec + MAIN_SEC, startSec + measureSec, ((tail + 1) * hop) / sampleRate)
    )
  );
  return { startSec: Number(startSec.toFixed(3)), endSec: Number(endSec.toFixed(3)) };
}

export interface FloorCheck {
  /** Momentary loudness of the quiet stretch before the note, in LUFS. */
  beforeDb: number | null;
  /** …and after it has decayed. */
  afterDb: number | null;
  /** after − before. Positive means something turned the gain up. */
  riseDb: number | null;
  /**
   * Upward drift *within* a stretch that should be silent. Independent of
   * riseDb and often the earlier signal, since gain control starts winding up
   * during the leading silence before there's any note to compare against.
   */
  climbDb: number | null;
  /** Why no verdict was possible, when there isn't one. */
  reason: string | null;
}

/** A stretch within this of the note is the note still sounding, not a floor. */
const FLOOR_HEADROOM_DB = 12;
/** One second of momentary blocks — the window a floor has to hold steady over. */
const PLATEAU_BLOCKS = 10;
/** Halves of that window may differ by this much and still count as settled. */
const PLATEAU_TOLERANCE_DB = 2;

/**
 * Compare the noise floor either side of the note.
 *
 * This is the automatic gain control test. A passive input path has one noise
 * floor, and it is the same before you play and after the note dies. AGC
 * cannot help itself: given a long enough quiet stretch it winds the gain up
 * looking for signal, and the floor climbs. Nothing a guitar does causes that.
 *
 * The trap is that "after the region" is not the same as "after the note". A
 * region is capped at measureSec, so on a take where the note rings past that
 * — or where you simply kept playing — the stretch after it is still the
 * guitar. Comparing silence to a sustained chord reports a 30 dB "rise" that
 * is nothing but the note's own level. Hence noteLufs: anything within
 * FLOOR_HEADROOM_DB of the note is disqualified as a floor, and the answer is
 * "no verdict" rather than a confident wrong one.
 */
export function noiseFloorAround(
  channels: Float32Array[],
  sampleRate: number,
  startSec: number,
  endSec: number,
  noteLufs: number
): FloorCheck {
  return floorFromTrace(momentaryTrace(channels, sampleRate), startSec, endSec, noteLufs);
}

/**
 * Same check against a trace you already have.
 *
 * momentaryTrace K-weights the whole take, which is far too expensive to redo
 * while someone is dragging a region handle — the trace doesn't change when
 * the boundaries do, only which side of them each block falls on.
 */
export function floorFromTrace(
  trace: Float32Array,
  startSec: number,
  endSec: number,
  noteLufs: number
): FloorCheck {
  const before: number[] = [];
  const after: number[] = [];
  for (let i = 0; i < trace.length; i++) {
    const blockStart = i * MOMENTARY_HOP_SEC;
    const blockEnd = blockStart + 0.4;
    const v = Math.max(-120, trace[i]);
    if (blockEnd <= startSec) before.push(v);
    else if (blockStart >= endSec) after.push(v);
  }

  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  /**
   * The second of audio furthest from the note, and which way it's moving.
   *
   * A floor is flat, so `delta` is what decides whether we've found one. The
   * two directions mean opposite things and both are informative: falling is a
   * decay that hasn't finished — reverb and delay tails leave a patch still
   * descending seconds after the note, far above its true floor — while
   * *rising* during a stretch that should be silent is automatic gain control
   * winding up, which is the thing we're hunting. Rejecting both as "not
   * settled" would throw away the positive result along with the useless one.
   */
  const stretch = (xs: number[], fromEnd: boolean): { level: number; delta: number } | null => {
    if (xs.length < PLATEAU_BLOCKS) return null;
    const win = fromEnd ? xs.slice(-PLATEAU_BLOCKS) : xs.slice(0, PLATEAU_BLOCKS);
    const half = PLATEAU_BLOCKS / 2;
    const a = median(win.slice(0, half));
    const b = median(win.slice(half));
    return { level: Number(((a + b) / 2).toFixed(1)), delta: Number((b - a).toFixed(1)) };
  };

  // Furthest from the note in both directions: the start of the take before,
  // the end of it after.
  const b = stretch(before, false);
  const a = stretch(after, true);
  const ceiling = noteLufs - FLOOR_HEADROOM_DB;
  const quiet = (s: { level: number } | null) => s !== null && s.level <= ceiling;
  const flat = (s: { delta: number } | null) =>
    s !== null && Math.abs(s.delta) <= PLATEAU_TOLERANCE_DB;

  // Nothing passive gets louder while no one is playing.
  const climbs = [b, a]
    .filter((s) => quiet(s) && s !== null && s.delta > PLATEAU_TOLERANCE_DB)
    .map((s) => s!.delta);
  const climbDb = climbs.length > 0 ? Math.max(...climbs) : null;

  const beforeDb = quiet(b) && flat(b) ? b!.level : null;
  const afterDb = quiet(a) && flat(a) ? a!.level : null;

  let reason: string | null = null;
  if (climbDb === null) {
    if (before.length < PLATEAU_BLOCKS) reason = "no silence before — start recording earlier";
    else if (!quiet(b)) reason = "already sounding before the note";
    else if (!flat(b)) reason = "level still settling before the note";
    else if (after.length < PLATEAU_BLOCKS) reason = "no silence after — record for longer";
    else if (!quiet(a)) reason = "still sounding after the note";
    else if (!flat(a)) reason = "still decaying when recording stopped";
  }

  return {
    beforeDb,
    afterDb,
    riseDb:
      beforeDb !== null && afterDb !== null ? Number((afterDb - beforeDb).toFixed(1)) : null,
    climbDb,
    reason,
  };
}

/**
 * Find `expected` chords and measure each.
 *
 * Finding the boundaries is harder than it looks. One fixed threshold fails
 * because a preset's clean snapshot can sit 23 dB under its lead, while the
 * pause between two loud snapshots only falls ~26 dB — so any gate deep enough
 * to catch the clean chord is too deep to see those pauses. Rather than guess,
 * we sweep gate depth and pause length together and keep the first combination
 * that yields exactly the number of snapshots the song has. Knowing the
 * expected count up front is what makes that safe.
 *
 * Returns [] when no combination gives that count — the caller decides whether
 * that's a retake or a prompt to place the region by hand.
 */
export function splitAndMeasureChannels(
  channels: Float32Array[],
  sampleRate: number,
  opts: SegmentOptions
): Segment[] {
  const { expected, measureSec = 3.0 } = opts;
  if (channels.length === 0 || channels[0].length === 0) return [];

  const m = mono(channels);
  const hop = Math.max(1, Math.round(FRAME_SEC * sampleRate));
  const env = envelope(m, hop);

  let peak = -Infinity;
  for (const v of env) if (v > peak) peak = v;
  const minSegFrames = Math.round(MIN_SEG_SEC / FRAME_SEC);

  let regions: Array<[number, number]> | null = null;
  for (const pause of PAUSES_SEC) {
    const minSilFrames = Math.round(pause / FRAME_SEC);
    for (const gate of GATES_DB) {
      const r = findRegions(env, peak - gate, minSilFrames, minSegFrames);
      if (r.length === expected) {
        regions = r;
        break;
      }
    }
    if (regions) break;
  }
  if (!regions) return [];

  const found = regions;
  const winSamples = Math.round(measureSec * sampleRate);
  return found.map(([a, b], i) => {
    // Measure from the chord's loudest moment, not the region edge, so a slow
    // attack and a sharp one get the same window.
    let best = a;
    let bestv = -Infinity;
    for (let k = a; k < b; k++)
      if (env[k] > bestv) {
        bestv = env[k];
        best = k;
      }

    const s0 = Math.max(a * hop, best * hop - Math.round(0.2 * sampleRate));
    // Run to the next chord rather than the gate boundary — a chord decaying
    // below the gate is still the chord, and truncating there left the window so
    // short that the loudness gate rejected it outright.
    const nextStart = i + 1 < found.length ? found[i + 1][0] * hop : m.length;
    const s1 = Math.min(m.length, nextStart, s0 + winSamples);

    return { index: i, ...measureRegion(channels, sampleRate, s0 / sampleRate, s1 / sampleRate) };
  });
}
