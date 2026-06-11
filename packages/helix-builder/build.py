#!/usr/bin/env python3
"""
build.py — Turn a chain spec into a Helix .hlx preset.

Usage:
    python3 build.py <spec.json> <output.hlx>

Spec shape:
    {
      "name": "Rock Crunch",
      "chain": [
        {"category": "Dynamics", "model": "NoiseGate"},
        {"category": "Distort",  "model": "Scream808"},
        {"category": "Amp",      "model": "BritPlexiNrm"},
        {"category": "Cab",      "model": "auto"},
        {"category": "EQ",       "model": "ParametricEQ"},
        {"category": "Delay",    "model": "TransistorTape"},
        {"category": "Reverb",   "model": "DynamicHall"}
      ]
    }

Each chain item names a category and a model. Model is fuzzy-matched against
the phelix block catalog (blocks/<Category>/HD2_<Category><Model>.json).
Cab "auto" tells the builder to attach a sensible 4x12 cab to each amp.
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import json
import os
import re
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parent
PHELIX_ROOT = PKG_ROOT / "phelix"

# Make phelix importable
sys.path.insert(0, str(PHELIX_ROOT))
import util  # noqa: E402
import file as phelix_file  # noqa: E402
import var  # noqa: E402

var.BLOCKS_PATH = str(PHELIX_ROOT / "blocks")

# Default template — phelix's GeneratorTemplate has 5 blocks per DSP across paths
TEMPLATE = PHELIX_ROOT / "presets" / "templates" / "GeneratorTemplate.hlx"

# Mapping of friendly chain "kind" → phelix block category folder
CATEGORIES = ["Amp", "Cab", "Delay", "Distort", "Dynamics", "EQ",
              "Filter", "Mod", "PitchSynth", "Reverb", "VolPan", "Wah"]

# Default cab when an amp asks for "auto" — 4x12 Greenback 25 is the rock workhorse
DEFAULT_AUTO_CAB = "4x12Greenback25"


def list_blocks(category: str) -> list[tuple[str, Path]]:
    """Return [(stem, path)] for every block JSON in a category.

    Stems are kept as-is (e.g. 'HD2_AmpBritPlexiNrm') — prefix conventions
    differ across categories, so we just expose canonical IDs and let the
    fuzzy matcher handle short queries.
    """
    cat_dir = PHELIX_ROOT / "blocks" / category
    if not cat_dir.exists():
        return []
    return [(f.stem, f) for f in sorted(cat_dir.glob("*.json"))]


_TOKEN_SPLIT = re.compile(r'[^A-Za-z0-9]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])')


def _tokenize(s: str) -> list[str]:
    """Lowercase tokens split by camelCase, whitespace, and punctuation."""
    return [t.lower() for t in _TOKEN_SPLIT.split(s) if t]


def _normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())


# Strip vendor/family prefixes so 'HD2_Chorus' compares as 'chorus' against requests.
_VENDOR_PREFIX = re.compile(r'^(hd2|vic|l6spb)[_a-z0-9]*?(?=[A-Z]|$)', re.IGNORECASE)


def _stem_name(stem: str) -> str:
    """Normalized stem with the HD2_/VIC_/L6SPB_ prefix removed, e.g. 'HD2_Chorus' → 'chorus'."""
    s = stem
    for prefix in ("HD2_", "VIC_", "L6SPB_"):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    return _normalize(s)


@functools.lru_cache(maxsize=None)
def _category_token_freq(category: str) -> Counter:
    """How often each token appears across all stems in a category.

    Used by find_block_file to down-weight category-noise tokens like 'dist',
    'comp', 'delay' that appear in nearly every stem — they carry no model
    identity. Rare tokens like 'hall' or 'minotaur' weigh much more.
    """
    freq: Counter = Counter()
    for stem, _ in list_blocks(category):
        for t in _tokenize(stem):
            freq[t] += 1
    return freq


def find_block_file(category: str, requested: str) -> Path | None:
    """Match a requested model name against catalog entries in a category.

    Strategy (highest priority first):
      1. Exact normalized match (case- and punctuation-insensitive)
      2. Requested string is a substring of a catalog stem
      3. Token-coverage scoring: how many request tokens appear in the stem,
         with a shortest-name tiebreak so 'Vol' picks VolPanVol over VolPanGain
    Returns None if no candidate clears a minimum score.
    """
    blocks = list_blocks(category)
    if not blocks:
        return None

    req_norm = _normalize(requested)
    if not req_norm:
        return None
    req_tokens = _tokenize(requested)

    # Pass 1: exact normalized match anywhere in the stem
    for name, path in blocks:
        if _normalize(name) == req_norm:
            return path

    # Pass 2 + 3: score every candidate, pick the best
    freq = _category_token_freq(category)
    best_score = -1.0
    best_path: Path | None = None
    best_len = 10**9
    for name, path in blocks:
        n_norm = _normalize(name)
        s_norm = _stem_name(name)  # stem with vendor prefix removed
        if req_norm in n_norm or req_norm in s_norm:
            score = 2.0  # full request appears verbatim
        elif s_norm and s_norm in req_norm:
            score = 1.6  # candidate's bare stem is contained in request (e.g. 'chorus' in 'deluxechorus')
        elif n_norm in req_norm:
            score = 1.4  # full stem (with prefix) contained in request
        else:
            if not req_tokens:
                continue
            # Inverse-frequency token score: a token that appears in only one
            # stem (e.g. 'minotaur', 'hall') is worth 1.0; one that appears in
            # half the catalog (e.g. 'dist', 'reverb') is worth ~0.04.
            raw = 0.0
            for t in req_tokens:
                if len(t) < 2 or t not in n_norm:
                    continue
                raw += 1.0 / max(1, freq.get(t, 1))
            if raw == 0:
                continue
            score = raw / len(req_tokens)

        # Prefer canonical HD2_-prefixed stems over vendor extensions (VIC_, L6SPB_, etc.)
        if name.startswith("HD2_"):
            score += 0.05

        # Tiebreak on shorter name = more specific match
        if (score > best_score) or (score == best_score and len(n_norm) < best_len):
            best_score = score
            best_path = path
            best_len = len(n_norm)

    # Threshold: require at least one distinctive token to land
    if best_score >= 0.25:
        return best_path
    return None


def list_catalog() -> dict[str, list[str]]:
    """For the LLM prompt: every category and the short model names available."""
    return {cat: [n for n, _ in list_blocks(cat)] for cat in CATEGORIES}


def build(spec: dict, out_path: Path) -> dict:
    """Build a .hlx file from the spec. Returns a small report dict."""
    name = spec.get("name", "Untitled")
    chain = spec.get("chain", [])

    with open(TEMPLATE) as f:
        preset = json.load(f)

    util.set_preset_name(preset, name)
    util.add_dsp_controller_splits_and_snapshot_keys_if_missing(preset)

    # Two DSPs × 5 block slots each → 10 main blocks max. Spill onto dsp1 when dsp0 fills.
    dsps = [
        ("dsp0", ["block0", "block1", "block2", "block3", "block4"]),
        ("dsp1", ["block0", "block1", "block2", "block3", "block4"]),
    ]
    placement_plan: list[tuple[str, str, int]] = [(d, s, i) for d, slots in dsps for i, s in enumerate(slots)]
    plan_idx = 0
    placed: list[dict] = []
    unmatched: list[dict] = []

    # Split chain: Cab entries don't take a block slot — they're routed to cab0/cab1
    # via the next amp's @cab pointer. Queue them in order; auto-cab pass consumes them.
    cab_queue: list[str] = []
    for item in chain:
        if item.get("category") == "Cab":
            cab_queue.append(item.get("model") or "auto")

    for item in chain:
        category = item.get("category")
        model = item.get("model")
        if not category or not model:
            unmatched.append({"item": item, "reason": "missing category or model"})
            continue
        if category == "Cab":
            continue  # routed to cab queue, not a main block slot
        if plan_idx >= len(placement_plan):
            unmatched.append({"item": item, "reason": "chain too long, no slots left across both DSPs"})
            continue

        block_path = find_block_file(category, model)
        if block_path is None:
            unmatched.append({"item": item, "reason": f"no match in catalog/{category}"})
            continue

        dsp, slot, pos = placement_plan[plan_idx]
        block_dict = phelix_file.load_block_dictionary(str(block_path))
        util.add_raw_block_to_default_and_controller_and_snapshots(preset, dsp, slot, block_dict)
        util.get_default_dsp_slot(preset, dsp, slot)["@path"] = 0
        util.get_default_dsp_slot(preset, dsp, slot)["@position"] = pos
        plan_idx += 1
        placed.append({
            "dsp": dsp,
            "slot": slot,
            "category": category,
            "requested": model,
            "actual": block_path.stem,
        })

    # Cab attachment: for each amp, consume next requested cab from the queue
    # (or use the default 4x12 if queue is empty). Cabs live in their own cab0/cab1
    # slots referenced by the amp's @cab field — they do NOT use main block slots.
    for dsp, _slots in dsps:
        cabs_used = 0
        for slot in list(util.get_default_dsp(preset, dsp).keys()):
            if not slot.startswith("block"):
                continue
            model_name = util.get_model_name(preset, dsp, slot)
            if not (model_name and model_name.startswith("HD2_Amp")):
                continue

            requested_cab = cab_queue.pop(0) if cab_queue else "auto"
            if requested_cab == "auto" or not requested_cab:
                cab_path = find_block_file("Cab", DEFAULT_AUTO_CAB) or list_blocks("Cab")[0][1]
            else:
                cab_path = find_block_file("Cab", requested_cab) or find_block_file("Cab", DEFAULT_AUTO_CAB)

            cab_slot = f"cab{cabs_used}"
            util.get_default_dsp_slot(preset, dsp, slot)["@cab"] = cab_slot
            cab_dict = phelix_file.load_block_dictionary(str(cab_path))
            util.add_raw_block_to_default_and_controller_and_snapshots(preset, dsp, cab_slot, cab_dict)
            cabs_used += 1
            placed.append({
                "dsp": dsp,
                "slot": cab_slot,
                "category": "Cab",
                "requested": requested_cab,
                "actual": cab_path.stem,
            })

    # Any cabs requested but not attached (no amp left to host) get reported
    for leftover in cab_queue:
        unmatched.append({
            "item": {"category": "Cab", "model": leftover},
            "reason": "no amp left to attach this cab to",
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(preset, f, indent=4)

    return {"output": str(out_path), "name": name, "placed": placed, "unmatched": unmatched}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec", nargs="?", help="Path to JSON spec file (or - for stdin)")
    ap.add_argument("output", nargs="?", help="Output .hlx path")
    ap.add_argument("--catalog", action="store_true",
                    help="Print the block catalog as JSON and exit (ignores spec/output)")
    args = ap.parse_args()

    if args.catalog:
        print(json.dumps(list_catalog(), indent=2))
        return

    if not args.spec or not args.output:
        ap.error("spec and output are required unless --catalog is used")

    if args.spec == "-":
        spec = json.load(sys.stdin)
    else:
        with open(args.spec) as f:
            spec = json.load(f)

    # Phelix's helpers print debug info via print(); push those to stderr so
    # stdout is pure JSON and callers (test_all.py, the Next.js API) can parse it.
    with contextlib.redirect_stdout(sys.stderr):
        report = build(spec, Path(args.output))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
