#!/usr/bin/env python3
"""Fuzzy matcher torture test.

For each (English name, expected Helix stem) pair below, confirm find_block_file
resolves the English to the expected catalog entry. Anything failing here means
the LLM prompt needs an alias map OR the matcher needs to learn the synonym.

Run: python3 test_fuzzy.py
Exits 0 if everything resolved correctly, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build import find_block_file  # noqa: E402


# (category, english_name, expected_stem)
# expected_stem == None means: we expect NO match (test the negative path)
CASES: list[tuple[str, str, str | None]] = [
    # ---- Dynamics ----
    ("Dynamics", "NoiseGate",          "HD2_GateNoiseGate"),
    ("Dynamics", "Noise Gate",         "HD2_GateNoiseGate"),
    ("Dynamics", "noisegate",          "HD2_GateNoiseGate"),
    ("Dynamics", "HardGate",           "HD2_GateHardGate"),
    ("Dynamics", "HorizonGate",        "HD2_GateHorizonGate"),
    ("Dynamics", "DeluxeComp",         "HD2_CompressorDeluxeComp"),
    # "Optical" vs "Opto" — semantic abbreviation; matcher should bow out, LLM retries
    ("Dynamics", "Optical Comp",       None),
    ("Dynamics", "LA Studio",          "HD2_CompressorLAStudioComp"),

    # ---- Distort ----
    ("Distort",  "Scream808",          "HD2_DistScream808"),
    ("Distort",  "Tube Screamer",      None),  # no literal name; LLM should pick Scream808
    ("Distort",  "Minotaur",           "HD2_DistMinotaur"),
    ("Distort",  "Klon",               None),  # no literal; LLM should pick Minotaur or KinkyBoost
    ("Distort",  "VerminDist",         "HD2_DistVerminDist"),
    ("Distort",  "ClassicDist",        None),  # not literal — LLM should know Helix calls it Vermin
    ("Distort",  "RatatouilleDist",    "HD2_DistRatatouilleDist"),
    ("Distort",  "RamsHead",           "HD2_DistRamsHead"),
    ("Distort",  "Big Muff",           None),  # would need a synonym map → RamsHead/TriangleFuzz
    ("Distort",  "TriangleFuzz",       "HD2_DistTriangleFuzz"),
    ("Distort",  "HeirApparent",       "HD2_DistHeirApparent"),
    ("Distort",  "Obsidian7000",       "HD2_DistObsidian7000"),

    # ---- Amp ----
    ("Amp",      "BritPlexiNrm",       "HD2_AmpBritPlexiNrm"),
    ("Amp",      "Brit Plexi Nrm",     "HD2_AmpBritPlexiNrm"),
    ("Amp",      "britplexinrm",       "HD2_AmpBritPlexiNrm"),
    ("Amp",      "USDeluxeVib",        "HD2_AmpUSDeluxeVib"),
    ("Amp",      "US Deluxe Vib",      "HD2_AmpUSDeluxeVib"),
    ("Amp",      "USDeluxeNrm",        "HD2_AmpUSDeluxeNrm"),
    ("Amp",      "PlacaterDirty",      "HD2_AmpPlacaterDirty"),
    ("Amp",      "Placater",           "HD2_AmpPlacaterClean"),   # fuzzy picks first containing match
    ("Amp",      "PlacaterClean",      "HD2_AmpPlacaterClean"),
    ("Amp",      "RevvGenRed",         "HD2_AmpRevvGenRed"),
    ("Amp",      "Revv Gen Red",       "HD2_AmpRevvGenRed"),
    ("Amp",      "CaliRectifire",      "HD2_AmpCaliRectifire"),
    ("Amp",      "Rectifier",          None),  # spelled differently; LLM hint needed
    ("Amp",      "ArchetypeClean",     "HD2_AmpArchetypeClean"),
    ("Amp",      "ArchetypeLead",      "HD2_AmpArchetypeLead"),
    ("Amp",      "BritJ45Nrm",         "HD2_AmpBritJ45Nrm"),
    ("Amp",      "Marshall JCM",       None),  # no literal; LLM should map → BritJ45
    ("Amp",      "TweedBluesNrm",      "HD2_AmpTweedBluesNrm"),
    ("Amp",      "Soldano",            None),  # no literal; LLM should pick SoloLeadOD

    # ---- Cab ----
    ("Cab",      "4x12Greenback25",    "HD2_CabMicIr_4x12Greenback25"),
    ("Cab",      "4x12 Greenback 25",  "HD2_CabMicIr_4x12Greenback25"),
    ("Cab",      "1x12USDeluxe",       "HD2_CabMicIr_1x12USDeluxe"),
    ("Cab",      "1x12 Deluxe",        "HD2_CabMicIr_1x12USDeluxe"),
    ("Cab",      "4x12BritV30",        "HD2_CabMicIr_4x12BritV30"),
    ("Cab",      "4x12 Cali V30",      "HD2_CabMicIr_4x12CaliV30"),
    ("Cab",      "WhoWatt100",         "HD2_CabMicIr_4x12WhoWatt100"),
    ("Cab",      "SoupPro",            "HD2_CabMicIr_SoupProEllipse"),

    # ---- EQ ----
    ("EQ",       "Parametric",         "HD2_EQParametric"),
    ("EQ",       "Parametric EQ",      "HD2_EQParametric"),
    ("EQ",       "Graphic10Band",      "HD2_EQGraphic10Band"),
    ("EQ",       "10-Band Graphic",    "HD2_EQGraphic10Band"),
    ("EQ",       "LowCutHighCut",      "HD2_EQLowCutHighCut"),
    ("EQ",       "Simple3Band",        "HD2_EQSimple3Band"),
    ("EQ",       "CaliQ",              "HD2_CaliQ"),

    # ---- Mod ----
    ("Mod",      "Chorus",             "HD2_Chorus"),
    # No literal "Deluxe Chorus" — HD2_Chorus is the right Helix substitution
    ("Mod",      "DeluxeChorus",       "HD2_Chorus"),
    ("Mod",      "70sChorus",          "HD2_Chorus70sChorus"),
    ("Mod",      "ScriptPhase",        "HD2_MM4ScriptPhase"),
    ("Mod",      "Script Phase",       "HD2_MM4ScriptPhase"),
    ("Mod",      "OptoTremolo",        "HD2_MM4OptoTremolo"),
    ("Mod",      "Rotary122",          "HD2_Rotary122Rotary"),

    # ---- Delay ----
    ("Delay",    "SimpleDelay",        "HD2_DelaySimpleDelay"),
    ("Delay",    "Simple Delay",       "HD2_DelaySimpleDelay"),
    ("Delay",    "TransistorTape",     "HD2_DelayTransistorTape"),
    ("Delay",    "Transistor Tape",    "HD2_DelayTransistorTape"),
    # "Digital Delay" maps cleanly to Helix's VintageDigital model (DL4 uses "Dig" abbreviation)
    ("Delay",    "DigitalDelay",       "HD2_DelayVintageDigitalV2"),
    ("Delay",    "ElephantMan",        "HD2_DelayElephantMan"),
    ("Delay",    "PingPong",           "HD2_DL4PingPong"),
    ("Delay",    "TapeEcho",           "HD2_DL4TapeEchoStereo"),

    # ---- Reverb ----
    ("Reverb",   "Hall",               "HD2_ReverbHall"),
    ("Reverb",   "Dynamic Hall",       "HD2_ReverbHall"),  # substring of Hall fits
    ("Reverb",   "Plate",              "HD2_ReverbPlate"),
    ("Reverb",   "Spring",             "HD2_ReverbSpring"),  # canonical Spring (over 63Spring/HxSpring)
    ("Reverb",   "Room",               "HD2_ReverbRoom"),
    ("Reverb",   "Chamber",            "HD2_ReverbChamber"),
    ("Reverb",   "Plateaux",           "HD2_ReverbPlateaux"),
    ("Reverb",   "Particle",           "HD2_ReverbParticle"),
    ("Reverb",   "Ducking",            "HD2_ReverbDucking"),

    # ---- VolPan ----
    ("VolPan",   "Gain",               "HD2_VolPanGain"),
    ("VolPan",   "Utility Gain",       "HD2_VolPanGain"),
    ("VolPan",   "Vol",                "HD2_VolPanVol"),

    # ---- Wah ----
    ("Wah",      "Chrome",             "HD2_WahChrome"),
    ("Wah",      "Fassel",             "HD2_WahFassel"),
    ("Wah",      "Teardrop",           "HD2_WahTeardrop310"),

    # ---- Negative: total nonsense ----
    ("Amp",      "NotARealAmp",        None),  # should not match anything in catalog
    ("Distort",  "Quesadilla",         None),
]


def main() -> int:
    width = max(len(c[0]) + len(c[1]) for c in CASES) + 4
    passed = 0
    failed: list[str] = []

    for category, english, expected in CASES:
        result = find_block_file(category, english)
        actual_stem = result.stem if result else None
        ok = (actual_stem == expected)
        if ok:
            passed += 1
        else:
            failed.append(
                f"  {category}/{english!r}  expected {expected!r}  got {actual_stem!r}"
            )

    total = len(CASES)
    print(f"Fuzzy matcher: {passed}/{total} cases pass")
    if failed:
        print(f"\n{len(failed)} failure(s):")
        for line in failed:
            print(line)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
