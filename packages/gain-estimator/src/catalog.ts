/**
 * Helix catalog lookup, vendored from HelAIx.
 *
 * 367 block entries with friendly names, real-world equivalents (`BasedOn`),
 * parameter min/max schemas, and DSP cost. See ../data/CREDITS.md.
 *
 * Imported directly as JSON so webpack/Next.js can bundle it without needing
 * runtime fs access. Native fs would not work cleanly inside the Next.js
 * bundling boundary.
 */

import catalogData from "../data/helaix-catalog.json";

export type CatalogParam = {
  "@controller"?: number;
  "@min"?: number;
  "@max"?: number;
  "@snapshot_disable"?: boolean;
};

export type CatalogEntry = {
  InternalName: string;
  Name: string;
  BasedOn?: string;
  DSP_Mono?: number;
  Data?: {
    Controller_Dict?: { [param: string]: CatalogParam };
    Defaults?: Record<string, unknown>;
  };
};

const _byId: Map<string, CatalogEntry> = new Map(
  (catalogData as unknown as CatalogEntry[]).map((e) => [e.InternalName, e])
);

export function getCatalogEntry(model: string): CatalogEntry | undefined {
  return _byId.get(model);
}

export function catalogName(model: string): string | undefined {
  const e = getCatalogEntry(model);
  return e?.Name && e.Name !== model ? e.Name : undefined;
}

export function catalogBasedOn(model: string): string | undefined {
  const e = getCatalogEntry(model);
  const v = e?.BasedOn;
  if (!v || v === "Unknown" || v === "Line 6 Original") return undefined;
  return v;
}

export function catalogParamRange(
  model: string,
  param: string
): { min: number; max: number } | undefined {
  const e = getCatalogEntry(model);
  const p = e?.Data?.Controller_Dict?.[param];
  if (p && typeof p["@min"] === "number" && typeof p["@max"] === "number") {
    return { min: p["@min"], max: p["@max"] };
  }
  return undefined;
}
