/**
 * Persistence for the generated-preset Library.
 *
 * Every successful AI generation (SoundPath's Design Preset + the applied
 * Match Song / Tone Discovery patches, and presets ingested from HelAIx) is
 * saved as a GeneratedPreset row holding the full .hlx payload, so a past
 * generation can be re-downloaded, reopened for editing, or re-aligned without
 * depending on a loose file still existing on disk.
 *
 * Saves are best-effort: callers wrap them so a DB hiccup never fails the
 * generation the user just waited on.
 */

import { prisma } from "./prisma";
import type { GeneratedPreset } from "@/generated/prisma/client";

export interface SavePresetInput {
  name: string;
  sourceApp?: string; // "soundpath" | "helaix"; default "soundpath"
  flow: string; // "design" | "match-song" | "tone-discovery" | "helaix"
  provider?: string | null;
  model?: string | null;
  hardwareTarget?: string | null;
  tones?: unknown; // JSON-serialized before storage
  hlx: string;
  snapshots?: unknown; // JSON-serialized before storage
  loudness?: unknown; // JSON-serialized before storage
  parentId?: string | null;
}

const asJson = (v: unknown): string | null =>
  v == null ? null : JSON.stringify(v);

export async function savePreset(input: SavePresetInput) {
  return prisma.generatedPreset.create({
    data: {
      name: input.name,
      sourceApp: input.sourceApp ?? "soundpath",
      flow: input.flow,
      provider: input.provider ?? null,
      model: input.model ?? null,
      hardwareTarget: input.hardwareTarget ?? null,
      tones: asJson(input.tones),
      hlx: input.hlx,
      snapshots: asJson(input.snapshots),
      loudness: asJson(input.loudness),
      parentId: input.parentId ?? null,
    },
  });
}

const parseJson = (v: string | null): unknown =>
  v == null ? null : safeParse(v);

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/**
 * Shape returned to clients: the JSON columns parsed back to objects. Excludes
 * the heavy `hlx` payload unless `withHlx` is set, so list views stay light.
 */
export function serializePreset(row: GeneratedPreset, withHlx = false) {
  const { hlx, tones, snapshots, loudness, ...rest } = row;
  return {
    ...rest,
    tones: parseJson(tones),
    snapshots: parseJson(snapshots),
    loudness: parseJson(loudness),
    ...(withHlx ? { hlx } : {}),
  };
}

export interface ListPresetFilter {
  sourceApp?: string;
  flow?: string;
  favorite?: boolean;
}

/** List presets newest-first, without the hlx payload. */
export async function listPresets(filter: ListPresetFilter = {}) {
  const rows = await prisma.generatedPreset.findMany({
    where: {
      sourceApp: filter.sourceApp,
      flow: filter.flow,
      favorite: filter.favorite,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => serializePreset(r));
}

export function getPreset(id: string) {
  return prisma.generatedPreset.findUnique({ where: { id } });
}

export function deletePreset(id: string) {
  return prisma.generatedPreset.delete({ where: { id } });
}
