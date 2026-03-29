import type { Progression } from "./progressions";

const STORAGE_KEY = "chordcraft-custom-progressions";

export function loadCustomProgressions(): Progression[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomProgressions(list: Progression[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addCustomProgression(prog: Progression): Progression[] {
  const list = loadCustomProgressions();
  list.push(prog);
  saveCustomProgressions(list);
  return list;
}

export function deleteCustomProgression(id: string): Progression[] {
  const list = loadCustomProgressions().filter((p) => p.id !== id);
  saveCustomProgressions(list);
  return list;
}

/** All valid roman numerals the engine supports */
export const VALID_NUMERALS = [
  "I", "ii", "iii", "IV", "V", "vi", "vii°",
  "i", "II", "III", "iv", "v", "VI", "VII",
  "bII", "bIII", "bV", "bVI", "bVII",
  "bii", "biii", "bv", "bvi", "bvii",
];
