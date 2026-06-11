#!/usr/bin/env python3
"""
build_snapshot.py — Patch a single snapshot in a master Helix preset.

Usage:
    python3 build_snapshot.py <spec.json> <output.hlx> [--master <path>]

Default master: templates/master.hlx (your "General Presest 2").

Spec shape:
    {
      "target_snapshot": "ROCK RHY",            # name or 0-7 index
      "snapshot_name":   "ROCK RHY",            # optional, rename target
      "enable":  ["Comp", "Klon", "EQ", ...],   # friendly names → set enabled
      "bypass":  ["US Double", "2x12 Cab", ...], # friendly names → set bypassed
      "params": {
        "US Double": {"ChVol": 0.72, ...},
        "Delay":     {"Mix":   0.18},
        ...
      }
    }

Friendly names are resolved against the master's block @model fields with a
small alias table. Any block on the master can be referenced by its model id
directly or by any friendly alias mapped to it.
"""

from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path

PKG = Path(__file__).resolve().parent
DEFAULT_MASTER = PKG / "templates" / "master.hlx"


# Friendly block names → substrings to search for in @model (case-insensitive).
# First match wins per call to resolve_block(); aliases pointing to multiple
# candidates use the FIRST candidate that matches a block in the master.
FRIENDLY_BLOCK_ALIASES: dict[str, list[str]] = {
    # block0 — compressor
    "Comp":           ["compressor"],
    "Compressor":     ["compressor"],
    "DeluxeComp":     ["deluxecomp"],
    # block1 — klon
    "Klon":           ["minotaur"],
    "Minotaur":       ["minotaur"],
    "Drive":          ["minotaur"],
    # block2 — clean amp
    "US Double":      ["usdouble"],
    "USDouble":       ["usdouble"],
    "Fender Twin":    ["usdouble"],
    "Twin":           ["usdouble"],
    "Clean Amp":      ["usdouble", "usdeluxe", "usprincess"],
    # block3 — clean amp cab
    "2x12 Cab":       ["2x12doublec12n", "2x12"],
    "2x12":           ["2x12doublec12n", "2x12"],
    "Clean Cab":      ["2x12doublec12n"],
    # block4 — EQ
    "EQ":             ["eqparametric", "eq"],
    "Parametric EQ":  ["eqparametric"],
    "Parametric":     ["eqparametric"],
    # block5 — delay
    "Delay":          ["delaysimpledelay", "delay"],
    "Simple Delay":   ["delaysimpledelay"],
    # block6 — gain boost
    "Boost":          ["volpangain"],
    "Gain Boost":     ["volpangain"],
    "Gain":           ["volpangain"],
    "Utility Gain":   ["volpangain"],
    # block7 — dirty amp
    "JCM800":         ["brit2203"],
    "Brit 2203":      ["brit2203"],
    "Marshall":       ["brit2203", "brit"],
    "Dirty Amp":      ["brit2203", "brit"],
    # block8 — dirty amp cab
    "4x12 Greenback": ["4x12greenback25", "4x12greenback"],
    "Greenback":      ["greenback"],
    "Dirty Cab":      ["4x12greenback"],
}


def _norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalnum())


def list_chain_blocks(preset: dict) -> list[tuple[str, str, str]]:
    """Return [(dsp, slot, model)] for every block-shaped slot in the master."""
    out: list[tuple[str, str, str]] = []
    for dsp in ("dsp0", "dsp1"):
        for slot, node in preset["data"]["tone"].get(dsp, {}).items():
            if not isinstance(node, dict):
                continue
            if not slot.startswith("block"):
                continue
            model = node.get("@model")
            if isinstance(model, str):
                out.append((dsp, slot, model))
    return out


def resolve_block(preset: dict, name: str) -> tuple[str, str] | None:
    """Map a friendly name (or direct model id) to (dsp, slot) in the master.

    Resolution order:
      1. Exact @model match (case-insensitive, normalized)
      2. Substring match against @model
      3. Alias table → substring match
    """
    chain = list_chain_blocks(preset)
    if not chain:
        return None

    target_norm = _norm(name)

    # Direct model match (handles passing canonical IDs straight through)
    for dsp, slot, model in chain:
        if _norm(model) == target_norm:
            return (dsp, slot)

    # Substring match on raw model
    for dsp, slot, model in chain:
        if target_norm and target_norm in _norm(model):
            return (dsp, slot)

    # Alias table lookup
    aliases = None
    for alias_name, candidates in FRIENDLY_BLOCK_ALIASES.items():
        if _norm(alias_name) == target_norm:
            aliases = candidates
            break
    if aliases:
        for substr in aliases:
            substr_norm = _norm(substr)
            for dsp, slot, model in chain:
                if substr_norm in _norm(model):
                    return (dsp, slot)
    return None


