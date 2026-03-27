"""
Auto-segment an audio file into sections using librosa + Claude Vision.

1. Extract audio features and generate chromagram + energy visualizations
2. Also find candidate boundaries via novelty detection
3. Send the image + candidates to Claude Sonnet for analysis
4. Return JSON array of sections

Usage: python analyze.py <audio_file_path>
Env: ANTHROPIC_API_KEY must be set

Falls back to local-only analysis if Claude API is unavailable.
"""

import base64
import io
import json
import os
import sys
import tempfile

import anthropic
import librosa
import librosa.display
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import find_peaks


def detect_key(y, sr) -> str:
    """Detect musical key using chroma features and Krumhansl-Schmuckler algorithm."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)

    # Krumhansl-Schmuckler key profiles
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    best_corr = -1
    best_key = "C"
    for i in range(12):
        rotated = np.roll(chroma_mean, -i)
        maj_corr = np.corrcoef(rotated, major_profile)[0, 1]
        min_corr = np.corrcoef(rotated, minor_profile)[0, 1]
        if maj_corr > best_corr:
            best_corr = maj_corr
            best_key = f"{note_names[i]} Major"
        if min_corr > best_corr:
            best_corr = min_corr
            best_key = f"{note_names[i]} Minor"

    return best_key


def generate_analysis_image(audio_path: str) -> tuple[bytes, dict]:
    """Generate a multi-panel analysis image and extract metadata."""
    y, sr = librosa.load(audio_path, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)
    hop_length = 512

    # Compute features
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop_length)
    times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr, hop_length=hop_length)

    # Find candidate boundaries using novelty
    chroma_norm = librosa.util.normalize(chroma, axis=1)
    mfcc_norm = librosa.util.normalize(mfcc, axis=1)
    features = np.vstack([chroma_norm, mfcc_norm])

    sim = librosa.segment.recurrence_matrix(features, width=3, mode="affinity", sym=True)

    kernel_size = min(64, sim.shape[0] // 4)
    if kernel_size < 4:
        kernel_size = 4
    kernel_size = kernel_size - (kernel_size % 2)

    # Checkerboard kernel novelty
    kern = np.ones((kernel_size, kernel_size))
    half = kernel_size // 2
    kern[:half, half:] = -1
    kern[half:, :half] = -1

    n = sim.shape[0]
    novelty = np.zeros(n)
    for i in range(half, n - half):
        patch = sim[i - half:i + half, i - half:i + half]
        if patch.shape == kern.shape:
            novelty[i] = np.sum(patch * kern)

    novelty = np.maximum(0, novelty)
    if len(novelty) > 8:
        novelty = median_filter(novelty, size=7)
    if novelty.max() > 0:
        novelty = novelty / novelty.max()

    novelty_times = librosa.frames_to_time(np.arange(len(novelty)), sr=sr, hop_length=hop_length)

    # Find candidate boundary peaks
    min_dist = int(8.0 * sr / hop_length)
    peaks, props = find_peaks(novelty, height=0.08, distance=max(1, min_dist), prominence=0.02)
    candidate_times = []
    for p in peaks:
        if p < len(novelty_times):
            t = float(novelty_times[p])
            if 3.0 < t < duration - 3.0:
                candidate_times.append(round(t, 1))

    # Generate visualization
    fig, axes = plt.subplots(4, 1, figsize=(16, 10), sharex=True)
    fig.suptitle("Audio Analysis", fontsize=14, fontweight="bold")

    # 1. Chromagram
    librosa.display.specshow(chroma, x_axis="time", y_axis="chroma",
                             sr=sr, hop_length=hop_length, ax=axes[0])
    axes[0].set_title("Chromagram (pitch content over time)")
    axes[0].set_ylabel("Pitch Class")

    # 2. Energy (RMS)
    axes[1].plot(times[:len(rms)], rms, color="blue", linewidth=0.8)
    axes[1].fill_between(times[:len(rms)], rms, alpha=0.3)
    axes[1].set_title("Energy (RMS)")
    axes[1].set_ylabel("Amplitude")

    # 3. Spectral Contrast (first 3 bands)
    for i in range(3):
        axes[2].plot(times[:spectral_contrast.shape[1]],
                     spectral_contrast[i], linewidth=0.8, label=f"Band {i+1}")
    axes[2].set_title("Spectral Contrast (timbral changes)")
    axes[2].set_ylabel("Contrast")
    axes[2].legend(loc="upper right", fontsize=8)

    # 4. Novelty curve with candidate boundaries
    axes[3].plot(novelty_times, novelty, color="red", linewidth=1)
    axes[3].fill_between(novelty_times, novelty, alpha=0.2, color="red")
    for ct in candidate_times:
        axes[3].axvline(x=ct, color="green", linestyle="--", alpha=0.7, linewidth=1.5)
    axes[3].set_title("Structural Novelty (red) + Candidate Boundaries (green dashed)")
    axes[3].set_ylabel("Novelty")
    axes[3].set_xlabel("Time (seconds)")

    # Add time grid to all panels
    for ax in axes:
        ax.grid(axis="x", alpha=0.3)

    plt.tight_layout()

    # Save to bytes
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    image_bytes = buf.read()

    metadata = {
        "duration_sec": round(duration, 1),
        "estimated_bpm": round(float(tempo) if np.isscalar(tempo) else float(tempo[0]), 1),
        "beat_count": len(beat_times),
        "candidate_boundaries": candidate_times,
    }

    return image_bytes, metadata


DEFAULT_PROMPT = """You are an expert music analyst. I've extracted audio features from a song and generated these visualizations:

