#!/usr/bin/env bash
# Prep sandbox audio variants — R7 tone variants and R5 stem combinations.
# One-time offline prep. Outputs land in apps/data/sandbox/ (gitignored).
#
# Usage:
#   ./apps/scripts/prep-sandbox-variants.sh tone        # R7 only
#   ./apps/scripts/prep-sandbox-variants.sh stems       # R5 only (slow — runs Demucs)
#   ./apps/scripts/prep-sandbox-variants.sh all         # both
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO_ROOT/apps/shreddy/public/stubs/song-a.mp3"
OUT="$REPO_ROOT/apps/data/sandbox"
STUB="song-a"

mkdir -p "$OUT"
test -f "$SRC" || { echo "source not found at $SRC"; exit 1; }

prep_tone() {
  echo "=== R7 tone variants (4 EQ presets) ==="

  # clean — gentle high-pass + mid bump
  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" -af "highpass=f=80,equalizer=f=2500:width_type=q:width=1:g=2" \
    -b:a 192k -vn "$OUT/${STUB}_tone_clean.mp3"

  # dirty — soft-clip / harmonic distortion
  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" -af "acrusher=level_in=4:level_out=6:bits=12:mode=lin:aa=0.5,volume=0.7" \
    -b:a 192k -vn "$OUT/${STUB}_tone_dirty.mp3"

  # dry — low-pass + reduced reverb (band-pass to make it sound 'closer')
  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" -af "lowpass=f=4000,highpass=f=200" \
    -b:a 192k -vn "$OUT/${STUB}_tone_dry.mp3"

  # wet — high-shelf + echo for simulated reverb tail
  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" -af "highshelf=g=6:f=4000,aecho=0.8:0.7:60:0.3" \
    -b:a 192k -vn "$OUT/${STUB}_tone_wet.mp3"

  echo "  done: $(ls -1 "$OUT"/${STUB}_tone_*.mp3 | wc -l) files"
}

prep_stems() {
  echo "=== R5 stem prep (Demucs htdemucs, CPU -j 4) ==="
  local DEMUCS_BIN="$REPO_ROOT/apps/.venv-sf/bin/python"
  test -x "$DEMUCS_BIN" || { echo "venv not found: $DEMUCS_BIN"; exit 1; }
  local SEP="$OUT/separated"
  mkdir -p "$SEP"

  echo "  running Demucs (~30-90s on M-series)…"
  "$DEMUCS_BIN" -m demucs -n htdemucs --mp3 --mp3-bitrate 192 \
    -d cpu -j 4 --out "$SEP" "$SRC"

  local STEMDIR="$SEP/htdemucs/${STUB}"
  test -d "$STEMDIR" || { echo "Demucs output not found at $STEMDIR"; exit 1; }

  # All stems (= original; just copy)
  cp "$SRC" "$OUT/${STUB}_stems_all.mp3"

  # No vocals — sum drums + bass + other with attenuation to avoid clipping
  ffmpeg -y -hide_banner -loglevel error \
    -i "$STEMDIR/drums.mp3" \
    -i "$STEMDIR/bass.mp3" \
    -i "$STEMDIR/other.mp3" \
    -filter_complex "[0]volume=0.33[d];[1]volume=0.33[b];[2]volume=0.33[o];[d][b][o]amix=inputs=3:duration=longest" \
    -b:a 192k -vn "$OUT/${STUB}_stems_no_vocals.mp3"

  # Vocals only
  cp "$STEMDIR/vocals.mp3" "$OUT/${STUB}_stems_vocals_only.mp3"

  echo "  done: $(ls -1 "$OUT"/${STUB}_stems_*.mp3 | wc -l) combination files"
}

case "${1:-all}" in
  tone) prep_tone ;;
  stems) prep_stems ;;
  all) prep_tone; prep_stems ;;
  *) echo "usage: $0 {tone|stems|all}"; exit 1 ;;
esac

echo
echo "files in $OUT:"
ls -1 "$OUT" | sed 's|^|  |'