def resolve_snapshot_index(preset: dict, target: str | int) -> int:
    """Map a snapshot name or numeric index to 0..7."""
    if isinstance(target, int) or (isinstance(target, str) and target.isdigit()):
        i = int(target)
        if 0 <= i < 8:
            return i
        raise ValueError(f"snapshot index out of range: {target}")
    target_norm = _norm(str(target))
    for i in range(8):
        name = preset["data"]["tone"].get(f"snapshot{i}", {}).get("@name", "")
        if _norm(name) == target_norm:
            return i
    # Substring fallback
    for i in range(8):
        name = preset["data"]["tone"].get(f"snapshot{i}", {}).get("@name", "")
        if target_norm in _norm(name) or _norm(name) in target_norm:
            return i
    raise ValueError(f"no snapshot matches {target!r}")


def patch_snapshot(preset: dict, spec: dict) -> dict:
    """Apply spec to the target snapshot. Returns a report dict."""
    snap_idx = resolve_snapshot_index(preset, spec["target_snapshot"])
    snap_key = f"snapshot{snap_idx}"
    snap = preset["data"]["tone"][snap_key]

    report: dict = {
        "snapshot_index": snap_idx,
        "snapshot_name": snap["@name"],
        "enabled": [],
        "bypassed": [],
        "params_set": [],
        "unresolved": [],
    }

    # Optional rename
    if "snapshot_name" in spec:
        snap["@name"] = spec["snapshot_name"]
        report["snapshot_name"] = spec["snapshot_name"]

    # Apply enable / bypass toggles — create dsp dicts lazily so we don't add
    # empty containers (master keeps tone tree minimal where possible).
    snap.setdefault("blocks", {})

    for friendly in spec.get("enable", []):
        res = resolve_block(preset, friendly)
        if not res:
            report["unresolved"].append({"name": friendly, "where": "enable"})
            continue
        dsp, slot = res
        snap["blocks"].setdefault(dsp, {})[slot] = True
        report["enabled"].append({"name": friendly, "dsp": dsp, "slot": slot})

    for friendly in spec.get("bypass", []):
        res = resolve_block(preset, friendly)
        if not res:
            report["unresolved"].append({"name": friendly, "where": "bypass"})
            continue
        dsp, slot = res
        snap["blocks"].setdefault(dsp, {})[slot] = False
        report["bypassed"].append({"name": friendly, "dsp": dsp, "slot": slot})

    # Apply parameter overrides
    snap.setdefault("controllers", {})

    for friendly, params in spec.get("params", {}).items():
        res = resolve_block(preset, friendly)
        if not res:
            report["unresolved"].append({"name": friendly, "where": "params"})
            continue
        dsp, slot = res
        controllers = snap["controllers"].setdefault(dsp, {}).setdefault(slot, {})
        for param_name, value in params.items():
            controllers.setdefault(param_name, {"@fs_enabled": False, "@value": 0})
            controllers[param_name]["@value"] = value
            report["params_set"].append({
                "name": friendly, "dsp": dsp, "slot": slot,
                "param": param_name, "value": value,
            })

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec", help="Path to spec JSON")
    ap.add_argument("output", help="Output .hlx path")
    ap.add_argument("--master", default=str(DEFAULT_MASTER),
                    help=f"Master preset to patch (default: {DEFAULT_MASTER})")
    args = ap.parse_args()

    with open(args.master) as f:
        preset = json.load(f)
    with open(args.spec) as f:
        spec = json.load(f)

    report = patch_snapshot(preset, spec)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    # Match HX Edit's native format: 2-space indent, space before colon.
    # Keeps diffs tight against the master and looks native in a side-by-side.
    with open(out, "w") as f:
        json.dump(preset, f, indent=2, separators=(",", " : "))

    report["output"] = str(out)
    print(json.dumps(report, indent=2))
    return 1 if report["unresolved"] else 0


if __name__ == "__main__":
    sys.exit(main())
