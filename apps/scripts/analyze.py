"""Audio analyzer for Shreddy — librosa for BPM/key/beats + SongFormer for sections.

CLI:
  python analyze.py <audio_path> [--song-info "..."] [--no-sections]

Output (stdout, single JSON line):
  {"bpm": float, "key": str, "sections": [{name, startSec, endSec}, ...], "beats": [...]}

The --song-info argument is accepted for backwards compatibility (the old Gemini
path used it for context); SongFormer ignores it because it's audio-only.

Section detection is local and free — runs SongFormer (3 GB model bundled at
apps/data/models/songformer/) on CPU. ~30-60 seconds per song on M-series Macs.
"""
import argparse
import json
import sys

import numpy as np
import librosa


# ---------- BPM, key, beats (unchanged from previous implementation) --------

def detect_key(y, sr) -> str:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    best = (-1, "C Major")
    for i in range(12):
        rotated = np.roll(chroma_mean, -i)
        maj = np.corrcoef(rotated, major_profile)[0, 1]
        mn  = np.corrcoef(rotated, minor_profile)[0, 1]
        if maj > best[0]:
            best = (maj, f"{note_names[i]} Major")
        if mn > best[0]:
            best = (mn, f"{note_names[i]} Minor")
    return best[1]


# ---------- main -----------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Analyze audio (BPM/key/beats local + SongFormer sections)")
    parser.add_argument("audio_path")
    parser.add_argument("--song-info", default="", help="(accepted for back-compat; ignored)")
    parser.add_argument("--no-sections", action="store_true")
    args = parser.parse_args()

    try:
        # librosa for BPM, key, beats — fast, local, deterministic
        y, sr = librosa.load(args.audio_path, sr=22050, mono=True)

        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(tempo) if np.isscalar(tempo) else float(tempo[0]), 1)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=512)
        beats = [round(float(t), 3) for t in beat_times]

        key = detect_key(y, sr)

        # Sections via SongFormer (or skip)
        if args.no_sections:
            sections: list = []
        else:
            import os as _os
            # Combine adjacent same-label segments + absorb edge silence by default.
            # Disable with COMBINE_SUBSECTIONS=0/false/no.
            _combine_env = _os.environ.get("COMBINE_SUBSECTIONS", "1").strip().lower()
            combine = _combine_env not in {"0", "false", "no", ""}
            from songformer_inference import infer
            sections = infer(args.audio_path, combine=combine)

        print(json.dumps({"bpm": bpm, "key": key, "sections": sections, "beats": beats}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
