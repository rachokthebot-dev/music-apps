"""SongFormer inference helper for Shreddy.

Loads the patched SongFormer model bundled at apps/data/models/songformer/
and exposes a single `infer(audio_path) -> list[dict]` entry point.

Includes post-processing (merge adjacent same-label, absorb edge silence,
pretty-name with repeat numbering, optionally rename 'inst' → 'Solo').
"""
import importlib.util
import os
import sys
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[1] / "data" / "models" / "songformer"

# SongFormer's modeling files use top-level local imports (`from model import Model`,
# `from dataset.label2id import ...`). Adding MODEL_DIR to sys.path makes those resolve.
sys.path.insert(0, str(MODEL_DIR))
os.environ["SONGFORMER_LOCAL_DIR"] = str(MODEL_DIR)

# transformers' check_imports does a static AST scan and treats any top-level
# `from X import Y` as a pip-package dependency. Our local files (model, dataset…)
# look like missing packages. We silence that by making find_spec return None
# (treats them as optional) — they'll be resolved through sys.path at real import time.
_orig_find_spec = importlib.util.find_spec
def _lenient_find_spec(name, *a, **kw):
    try:
        return _orig_find_spec(name, *a, **kw)
    except Exception:
        return None
importlib.util.find_spec = _lenient_find_spec


_model_singleton = None


def _pick_device():
    """Prefer MPS (Apple Silicon GPU); fall back to CPU. Override with
    SONGFORMER_DEVICE=cpu if MPS ever misbehaves on a future PyTorch release."""
    import os, torch
    forced = os.environ.get("SONGFORMER_DEVICE", "").strip().lower()
    if forced in {"cpu", "mps", "cuda"}:
        return forced
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _load_model():
    """Construct + load weights once. Subsequent calls reuse the instance."""
    global _model_singleton
    if _model_singleton is not None:
        return _model_singleton

    import torch
    from safetensors.torch import load_file
    from configuration_songformer import SongFormerConfig  # local
    from modeling_songformer import SongFormerModel  # local

    config = SongFormerConfig.from_pretrained(str(MODEL_DIR))
    model = SongFormerModel(config)
    state_dict = load_file(str(MODEL_DIR / "model.safetensors"))
    model.load_state_dict(state_dict, strict=False)
    device = _pick_device()
    try:
        model.to(device).eval()
    except Exception:
        # MPS can fail on some unusual ops; CPU is the safety net.
        model.to("cpu").eval()
    _model_singleton = model
    return model


# Post-processing -----------------------------------------------------------

PRETTY = {
    "silence":    "Silence",
    "intro":      "Intro",
    "verse":      "Verse",
    "chorus":     "Chorus",
    "pre-chorus": "Pre-Chorus",
    "bridge":     "Bridge",
    "solo":       "Solo",
    "inst":       "Solo",  # treat instrumental segments as guitar solo by default
    "outro":      "Outro",
    "break":      "Break",
}
NUMBERED = {"verse", "chorus", "solo", "pre-chorus"}


def _merge_adjacent(segs):
    out = []
    for s in segs:
        if out and out[-1]["label"] == s["label"]:
            out[-1]["end"] = s["end"]
        else:
            out.append(dict(s))
    return out


def _absorb_edge_silence(segs):
    if not segs:
        return segs
    out = [dict(s) for s in segs]
    if out[0]["label"] == "silence" and len(out) > 1 and out[1]["label"] != "silence":
        out[1]["start"] = out[0]["start"]
        out = out[1:]
    if out[-1]["label"] == "silence" and len(out) > 1 and out[-2]["label"] != "silence":
        out[-2]["end"] = out[-1]["end"]
        out = out[:-1]
    return out


def _numbering_key(label: str) -> str:
    if label == "inst":
        return "solo"
    return label


def _pretty_name(segs):
    counts_total: dict[str, int] = {}
    for s in segs:
        k = _numbering_key(s["label"])
        counts_total[k] = counts_total.get(k, 0) + 1

    running: dict[str, int] = {}
    out = []
    for s in segs:
        label = s["label"]
        k = _numbering_key(label)
        name = PRETTY.get(label, label.title())
        if k in NUMBERED and counts_total[k] > 1:
            running[k] = running.get(k, 0) + 1
            name = f"{name} {running[k]}"
        out.append({
            "name":     name,
            "startSec": round(s["start"], 2),
            "endSec":   round(s["end"], 2),
        })
    return out


def postprocess(raw_segments, *, combine: bool = True):
    """Apply post-processing.

    combine=True (default): merge adjacent same-label segments + absorb leading/trailing
    silence into the neighboring intro/outro. This is what most users want — produces
    9-ish clean sections per song.

    combine=False: leave raw boundaries intact. SongFormer's full 14-ish-segment output,
    just pretty-named. Useful for debugging or when users want fine-grained chorus halves.
    """
    segs = raw_segments
    if combine:
        segs = _merge_adjacent(segs)
        segs = _absorb_edge_silence(segs)
    return _pretty_name(segs)


# Public API ----------------------------------------------------------------

def infer(audio_path: str, *, combine: bool = True) -> list[dict]:
    """Run SongFormer + post-processing on the given audio file.

    Returns a list of {name, startSec, endSec} ready for Shreddy's API.
    """
    model = _load_model()
    raw = model(audio_path)
    return postprocess(raw, combine=combine)
