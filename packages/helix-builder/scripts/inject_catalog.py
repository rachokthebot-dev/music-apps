#!/usr/bin/env python3
"""Inject the current block catalog into PROMPT.md.

Re-run this any time the catalog changes so the prompt stays in sync with build.py.
Usage: python3 scripts/inject_catalog.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
PROMPT = PKG / "PROMPT.md"
BUILD = PKG / "build.py"

ORDER = [
    "Dynamics", "Distort", "Amp", "Cab", "EQ", "Mod",
    "Delay", "Reverb", "PitchSynth", "VolPan", "Filter", "Wah",
]


def main() -> int:
    cat = json.loads(
        subprocess.run([sys.executable, str(BUILD), "--catalog"],
                       capture_output=True, text=True, check=True).stdout
    )

    sections: list[str] = []
    for c in ORDER:
        ids = cat.get(c, [])
        sections.append(f"**{c}** ({len(ids)})\n")
        sections.append("```")
        sections.extend(ids)
        sections.append("```\n")
    catalog_block = "\n".join(sections).rstrip() + "\n"

    md = PROMPT.read_text()

    # Replace either the placeholder OR an existing catalog block between markers.
    if "<!-- CATALOG_INSERT -->" in md:
        md = md.replace("<!-- CATALOG_INSERT -->", catalog_block)
    else:
        # Remove old auto-injected content (every line from "**Dynamics** (" through
        # the trailing "---" before the "Below the `===`" footer).
        md = re.sub(
            r"\*\*Dynamics\*\* \(\d+\).*?(?=\n---\n)",
            catalog_block,
            md,
            count=1,
            flags=re.DOTALL,
        )

    PROMPT.write_text(md)
    total = sum(len(v) for v in cat.values())
    print(f"PROMPT.md updated with {total} block IDs across {len(ORDER)} categories")
    return 0


if __name__ == "__main__":
    sys.exit(main())