1. **Chromagram**: Shows pitch content over time. Similar color patterns = similar harmonic content (likely same section). Look for repeating blocks of color.
2. **Energy (RMS)**: Shows loudness. Drops often indicate transitions (e.g., verse→bridge). Peaks often indicate choruses.
3. **Spectral Contrast**: Shows timbral changes. Shifts indicate different instrumentation or arrangement.
4. **Novelty Curve**: Computed structural novelty. Peaks = likely section boundaries. Green dashed lines are algorithmically detected candidates.

Song details:
{song_info}

Audio metadata:
- Duration: {duration_sec} seconds
- Estimated BPM: {estimated_bpm}
- Total beats: {beat_count}
- Algorithm-detected candidate boundaries: {candidates}

Please analyze the image carefully:

**Step 1**: Describe what you observe in each panel. Where do you see repeating patterns in the chromagram? Where are the energy changes? What do the spectral contrast shifts tell you?

**Step 2**: Based on your observations, identify the musical sections. Use the candidate boundaries as hints but trust your visual analysis — you may merge, split, or ignore candidates.

**Step 3**: Output your final answer as ONLY a JSON array (no other text after it). Each section must have:
- "name": a musically meaningful label (Intro, Verse 1, Pre-Chorus, Chorus 1, Post-Chorus, Bridge, Solo, Verse 2, Chorus 2, Outro, etc.)
- "startSec": start time in seconds (number)
- "endSec": end time in seconds (number)

Rules:
- Sections must cover the entire song from 0 to {duration_sec}
- No gaps or overlaps
- Minimum section length is 5 seconds
- If you see repeating patterns, number them (Verse 1, Verse 2, Chorus 1, Chorus 2)
- Align boundaries to musically sensible points (beat boundaries, energy transitions)

Begin your analysis:"""


def load_custom_prompt() -> str | None:
    """Load custom prompt from settings.json if it exists."""
    settings_path = os.path.join(os.path.dirname(__file__), "..", "data", "settings.json")
    try:
        with open(settings_path) as f:
            settings = json.load(f)
            prompt = settings.get("analysisPrompt", "").strip()
            return prompt if prompt else None
    except Exception:
        return None


def analyze_with_claude(image_bytes: bytes, metadata: dict, song_info: str = "") -> list[dict]:
    """Send analysis image to Claude Sonnet for section identification."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)

    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    candidates_str = ", ".join(f"{t}s" for t in metadata["candidate_boundaries"])

    # Use custom prompt if available, otherwise default
    custom_prompt = load_custom_prompt()
    prompt_template = custom_prompt if custom_prompt else DEFAULT_PROMPT

    prompt_text = prompt_template.format(
        duration_sec=metadata["duration_sec"],
        estimated_bpm=metadata["estimated_bpm"],
        beat_count=metadata["beat_count"],
        candidates=candidates_str,
        song_info=song_info if song_info else "Unknown",
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt_text,
                    },
                ],
            }
        ],
    )

    # Parse response - extract JSON from the end
    text = response.content[0].text.strip()

    # Find the JSON array in the response
    # Look for the last [ ... ] block
    bracket_start = text.rfind("[")
    bracket_end = text.rfind("]")
    if bracket_start == -1 or bracket_end == -1:
        raise ValueError("No JSON array found in Claude response")

    json_str = text[bracket_start:bracket_end + 1]
    sections = json.loads(json_str)

    if not isinstance(sections, list) or len(sections) == 0:
        raise ValueError("Invalid response from Claude")

    validated = []
    for s in sections:
        if "name" in s and "startSec" in s and "endSec" in s:
            validated.append({
                "name": str(s["name"]),
                "startSec": round(float(s["startSec"]), 1),
                "endSec": round(float(s["endSec"]), 1),
            })

    if not validated:
        raise ValueError("No valid sections in Claude response")

    return validated


