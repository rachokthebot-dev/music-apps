/**
 * Friendly block names for display.
 *
 * Layered lookup: curated table → vendored HelAIx catalog → fallback formatter.
 * Curated entries take priority because they encode rig-specific preference
 * (e.g. the Brit 2203 is the JCM800 — what guitarists actually call it) and
 * fill gaps the HelAIx catalog doesn't cover yet.
 */

import { catalogName, catalogBasedOn } from "./catalog";

const CURATED: Record<string, string> = {
  // User's "General Presest" master chain — names are specific so the
  // friendlyBlock("category (name)") form never reads as "Comp (Comp)".
  HD2_CompressorDeluxeComp: "Deluxe Comp",
  HD2_DistMinotaur: "Klon",
  HD2_AmpUSDoubleNrm: "US Double",
  HD2_CabMicIr_2x12DoubleC12N: "2x12 C12N",
  HD2_EQParametric: "Parametric",
  HD2_DelaySimpleDelay: "Simple Delay",
  HD2_VolPanGain: "Boost",
  HD2_AmpBrit2203: "JCM800",
  HD2_CabMicIr_4x12Greenback25: "4x12 Greenback",

  // Common Helix amp models — we'll grow this as more presets show up
  HD2_AmpBritPlexiNrm: "Plexi Nrm",
  HD2_AmpBritPlexiBrt: "Plexi Brt",
  HD2_AmpBritJ45Nrm: "JCM Bluesbreaker",
  HD2_AmpUSDeluxeNrm: "Deluxe Nrm",
  HD2_AmpUSDeluxeVib: "Deluxe Vib",
  HD2_AmpUSDoubleVib: "US Double Vib",
  HD2_AmpUSPrincess: "Princess",
  HD2_AmpA30FawnNrm: "AC30 Nrm",
  HD2_AmpEssexA15: "AC15",
  HD2_AmpCaliRectifire: "Recto",
  HD2_AmpCaliIVLead: "Mark IV",
  HD2_AmpSoloLeadOD: "Soldano",
  HD2_AmpPlacaterDirty: "Placater Dirty",
  HD2_AmpPlacaterClean: "Placater Clean",
  HD2_AmpRevvGenRed: "Revv Red",
  HD2_AmpRevvGenPurple: "Revv Purple",
  HD2_AmpArchetypeClean: "Archetype Clean",
  HD2_AmpArchetypeLead: "Archetype Lead",
  HD2_AmpTweedBluesNrm: "Tweed Blues",

  // Common drives / dirt
  HD2_DistScream808: "Tube Screamer",
  HD2_DistVerminDist: "RAT",
  HD2_DistRamsHead: "Big Muff (Ram's Head)",
  HD2_DistTriangleFuzz: "Big Muff (Triangle)",
  HD2_DistArbitratorFuzz: "Fuzz Face",
  HD2_DistCompulsiveDrive: "OCD",
  HD2_DistKinkyBoost: "Kinky Boost",

  // Common reverb
  HD2_ReverbHall: "Hall",
  HD2_ReverbPlate: "Plate",
  HD2_ReverbSpring: "Spring",
  HD2_ReverbRoom: "Room",

  // Common modulation
  HD2_Chorus: "Chorus",
  HD2_MM4ScriptPhase: "Script Phase",
  HD2_Rotary122Rotary: "Leslie 122",
};

const PREFIXES = ["HD2_", "VIC_", "L6SPB_"];

function fallbackName(model: string): string {
  let s = model;
  for (const p of PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  // CamelCase → "Camel Case", but preserve runs of capitals (e.g. "EQ", "ChVol")
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

export function friendlyName(model: string): string {
  return CURATED[model] ?? catalogName(model) ?? fallbackName(model);
}

/**
 * Real-world gear the Helix model is based on (e.g. "Klon Centaur" for
 * HD2_DistMinotaur). Returns undefined when no useful mapping exists.
 * Sourced from the HelAIx catalog's BasedOn field.
 */
export function realWorldName(model: string): string | undefined {
  return catalogBasedOn(model);
}

/**
 * Derive a Helix block category from a model string.
 * Categories are what HX Edit puts in the icon label — Amp, Drive, EQ, etc.
 */
const CATEGORY_RULES: Array<[prefix: string, label: string]> = [
  ["HD2_Amp", "Amp"],
  ["HD2_Cab", "Cab"],
  ["HD2_Dist", "Drive"],
  ["HD2_Compressor", "Comp"],
  ["HD2_DM4", "Comp"],
  ["HD2_Gate", "Gate"],
  ["HD2_EQ", "EQ"],
  ["HD2_CaliQ", "EQ"],
  ["HD2_Delay", "Delay"],
  ["HD2_DL4", "Delay"],
  ["HD2_Reverb", "Reverb"],
  ["HD2_VolPan", "Volume"],
  ["HD2_Wah", "Wah"],
  ["HD2_Chorus", "Mod"],
  ["HD2_Flanger", "Mod"],
  ["HD2_Phaser", "Mod"],
  ["HD2_Tremolo", "Mod"],
  ["HD2_Vibrato", "Mod"],
  ["HD2_Rotary", "Mod"],
  ["HD2_MM4", "Mod"],
  ["HD2_Ring", "Mod"],
  ["HD2_Retro", "Mod"],
  ["HD2_Filter", "Filter"],
  ["HD2_FM4", "Filter"],
  ["HD2_Pitch", "Pitch"],
  ["HD2_PitchSynth", "Pitch"],
  ["HD2_M13", "Pitch"],
];

export function friendlyCategory(model: string): string | null {
  for (const [prefix, label] of CATEGORY_RULES) {
    if (model.startsWith(prefix)) return label;
  }
  return null;
}

/**
 * Display-ready label combining category and curated name.
 * Examples:
 *   HD2_AmpUSDoubleNrm → "Amp (US Double)"
 *   HD2_DistMinotaur   → "Drive (Klon)"
 *   HD2_VolPanGain     → "Volume (Boost)"
 *   HD2_CabMicIr_4x12Greenback25 → "Cab (4x12 Greenback)"
 *
 * Falls back to just the name when we can't derive a category.
 */
export function friendlyBlock(model: string): string {
  const category = friendlyCategory(model);
  const name = friendlyName(model);
  if (!category) return name;
  // Dedup: when the curated name already mentions the category as a word,
  // drop the parenthetical wrapper. "Simple Delay" → "Simple Delay" (not
  // "Delay (Simple Delay)"); "US Double" → "Amp (US Double)" still triggers
  // because "Amp" isn't a word in the name.
  const nameLower = name.toLowerCase();
  const catLower = category.toLowerCase();
  const wordBoundary = new RegExp(`\\b${catLower}\\b`);
  if (wordBoundary.test(nameLower)) return name;
  return `${category} (${name})`;
}

/**
 * Friendly parameter name. Most Helix param names are already legible
 * ("Drive", "Bass", "Mix"), but a few are abbreviated.
 */
const PARAM_DISPLAY: Record<string, string> = {
  ChVol: "Channel Vol",
  BiasX: "Bias X",
  LowGain: "Low",
  MidGain: "Mid",
  HighGain: "High",
};

export function friendlyParam(param: string): string {
  return PARAM_DISPLAY[param] ?? param;
}
