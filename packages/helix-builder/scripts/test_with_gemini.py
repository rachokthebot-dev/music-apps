#!/usr/bin/env python3
"""End-to-end prompt test using Google Gemini.

For each profile in profiles/, send PROMPT.md + the profile text to Gemini,
save the JSON spec it returns, run build.py on it, and verify the .hlx is
structurally sound. Compare placements against the hand-built specs.

Usage:
    GEMINI_API_KEY=... python3 scripts/test_with_gemini.py [--model gemini-2.5-flash]

Reads:  PROMPT.md, profiles/*.md, examples/*.json (for comparison)
Writes: out/gemini/<profile>.spec.json, out/gemini/<profile>.hlx
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
PROMPT = PKG / "PROMPT.md"
PROFILES = PKG / "profiles"
EXAMPLES = PKG / "examples"
OUT = PKG / "out" / "gemini"
OUT.mkdir(parents=True, exist_ok=True)


def read_system_prompt() -> str:
    """Extract the section between '## SYSTEM PROMPT' and the '===' separator."""
    md = PROMPT.read_text()
    m = re.search(r"## SYSTEM PROMPT.*?\n(.*?)\n===", md, re.DOTALL)
    if not m:
        raise SystemExit("could not locate SYSTEM PROMPT section in PROMPT.md")
    # Drop the heading line itself (everything up to first blank line after the header)
    body = m.group(1)
    # Trim the "(copy from here to the `===` line)" note if present
    body = re.sub(r"^.*?\n\n", "", body, count=1)
    return body.strip()


def call_gemini(api_key: str, model: str, system: str, user: str, *, max_retries: int = 4) -> str:
    """Single-turn call to the Gemini generateContent endpoint with retry on 429/5xx."""
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    req_body = json.dumps(body).encode("utf-8")

    delay = 2.0
    for attempt in range(1, max_retries + 1):
        req = urllib.request.Request(
            url, data=req_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            transient = e.code in (429, 500, 502, 503, 504)
            if transient and attempt < max_retries:
                print(f"     Gemini {e.code} — retry {attempt}/{max_retries} in {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
                continue
            raise SystemExit(f"Gemini HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")

    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise SystemExit(f"unexpected Gemini response shape: {json.dumps(payload)[:500]}")
    return text


def run_build(spec_path: Path, out_path: Path) -> dict:
    proc = subprocess.run(
        [sys.executable, str(PKG / "build.py"), str(spec_path), str(out_path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"build.py failed:\n{proc.stderr}")
    return json.loads(proc.stdout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gemini-2.5-flash",
                    help="Gemini model ID (default: gemini-2.5-flash)")
    ap.add_argument("--profile", default=None,
                    help="Only run this profile (filename stem)")
    args = ap.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        # Fallback: ~/.config/gemini/key (one line, chmod 600)
        key_file = Path.home() / ".config" / "gemini" / "key"
        if key_file.exists():
            api_key = key_file.read_text().strip()
    if not api_key:
        raise SystemExit(
            "no Gemini API key found. Either:\n"
            "  - export GEMINI_API_KEY in the same shell that runs this script, or\n"
            "  - put it in ~/.config/gemini/key (one line, chmod 600)"
        )

    system = read_system_prompt()

    profiles = sorted(PROFILES.glob("*.md"))
    if args.profile:
        profiles = [p for p in profiles if p.stem == args.profile]
    if not profiles:
        raise SystemExit(f"no profiles found in {PROFILES} (looking for *.md)")

    summary: list[dict] = []
    for prof in profiles:
        user_msg = prof.read_text()
        print(f"\n── {prof.stem} ──")
        print(f"  → calling Gemini ({args.model})…")
        raw = call_gemini(api_key, args.model, system, user_msg)

        # Save raw, in case parsing fails we can inspect
        (OUT / f"{prof.stem}.raw.txt").write_text(raw)

        # Strip markdown fences if Gemini wrapped them despite our rule
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            spec = json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"  ✗ Gemini did not return valid JSON ({e}); see {OUT / (prof.stem + '.raw.txt')}")
            summary.append({"profile": prof.stem, "status": "invalid_json"})
            continue

        spec_path = OUT / f"{prof.stem}.spec.json"
        spec_path.write_text(json.dumps(spec, indent=2))
        hlx_path = OUT / f"{prof.stem}.hlx"
        print(f"  → building → {hlx_path.name}")
        report = run_build(spec_path, hlx_path)

        n_placed = len(report["placed"])
        n_unmatched = len(report["unmatched"])
        status = "OK" if n_unmatched == 0 else "PARTIAL"
        print(f"  {status}: {n_placed} placed, {n_unmatched} unmatched")
        for p in report["placed"]:
            print(f"     ✓ {p['dsp']}.{p['slot']:<6} {p['category']:9} {p['requested']:30} → {p['actual']}")
        for u in report["unmatched"]:
            print(f"     ✗ {u}")

        summary.append({
            "profile": prof.stem,
            "status": status,
            "placed": n_placed,
            "unmatched": n_unmatched,
            "spec": str(spec_path),
            "hlx": str(hlx_path),
        })

    print(f"\n══════════════════════════════════════")
    print(f"Summary: {len(summary)} profile(s)")
    for s in summary:
        print(f"  {s['status']:8}  {s['profile']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
