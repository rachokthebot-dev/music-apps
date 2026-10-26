"""Solo tablature extraction for Shreddy.

CLI:
  python extract_tab.py <guitar_stem_wav> --start SEC --end SEC \
      --beats beats.json [--tuning 40,45,50,55,59,64] [--polyphonic]

Output (stdout, single JSON object):
  {"notes": [...], "bars": int, "stats": {...}}

Pipeline (measured on a 35s section, M4 mini):
  Basic Pitch note detection (CoreML/ANE)   ~4.7s
  voice streaming + lead selection          <0.01s
  DP string/fret assignment + margins       ~0.02s
  quantise against the song's beat grid     ~0.01s

The guitar stem carries lead AND rhythm guitar. Voice streaming separates them
by pitch continuity and keeps the lead; against a reference transcription this
moved notes sitting in the solo's register from 37% to 90%.

Confidence is TWO independent axes, deliberately:
  detectConf — how sure the note detector is this note exists at all.
  fretConf   — how sure the fretting search is about THIS string/fret, derived
               from the margin between the best and second-best complete paths
               through that note. Small margin = a genuinely ambiguous position
               the player should check.

They are not averaged into one number. A confidently-detected note can sit at an
ambiguous fret, and that is a different problem for the player than a note that
might not be there.
"""
import argparse
import json
import sys
import time

# basic_pitch pulls in coremltools, which is noisy on import
import warnings
warnings.filterwarnings("ignore")

OPEN_STANDARD = [40, 45, 50, 55, 59, 64]  # low E .. high e, MIDI
MAX_FRET = 22


# ---------------------------------------------------------------- detection

def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def detect_notes(wav_path, min_midi, min_note_ms=58):
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    t0 = time.time()
    _, _, events = predict(
        wav_path, ICASSP_2022_MODEL_PATH,
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=min_note_ms,
        minimum_frequency=midi_to_hz(min_midi),
        maximum_frequency=1400,
        multiple_pitch_bends=False,
        melodia_trick=True,
    )
    rows = [
        {"start": float(e[0]), "end": float(e[1]), "midi": int(e[2]), "amp": float(e[3])}
        for e in events
    ]
    rows.sort(key=lambda r: (r["start"], -r["midi"]))
    return rows, time.time() - t0


def score_detection(rows):
    """detectConf from amplitude percentile, penalised for very short notes.

    Measured on real material: amplitude separates plausible from implausible
    notes by ~20 points of in-scale rate on the RAW detection set. That signal
    is destroyed if you filter first, so this runs before any filtering and
    nothing is silently dropped.
    """
    if not rows:
        return
    amps = sorted(r["amp"] for r in rows)
    span = max(1e-9, amps[-1] - amps[0])
    for r in rows:
        pr = (r["amp"] - amps[0]) / span
        short = max(0.0, 1.0 - (r["end"] - r["start"]) / 0.12)
        r["detectConf"] = round(max(0.20, min(0.99, 0.40 + 0.58 * pr - 0.18 * short)), 3)


def stream_voices(rows, max_leap=9, max_gap=1.0):
    """Group detections into monophonic streams by pitch/time continuity.

    The guitar stem from htdemucs_6s contains lead AND rhythm guitar. Measured
    on real material, simultaneous detections sit a median of 16 semitones
    apart and 64% of overlapping pairs are an octave or more apart — that is
    two independent parts, not one chord.

    Taking the highest note at each instant (the obvious approach) flips
    between the two parts whenever their registers cross, which is what put
    59% of a top-string solo onto the bottom three strings. Following pitch
    continuity instead keeps each part intact so we can choose one.
    """
    streams = []
    for n in sorted(rows, key=lambda r: r["start"]):
        best, best_cost = None, None
        for s in streams:
            last = s[-1]
            gap = n["start"] - last["end"]
            if gap > max_gap:
                continue
            leap = abs(n["midi"] - last["midi"])
            if leap > max_leap:
                continue
            cost = leap + 3.0 * max(0.0, gap)
            if best_cost is None or cost < best_cost:
                best, best_cost = s, cost
        if best is None:
            streams.append([n])
        else:
            best.append(n)
    return streams