def analyze_local_fallback(audio_path: str) -> list[dict]:
    """Simple local analysis as fallback."""
    y, sr = librosa.load(audio_path, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)
    hop_length = 512

    if duration < 30:
        return [{"name": "Full Track", "startSec": 0.0, "endSec": round(duration, 1)}]

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
    chroma = librosa.util.normalize(chroma, axis=1)
    mfcc = librosa.util.normalize(mfcc, axis=1)
    features = np.vstack([chroma, mfcc])

    sim = librosa.segment.recurrence_matrix(features, width=3, mode="affinity", sym=True)

    kernel_size = min(64, sim.shape[0] // 4)
    if kernel_size < 4:
        kernel_size = 4
    kernel_size = kernel_size - (kernel_size % 2)

    kern = np.ones((kernel_size, kernel_size))
    half = kernel_size // 2
    kern[:half, half:] = -1
    kern[half:, :half] = -1

    n = sim.shape[0]
    novelty = np.zeros(n)
    for i in range(half, n - half):
        patch = sim[i - half:i + half, i - half:i + half]
        if patch.shape == kern.shape:
            novelty[i] = np.sum(patch * kern)

    novelty = np.maximum(0, novelty)
    if len(novelty) > 8:
        novelty = median_filter(novelty, size=7)
    if novelty.max() > 0:
        novelty = novelty / novelty.max()

    times = librosa.frames_to_time(np.arange(len(novelty)), sr=sr, hop_length=hop_length)
    min_distance_frames = int(10.0 * sr / hop_length)
    peaks, _ = find_peaks(novelty, height=0.1, distance=max(1, min_distance_frames), prominence=0.03)

    boundary_times = [0.0]
    for p in peaks:
        if p < len(times):
            t = float(times[p])
            if 5.0 < t < duration - 5.0:
                boundary_times.append(round(t, 1))
    boundary_times.append(round(duration, 1))
    boundary_times = sorted(set(boundary_times))

    labels = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Verse 2", "Chorus 2", "Bridge", "Chorus 3", "Outro"]
    sections = []
    for i in range(len(boundary_times) - 1):
        label = labels[i] if i < len(labels) else f"Section {i + 1}"
        sections.append({"name": label, "startSec": boundary_times[i], "endSec": boundary_times[i + 1]})
    return sections


def analyze_sections(audio_path: str, song_info: str = "") -> list[dict]:
    """Main entry: try Claude Vision, fall back to local analysis."""
    y, sr = librosa.load(audio_path, sr=22050)
    duration = librosa.get_duration(y=y, sr=sr)

    if duration < 30:
        return [{"name": "Full Track", "startSec": 0.0, "endSec": round(duration, 1)}]

    try:
        image_bytes, metadata = generate_analysis_image(audio_path)
        sections = analyze_with_claude(image_bytes, metadata, song_info)
        return sections
    except Exception as e:
        print(f"Claude analysis failed ({e}), falling back to local analysis", file=sys.stderr)
        return analyze_local_fallback(audio_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Analyze audio sections")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--song-info", default="", help="Song metadata (title, artist, etc.)")
    parser.add_argument("--no-sections", action="store_true", help="Skip section analysis (only detect BPM, key, beats)")
    args = parser.parse_args()

    try:
        # Always extract BPM, key, and beats (local, free)
        y, sr = librosa.load(args.audio_path, sr=22050)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(tempo) if np.isscalar(tempo) else float(tempo[0]), 1)
        beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=512)
        beat_list = [round(float(t), 3) for t in beat_times]
        key = detect_key(y, sr)

        # Optionally analyze sections (uses Claude API)
        if args.no_sections:
            sections = []
        else:
            sections = analyze_sections(args.audio_path, args.song_info)

        print(json.dumps({"bpm": bpm, "key": key, "sections": sections, "beats": beat_list}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
