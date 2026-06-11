#!/usr/bin/env python3
"""Build every example spec and verify the resulting .hlx structurally.

Checks per preset:
  - Every chain item resolved to a real catalog entry (no unmatched)
  - Every amp has a cab slot that exists in the file
  - Every placed model name appears in the on-disk dsp tree at the claimed slot
  - The file is valid JSON and has the expected top-level keys
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXAMPLES = ROOT / "examples"
OUT = ROOT / "out"


def build(spec_path: Path, out_path: Path) -> dict:
    cmd = [sys.executable, str(ROOT / "build.py"), str(spec_path), str(out_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"build.py exited {proc.returncode}\n--stdout--\n{proc.stdout}\n--stderr--\n{proc.stderr}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(f"build.py stdout was not JSON: {e}\n--stdout--\n{proc.stdout}\n--stderr--\n{proc.stderr}")


def verify(spec_path: Path, hlx_path: Path, report: dict) -> list[str]:
    """Return a list of human-readable problems. Empty means everything checks out."""
    problems: list[str] = []

    if report["unmatched"]:
        for u in report["unmatched"]:
            problems.append(f"unmatched: {u}")

    with open(hlx_path) as f:
        preset = json.load(f)

    # Top-level shape sanity
    for key in ("data", "meta", "schema", "version"):
        if key not in preset:
            problems.append(f"missing top-level key: {key}")
    if "tone" not in preset.get("data", {}):
        problems.append("missing data.tone")

    tone = preset["data"]["tone"]

    # Every placed entry should exist at its claimed dsp.slot with its claimed model
    for p in report["placed"]:
        dsp, slot, actual = p["dsp"], p["slot"], p["actual"]
        node = tone.get(dsp, {}).get(slot)
        if not isinstance(node, dict):
            problems.append(f"placed entry {dsp}.{slot} not present in tone tree")
            continue
        on_disk_model = node.get("@model")
        if on_disk_model != actual:
            problems.append(
                f"placed entry {dsp}.{slot}: report says {actual!r}, .hlx has {on_disk_model!r}"
            )

    # Every amp should have a cab slot it points at
    for dsp_name in ("dsp0", "dsp1"):
        dsp = tone.get(dsp_name, {})
        for slot, node in dsp.items():
            if not (isinstance(node, dict) and isinstance(node.get("@model"), str)):
                continue
            model = node["@model"]
            if not (slot.startswith("block") and model.startswith("HD2_Amp")):
                continue
            cab_ptr = node.get("@cab", "")
            if not cab_ptr:
                problems.append(f"{dsp_name}.{slot} amp {model} has no @cab pointer")
                continue
            cab_node = dsp.get(cab_ptr)
            if not isinstance(cab_node, dict):
                problems.append(f"{dsp_name}.{slot} amp {model} points at @cab={cab_ptr!r} but that slot is missing in {dsp_name}")
                continue
            cab_model = cab_node.get("@model", "")
            if not isinstance(cab_model, str) or "Cab" not in cab_model:
                problems.append(f"{dsp_name}.{cab_ptr} expected a cab model, found {cab_model!r}")

    return problems


def main():
    specs = sorted(EXAMPLES.glob("*.json"))
    if not specs:
        raise SystemExit("no specs found in examples/")

    overall_problems = 0
    width = max(len(s.stem) for s in specs)
    for spec in specs:
        out = OUT / f"{spec.stem}.hlx"
        report = build(spec, out)
        problems = verify(spec, out, report)
        status = "OK" if not problems else f"{len(problems)} ISSUE(S)"
        overall_problems += len(problems)
        print(f"\n{'='*70}\n{spec.stem:<{width}}  →  {status}")
        for p in report["placed"]:
            print(f"  ✓ {p['dsp']}.{p['slot']:<6}  {p['category']:9}  {p['requested']:18} → {p['actual']}")
        for u in report["unmatched"]:
            print(f"  ✗ unmatched: {u}")
        for prob in problems:
            print(f"  ✗ {prob}")

    print(f"\n{'='*70}\nTotal problems across {len(specs)} specs: {overall_problems}")
    sys.exit(0 if overall_problems == 0 else 1)


if __name__ == "__main__":
    main()