def merge_fragments(streams, max_gap=2.5, max_mean_diff=7):
    """Join stream fragments that are the same part interrupted by a rest.

    stream_voices deliberately uses tight leap/gap limits so it never welds the
    lead onto the rhythm part. The cost is fragmentation: a bend-heavy solo
    line breaks into many short streams. Merging afterwards — on REGISTER
    agreement rather than just endpoint proximity — puts the line back together
    without re-introducing the cross-part welding.
    """
    if not streams:
        return []
    frags = sorted((s for s in streams if s), key=lambda s: s[0]["start"])
    merged = [frags[0]]
    for f in frags[1:]:
        placed = False
        f_mean = sum(n["midi"] for n in f) / len(f)
        # prefer the most recently active compatible fragment
        for m in sorted(merged, key=lambda m: -m[-1]["end"]):
            if f[0]["start"] - m[-1]["end"] > max_gap:
                continue
            m_mean = sum(n["midi"] for n in m) / len(m)
            if abs(f_mean - m_mean) > max_mean_diff:
                continue
            m.extend(f)
            m.sort(key=lambda n: n["start"])
            placed = True
            break
        if not placed:
            merged.append(f)
    return merged


def fix_octave_errors(notes, window=9, jump=12, max_dur=0.25):
    """Pull down short notes sitting an implausible octave above their context.

    Basic Pitch occasionally locks onto the first harmonic instead of the
    fundamental. Those detections are short and sit ~12 semitones above their
    neighbours; real high notes in a solo are approached by step or held. Only
    notes matching BOTH conditions are transposed, so genuine high phrases are
    left alone.
    """
    if len(notes) < 3:
        return notes, 0
    fixed = 0
    ordered = sorted(notes, key=lambda n: n["start"])
    pitches = [n["midi"] for n in ordered]
    for i, n in enumerate(ordered):
        lo = max(0, i - window // 2)
        ctx = sorted(pitches[lo:lo + window])
        if len(ctx) < 3:
            continue
        med = ctx[len(ctx) // 2]
        dur = n["end"] - n["start"]
        if n["midi"] - med >= jump and dur <= max_dur:
            n["midi"] -= 12
            pitches[i] = n["midi"]
            fixed += 1
    return ordered, fixed


def select_lead_soft(streams, keep_margin=3.0, blend=0.6):
    """Score every NOTE for lead-likelihood instead of accepting whole streams.

    The earlier hard 2-means assigned each fragment wholly to lead or rhythm,
    so a fragment straddling both registers was discarded entirely — measured
    at a 66% discard rate, and the discarded notes were largely real lead notes.

    Here the stream only contributes context: a note's effective pitch blends
    its own value with its stream's mean, and anything within keep_margin
    semitones of the lead/rhythm boundary is kept. Borderline notes survive.
    """
    usable = [s for s in streams if len(s) >= 2]
    if len(usable) < 2:
        return [n for s in streams for n in s], None

    means = [sum(n["midi"] for n in s) / len(s) for s in usable]
    if max(means) - min(means) < 4:
        return [n for s in streams for n in s], None

    c_lo, c_hi = min(means), max(means)
    for _ in range(25):
        groups = ([], [])
        for s, m in zip(usable, means):
            groups[abs(m - c_hi) < abs(m - c_lo)].append((s, m))
        if not groups[0] or not groups[1]:
            break
        def centroid(g):
            w = sum(len(s) for s, _ in g)
            return sum(m * len(s) for s, m in g) / w
        c_lo, c_hi = centroid(groups[0]), centroid(groups[1])

    cut = (c_lo + c_hi) / 2
    lead = []
    for s in streams:
        s_mean = sum(n["midi"] for n in s) / len(s)
        for n in s:
            eff = blend * n["midi"] + (1 - blend) * s_mean
            if eff >= cut - keep_margin:
                lead.append(n)
    return sorted(lead, key=lambda n: n["start"]), cut


def select_lead(streams, min_notes=3):
    """Split streams into lead vs accompaniment on mean pitch, keep the lead.

    A 2-means split on stream mean pitch, weighted by note count. The two
    parts are far enough apart in register that this separates cleanly; using
    the streams' means rather than individual notes is what makes it robust to
    the moments where the parts cross.
    """
    usable = [s for s in streams if len(s) >= min_notes]
    if len(usable) < 2:
        return [n for s in streams for n in s]

    means = [sum(n["midi"] for n in s) / len(s) for s in usable]
    lo, hi = min(means), max(means)
    if hi - lo < 4:                      # one register: it's all one part
        return [n for s in streams for n in s]

    # Lloyd's algorithm, two centroids, weighted by stream length
    c_lo, c_hi = lo, hi
    for _ in range(25):
        groups = ([], [])
        for s, m in zip(usable, means):
            groups[abs(m - c_hi) < abs(m - c_lo)].append((s, m))
        if not groups[0] or not groups[1]:
            break
        def centroid(g):
            w = sum(len(s) for s, _ in g)
            return sum(m * len(s) for s, m in g) / w
        c_lo, c_hi = centroid(groups[0]), centroid(groups[1])

    lead = [n for s, _ in groups[1] for n in s]
    # short streams weren't clustered; fold in the ones sitting in lead register
    cut = (c_lo + c_hi) / 2
    for s in streams:
        if len(s) >= min_notes:
            continue
        if sum(n["midi"] for n in s) / len(s) >= cut:
            lead.extend(s)
    return sorted(lead, key=lambda n: n["start"])


def collapse_overlaps(rows):
    """Within one part, drop residual simultaneities (keep the higher note)."""
    out = []
    for r in sorted(rows, key=lambda x: (x["start"], -x["midi"])):
        if out and r["start"] < out[-1]["end"] - 0.02:
            if r["midi"] > out[-1]["midi"]:
                out[-1] = r
            continue
        out.append(r)
    return out


# ---------------------------------------------------------------- fretting

def positions(midi, tuning):
    return [(i, midi - op) for i, op in enumerate(tuning) if 0 <= midi - op <= MAX_FRET]


def transition_cost(prev_pos, pos):
    psi, pf = prev_pos
    si, f = pos
    jump = abs(f - pf)
    cost = 0.22 * jump + 0.15 * abs(si - psi)
    if jump > 4:
        cost += 0.5 * (jump - 4)   # big shifts are what make a tab unplayable
    return cost


STRING_PREF = 0.10   # per string away from the top; 0 disables


def position_cost(pos, string_pref=STRING_PREF):
    si, f = pos
    # Lead playing lives mid-neck on the thinner strings. Without the string
    # term the search happily puts a solo line on the low E at fret 12 when
    # string 5 fret 7 is the same pitch and the far more likely fingering.
    return (0.04 * abs(f - 9)
            + (0.5 if f == 0 else 0.0)
            + string_pref * (5 - si))


def assign_frets(notes, tuning, string_pref=STRING_PREF):
    """Viterbi over string/fret choices, plus per-note marginal confidence.

    Forward and backward tables let us ask, for every candidate position, what
    the best COMPLETE path through it would cost. The gap between the best and
    second-best such path is the real ambiguity of that note — a local
    comparison would miss that a cheap position now forces an expensive shift
    two notes later.
    """
    n = len(notes)
    if n == 0:
        return []

    cands = [positions(x["midi"], tuning) or [(5, MAX_FRET)] for x in notes]

    INF = float("inf")
    fwd = [dict() for _ in range(n)]
    for i, cs in enumerate(cands):
        for p in cs:
            if i == 0:
                fwd[i][p] = position_cost(p, string_pref)
            else:
                fwd[i][p] = position_cost(p, string_pref) + min(
                    fwd[i - 1][q] + transition_cost(q, p) for q in cands[i - 1]
                )

    bwd = [dict() for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for p in cands[i]:
            if i == n - 1:
                bwd[i][p] = 0.0
            else:
                bwd[i][p] = min(
                    transition_cost(p, q) + position_cost(q, string_pref) + bwd[i + 1][q]
                    for q in cands[i + 1]
                )

    out = []
    for i, x in enumerate(notes):
        totals = sorted(((fwd[i][p] + bwd[i][p], p) for p in cands[i]), key=lambda t: t[0])
        best_cost, best = totals[0]
        if len(totals) > 1:
            margin = totals[1][0] - best_cost
            # 0.6 of accumulated path cost is a comfortably decisive margin
            fret_conf = max(0.25, min(0.99, 0.45 + 0.9 * min(margin, 0.6) / 0.6))
        else:
            margin = None
            fret_conf = 0.99   # only one way to play it
        alts = [
            {"string": 6 - p[0], "fret": p[1], "extra": round(c - best_cost, 3)}
            for c, p in totals[1:4]
        ]
        out.append({
            **x,
            "string": 6 - best[0],          # 1 = high e, 6 = low E (display order)
            "fret": best[1],
            "fretConf": round(fret_conf, 3),
            "margin": None if margin is None else round(margin, 3),
            "alts": alts,
        })
    return out


# ---------------------------------------------------------------- quantise

def quantise(notes, beats, offset):
    """Snap onsets to 16ths of the song's own beat grid.

    Using the stored grid rather than a fixed BPM means the tab stays aligned
    through tempo drift, which a live rock recording always has.
    """
    if len(beats) < 2:
        return 0
    errs = []
    for x in notes:
        t = offset + x["start"]
        placed = False
        for i in range(len(beats) - 1):
            if beats[i] <= t < beats[i + 1]:
                step = (beats[i + 1] - beats[i]) / 4.0
                sub = round((t - beats[i]) / step)
                bi = i + (1 if sub == 4 else 0)
                sub = 0 if sub == 4 else sub
                x["bar"] = bi // 4 + 1
                x["beat"] = (bi % 4) * 4 + sub
                errs.append(abs(t - (beats[i] + step * sub)) * 1000)
                placed = True
                break
        if not placed:
            x["bar"], x["beat"] = None, None
        # duration in 16th slots, clamped to something renderable
        step = (beats[1] - beats[0]) / 4.0
        x["dur"] = max(1, min(16, round((x["end"] - x["start"]) / max(step, 1e-6))))
    return errs


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Extract solo tablature from a guitar stem")
    ap.add_argument("wav")
    ap.add_argument("--start", type=float, required=True, help="section start in the full song, sec")
    ap.add_argument("--end", type=float, required=True)
    ap.add_argument("--beats", default="", help="JSON file or inline JSON array of beat times")
    ap.add_argument("--tuning", default="", help="comma-separated MIDI of open strings, low->high")
    ap.add_argument("--polyphonic", action="store_true", help="skip melody collapse")
    # Measured sweep on a real solo: raising this floor REDUCES in-scale rate
    # (72% at 40 -> 69% at 52 -> 57% at 55) while barely changing low-string
    # usage. There is almost no content between MIDI 40-47, so the low-register
    # notes are real playing, not bass bleed. Default stays at the guitar's
    # open low E; raise it only for genuinely high-register solos.
    ap.add_argument("--min-midi", type=int, default=40, help="lowest MIDI note to detect (40 = low E)")
    # Swept against a reference transcription: 20ms recovers the fast legato runs
    # (2.3 notes/bar vs 1.7 at 58ms) without raising fretting ambiguity.
    ap.add_argument("--min-note-ms", type=int, default=20, help="shortest detectable note")
    ap.add_argument("--string-pref", type=float, default=STRING_PREF,
                    help="bias toward thinner strings for lead (0 disables)")
    ap.add_argument("--keep-margin", type=float, default=3.0,
                    help="semitones below the lead/rhythm boundary still kept")
    ap.add_argument("--no-voice-split", action="store_true",
                    help="skip lead/rhythm separation (debug)")
    args = ap.parse_args()

    try:
        tuning = [int(v) for v in args.tuning.split(",")] if args.tuning else OPEN_STANDARD

        beats = []
        if args.beats:
            raw = args.beats
            if not raw.lstrip().startswith("["):
                raw = open(raw).read()
            beats = [b for b in json.loads(raw) if args.start - 1 <= b <= args.end + 1]

        raw_notes, detect_s = detect_notes(args.wav, args.min_midi, args.min_note_ms)
        n_raw = len(raw_notes)
        score_detection(raw_notes)

        if args.polyphonic:
            notes, n_streams, n_merged, n_oct, n_lead = raw_notes, 0, 0, 0, len(raw_notes)
        else:
            if args.no_voice_split:
                lead, n_streams, n_merged, n_oct = raw_notes, 0, 0, 0
            else:
                streams = stream_voices(raw_notes)
                n_streams = len(streams)
                streams = merge_fragments(streams)
                n_merged = len(streams)
                lead, _cut = select_lead_soft(streams, keep_margin=args.keep_margin)
                lead, n_oct = fix_octave_errors(lead)
            n_lead = len(lead)
            notes = collapse_overlaps(lead)
        n_mono = len(notes)

        t0 = time.time()
        notes = assign_frets(notes, tuning, args.string_pref)
        fret_s = time.time() - t0

        errs = quantise(notes, beats, args.start)
        notes = [x for x in notes if x.get("bar")]

        out = []
        for i, x in enumerate(notes):
            out.append({
                "id": f"n{i}",
                "bar": x["bar"], "beat": x["beat"], "dur": x["dur"],
                "string": x["string"], "fret": x["fret"], "midi": x["midi"],
                "startSec": round(args.start + x["start"], 3),
                "endSec": round(args.start + x["end"], 3),
                "detectConf": x["detectConf"], "fretConf": x["fretConf"],
                "margin": x["margin"], "alts": x["alts"],
            })

        errs_sorted = sorted(errs)
        stats = {
            "rawDetections": n_raw,
            "afterMelodyCollapse": n_mono,
            "rendered": len(out),
            "detectSec": round(detect_s, 2),
            "fretSec": round(fret_s, 3),
            "quantMedianMs": round(errs_sorted[len(errs_sorted) // 2], 1) if errs else None,
            "ambiguousFrets": sum(1 for x in out if x["fretConf"] < 0.7),
            "lowDetect": sum(1 for x in out if x["detectConf"] < 0.5),
            "minMidi": args.min_midi,
            "minNoteMs": args.min_note_ms,
            "streams": n_streams,
            "mergedStreams": n_merged,
            "octaveFixed": n_oct,
            "leadNotes": n_lead,
        }
        print(json.dumps({
            "notes": out,
            "bars": max((x["bar"] for x in out), default=0),
            "stats": stats,
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
